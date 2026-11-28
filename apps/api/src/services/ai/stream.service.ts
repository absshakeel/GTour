/**
 * Streams an assistant answer to the browser as Server-Sent Events.
 *
 * The stream is framed by hand rather than by the SDK's response helper so the
 * booking draft can be a first-class event type. The visible answer is plain
 * tokens; a draft arrives as its own `draft` frame, which is what lets the UI
 * render a Confirm button without trusting anything the model wrote.
 */
import type { Response } from 'express';
import Room from '../../models/Room';
import { quoteStay } from '../availability.service';
import { normaliseStayRange } from '../../utils/dates';
import { currencyCode } from '../../config/currency';
import { aiConfig } from './config';
import { isProviderFailure, startChatStream, type ChatTurn } from './adapter.service';
import type { PreparedDraft } from './tools';

const DRAFT_TOOL = 'prepareBookingDraft';

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Turns a proposed draft into a priced draft using the same authoritative
 * quote the booking endpoint will use. The assistant never computes a price,
 * so a prompt cannot talk the model into a discount: the figure here comes
 * from the database and the availability calendar.
 */
export async function priceDraft(draft: PreparedDraft) {
  const base = {
    hotel_room_id: draft.room_id,
    hotel_id: draft.hotel_id,
    hotel_name: draft.hotel_name,
    room_type: draft.room_type,
    check_in: draft.check_in,
    check_out: draft.check_out,
    rooms: draft.rooms,
    guests: draft.guests,
    currency: currencyCode(),
  };

  try {
    const room = await Room.findById(draft.room_id);
    if (!room) {
      return { ...base, estimated_total: 0, available: false, warning: 'This room is no longer listed.' };
    }

    // Reuses the booking path's own validation, so an impossible range is
    // reported here rather than after the visitor has pressed Confirm.
    normaliseStayRange(draft.check_in, draft.check_out);
    const quote = await quoteStay(room, draft.check_in, draft.check_out, draft.rooms, draft.guests);

    return {
      ...base,
      estimated_total: quote.total,
      available: quote.available,
      warning: quote.available
        ? undefined
        : 'Those dates are not fully available. Ask the assistant for another date.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Those dates cannot be booked.';
    return { ...base, estimated_total: 0, available: false, warning: message };
  }
}

export interface StreamChatOptions {
  res: Response;
  turns: ChatTurn[];
  context?: string;
  /** Invoked once with the priced draft, if the assistant proposed one. */
  onDraft?: (draft: Awaited<ReturnType<typeof priceDraft>>) => void;
}

/**
 * Writes the SSE response. Returns a promise that settles when the stream ends
 * so tests can await completion instead of polling.
 */
export async function streamChatAnswer({ res, turns, context, onDraft }: StreamChatOptions): Promise<void> {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Stops a reverse proxy from buffering the whole answer before it arrives.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    if (!res.writableEnded) res.write(frame(event, data));
  };

  if (!aiConfig.enabled) {
    send('error', {
      code: 'AI_NOT_CONFIGURED',
      message:
        'The travel assistant is not switched on yet. You can still browse destinations and hotels from the menu.',
    });
    send('done', {});
    res.end();
    return;
  }

  const abort = new AbortController();
  // A visitor who closes the tab must stop the upstream call, otherwise the
  // free-tier quota keeps being spent on an answer nobody will read.
  res.on('close', () => abort.abort());

  // Tracked separately from a client disconnect: an abort caused by our own
  // budget must be reported, whereas a closed tab must stay silent.
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, aiConfig.timeoutMs);

  try {
    const result = startChatStream({ turns, context, abortSignal: abort.signal });
    if (!result) {
      send('error', { code: 'AI_NOT_CONFIGURED', message: 'The travel assistant is unavailable right now.' });
      send('done', {});
      return;
    }

    let draftToolResult: PreparedDraft | null = null;
    let wroteAnswer = false;

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        wroteAnswer = true;
        send('token', { text: part.text });
      } else if (part.type === 'tool-call') {
        // Lets the UI show "searching hotels..." while the answer is pending.
        send('status', { tool: part.toolName });
      } else if (part.type === 'tool-result') {
        if (part.toolName === DRAFT_TOOL && part.output && !('error' in part.output)) {
          draftToolResult = part.output as PreparedDraft;
        }
        if (part.toolName === DRAFT_TOOL && part.output && 'error' in part.output) {
          // The proposal referenced a hotel or room that does not exist.
          send('notice', { message: String((part.output as { error: string }).error) });
        }
      } else if (part.type === 'tool-error') {
        // A retrieval failure is ours, not the provider's. It is logged so the
        // cause is diagnosable and reported generically so nothing internal
        // leaks into the browser.
        // eslint-disable-next-line no-console
        console.error(`[chat] tool ${part.toolName} failed:`, part.error);
        send('notice', { message: 'Some travel details could not be loaded just now.' });
      } else if (part.type === 'error') {
        send('error', { code: 'AI_UPSTREAM_ERROR', message: providerMessage(part.error) });
      }
    }

    if (draftToolResult) {
      const draft = await priceDraft(draftToolResult);
      onDraft?.(draft);
      send('draft', draft);
    }

    // An abort on our own budget otherwise ends the stream after nothing but
    // `status` frames, which looks identical to a broken assistant.
    if (timedOut && !wroteAnswer) {
      send('error', {
        code: 'AI_TIMEOUT',
        message: 'The assistant took too long to answer. Please ask again.',
      });
    }

    send('done', {});
  } catch (error) {
    // A client that navigated away aborted the fetch; there is nobody left to
    // read an error frame, and writing to a closed socket throws.
    if (timedOut) {
      send('error', {
        code: 'AI_TIMEOUT',
        message: 'The assistant took too long to answer. Please ask again.',
      });
    } else if (!abort.signal.aborted) {
      send('error', {
        code: isProviderFailure(error) ? 'AI_UPSTREAM_ERROR' : 'AI_FAILED',
        message: providerMessage(error),
      });
    }
    send('done', {});
  } finally {
    clearTimeout(timeout);
    if (!res.writableEnded) res.end();
  }
}

/** Upstream failures become a friendly sentence; never a stack trace. */
function providerMessage(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}`.toLowerCase() : '';

  if (text.includes('quota') || text.includes('429')) {
    return 'The assistant has hit its usage limit for now. Please try again in a few minutes.';
  }
  if (text.includes('aborted') || text.includes('timeout')) {
    return 'The assistant took too long to answer. Please ask again.';
  }
  if (text.includes('api key') || text.includes('unauthorized') || text.includes('401') || text.includes('403')) {
    return 'The assistant is not configured correctly. Please try again later.';
  }
  return 'The travel assistant is temporarily unavailable. You can still browse destinations and hotels from the menu.';
}
