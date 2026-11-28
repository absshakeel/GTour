'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn, getApiErrorMessage, readUser, SESSION_EVENT } from '@gtour/utils';
import type { BookingDraftDto } from '@gtour/validation';
import { streamChat, type ChatTurn } from '@/lib/chat-api';
import { formatCurrency } from '@gtour/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  draft?: BookingDraftDto;
}

const GREETING =
  'Hi! I can help you find destinations, hotels, photographers, and vehicles in Bangladesh. What are you planning?';

const SUGGESTIONS = [
  'Where should I go in winter?',
  'Find me a hotel in Cox\u2019s Bazar under 5000 taka',
  'Do I need a photographer in Sylhet?',
];

/** Matches `/destinations/<id>` so the assistant knows which page is open. */
const DESTINATION_PATH = /^\/destinations\/([A-Za-z0-9_-]{6,})/;

/** Compact icon set so the widget stays dependency-free. */
function Icon({ name }: { name: 'chat' | 'close' | 'send' | 'spark' }) {
  const paths = {
    chat: <path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.4-4.6A8 8 0 1 1 21 12Z" />,
    close: <path d="M6 6l12 12M18 6L6 18" />,
    send: <path d="M4 12l16-8-6 16-3-6-7-2Z" />,
    spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-5 w-5"
    >
      {paths[name]}
    </svg>
  );
}

/**
 * Floating tourism assistant.
 *
 * Mounted once in the root layout so it is available on every page. The
 * assistant can only prepare a booking draft: the Confirm button navigates to
 * the real booking form, which the server validates again. That keeps the
 * "no booking without explicit confirmation" rule enforceable in one place.
 */
export function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: GREETING }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // The destination id grounds the answer server-side. It is read from the URL
  // rather than passed as a prop so the widget stays out of every page's data
  // fetching and cannot break a server component that does not have it.
  const destinationId = DESTINATION_PATH.exec(pathname ?? '')?.[1] ?? null;

  // `readUser` reads localStorage, which is unavailable during SSR, so the
  // signed-in state is resolved after mount and kept in sync with sign-out.
  useEffect(() => {
    const sync = () => setSignedIn(readUser() !== null);
    sync();
    window.addEventListener(SESSION_EVENT, sync);
    return () => window.removeEventListener(SESSION_EVENT, sync);
  }, []);

  // Keeps the newest message in view as tokens arrive.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, status, open]);

  // Abandons an in-flight answer when the widget closes, so the server stops
  // spending quota on a reply nobody will read.
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setBusy(false);
      setStatus(null);
    }
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setError(null);
    setInput('');

    // The draft is client-only state and never sent back to the server, so the
    // history is rebuilt from role and content alone.
    const history: ChatTurn[] = [...messages, { role: 'user' as const, content: trimmed }]
      .slice(-12)
      .map(({ role, content }) => ({ role, content }));

    setMessages((previous) => [
      ...previous,
      { role: 'user', content: trimmed },
      { role: 'assistant', content: '' },
    ]);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const appendToLast = (updater: (message: Message) => Message) => {
      setMessages((previous) => {
        const next = [...previous];
        next[next.length - 1] = updater(next[next.length - 1]);
        return next;
      });
    };

    try {
      await streamChat(
        history,
        {
          onToken: (chunk) =>
            appendToLast((message) => ({ ...message, content: message.content + chunk })),
          onStatus: (tool) =>
            setStatus(
              tool === 'prepareBookingDraft'
                ? 'Preparing your booking draft...'
                : 'Searching the platform...',
            ),
          // The draft is attached to the assistant turn that proposed it, so it
          // scrolls away with the conversation instead of floating.
          onDraft: (draft) => appendToLast((message) => ({ ...message, draft })),
          onNotice: (message) => setError(message),
          onError: (message) => setError(message),
        },
        { destinationId: destinationId ?? undefined, signal: controller.signal },
      );
    } catch (thrown) {
      if (!controller.signal.aborted) setError(getApiErrorMessage(thrown));
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        setStatus(null);
      }
      // A stream that failed before writing anything leaves an empty bubble.
      setMessages((previous) => {
        const last = previous[previous.length - 1];
        if (last?.role === 'assistant' && last.content.trim() === '' && !last.draft) {
          return previous.slice(0, -1);
        }
        return previous;
      });
    }
  }

  const suggestions = destinationId
    ? ['What is there to do here?', 'Find a hotel nearby', 'Best season to visit?']
    : SUGGESTIONS;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="gtour-chat-panel"
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-sea-700 text-white shadow-lift transition hover:bg-sea-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sea-400"
      >
        <span className="sr-only">
          {open ? 'Close the travel assistant' : 'Open the travel assistant'}
        </span>
        {open ? <Icon name="close" /> : <Icon name="chat" />}
      </button>

      {open && (
        <section
          id="gtour-chat-panel"
          aria-label="Travel assistant"
          className="fixed bottom-24 right-5 z-40 flex h-[32rem] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-3xl border border-sand-200 bg-white shadow-lift"
        >
          <header className="flex items-center gap-3 border-b border-sand-200 bg-sand-50 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sea-700 text-white">
              <Icon name="spark" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">GTour assistant</p>
              <p className="truncate text-xs text-ink-500">
                {destinationId ? 'Asking about this destination' : 'Travel help in Bangladesh'}
              </p>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    message.role === 'user' ? 'bg-sea-700 text-white' : 'bg-sand-100 text-ink-800',
                  )}
                >
                  {message.content.trim() === '' && !message.draft ? (
                    <span className="text-ink-400">Thinking…</span>
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}

                  {message.draft && <DraftCard draft={message.draft} />}
                </div>
              </div>
            ))}

            {status && <p className="text-xs text-ink-400">{status}</p>}
            {error && (
              <p role="alert" className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {error}
              </p>
            )}
          </div>

          <div className="border-t border-sand-200 px-4 py-3">
            {messages.length <= 1 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    className="rounded-pill border border-sand-300 px-3 py-1.5 text-xs text-ink-600 transition hover:border-sea-400 hover:text-sea-800"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send(input);
              }}
              className="flex items-end gap-2"
            >
              <label htmlFor="gtour-chat-input" className="sr-only">
                Your message
              </label>
              <textarea
                id="gtour-chat-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void send(input);
                  }
                }}
                rows={1}
                maxLength={1000}
                placeholder={signedIn ? 'Ask about a destination or hotel…' : 'Sign in to chat…'}
                disabled={!signedIn}
                className="max-h-28 flex-1 resize-none rounded-2xl border border-sand-300 px-3 py-2 text-sm text-ink-800 focus:border-sea-400 focus:outline-none disabled:bg-sand-50"
              />
              <button
                type="submit"
                disabled={!signedIn || busy || input.trim() === ''}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sea-700 text-white transition hover:bg-sea-800 disabled:opacity-40"
              >
                <span className="sr-only">Send</span>
                <Icon name="send" />
              </button>
            </form>

            {!signedIn && (
              <p className="mt-2 text-xs text-ink-500">
                Sign in to use the assistant. It only looks things up; it never books for you.
              </p>
            )}
          </div>
        </section>
      )}
    </>
  );
}

/**
 * A proposed booking. The Confirm action is a link to the real booking form
 * with the values prefilled as a query string; the server validates the dates,
 * availability, and price again when that form is submitted.
 */
function DraftCard({ draft }: { draft: BookingDraftDto }) {
  const params = new URLSearchParams({
    room: draft.hotel_room_id,
    check_in: draft.check_in,
    check_out: draft.check_out,
    rooms: String(draft.rooms),
    guests: String(draft.guests),
  });

  return (
    <div className="mt-3 rounded-2xl border border-sea-200 bg-white p-3 text-ink-800">
      <p className="text-xs font-semibold uppercase tracking-wide text-sea-700">Booking draft</p>
      <p className="mt-1 text-sm font-semibold">{draft.hotel_name}</p>
      <p className="text-xs text-ink-500">{draft.room_type}</p>

      <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-ink-600">
        <dt>Check-in</dt>
        <dd className="text-right font-medium">{draft.check_in}</dd>
        <dt>Check-out</dt>
        <dd className="text-right font-medium">{draft.check_out}</dd>
        <dt>Rooms</dt>
        <dd className="text-right font-medium">{draft.rooms}</dd>
        <dt>Guests</dt>
        <dd className="text-right font-medium">{draft.guests}</dd>
        <dt>Estimated total</dt>
        <dd className="text-right font-semibold text-ink-900">
          {formatCurrency(draft.estimated_total, draft.currency)}
        </dd>
      </dl>

      {draft.warning && <p className="mt-2 text-xs text-amber-700">{draft.warning}</p>}

      <a
        href={`/hotels/${draft.hotel_id}?${params.toString()}`}
        className="mt-3 inline-flex w-full items-center justify-center rounded-pill bg-sea-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-sea-800"
      >
        Review and confirm
      </a>
      <p className="mt-2 text-[11px] leading-snug text-ink-400">
        Nothing is booked yet. You confirm on the hotel page, where the price and availability are
        checked again.
      </p>
    </div>
  );
}
