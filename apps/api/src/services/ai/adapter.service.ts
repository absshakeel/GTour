/**
 * Provider adapter for the tourism assistant.
 *
 * The rest of the API only ever talks to this module, so swapping Gemini for
 * another provider is a change in one file. Nothing here throws on an upstream
 * failure: a tourism site must still work when the AI provider is down, so the
 * controller turns every failure into a friendly streamed message.
 */
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { stepCountIs, streamText, type LanguageModel, type ToolSet } from 'ai';
import { aiConfig } from './config';
import { SYSTEM_PROMPT } from './prompt';
import { chatTools } from './tools';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

let cachedModel: LanguageModel | null = null;
let cachedKey: string | null = null;

/**
 * Builds the Gemini model once per key. The key is compared instead of a
 * boolean so a rotated key in development is picked up without a restart.
 */
export function getModel(): LanguageModel | null {
  const apiKey = aiConfig.apiKey;
  if (!apiKey) return null;
  if (cachedModel && cachedKey === apiKey) return cachedModel;

  const provider = createGoogleGenerativeAI({ apiKey });
  cachedModel = provider(aiConfig.modelId);
  cachedKey = apiKey;
  return cachedModel;
}

/** Test seam so a fake model can be injected without a network call. */
export function setModelForTesting(model: LanguageModel | null): void {
  cachedModel = model;
  cachedKey = model ? aiConfig.apiKey : null;
}

export function getTools(): ToolSet {
  return chatTools;
}

/**
 * Trims the replayed conversation to the most recent turns and drops anything
 * that is not plain user/assistant text. The client is untrusted, so this is
 * where a forged `system` turn would be stripped even if validation missed it.
 */
export function normaliseHistory(turns: ChatTurn[]): ChatTurn[] {
  return turns
    .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
    .filter((turn) => typeof turn.content === 'string' && turn.content.trim().length > 0)
    .slice(-aiConfig.maxHistoryMessages);
}

export interface StreamOptions {
  turns: ChatTurn[];
  /** Extra grounding text, such as the destination page the visitor is on. */
  context?: string;
  abortSignal?: AbortSignal;
}

/**
 * Starts a streamed answer. Returns `null` when the assistant is unconfigured,
 * which lets the controller send a clear message instead of an error.
 */
export function startChatStream({ turns, context, abortSignal }: StreamOptions) {
  const model = getModel();
  if (!model) return null;

  const messages = normaliseHistory(turns).map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  const instructions = context ? `${SYSTEM_PROMPT}\n\nCURRENT PAGE CONTEXT\n${context}` : SYSTEM_PROMPT;

  return streamText({
    model,
    instructions,
    messages,
    tools: getTools(),
    // Bounded so one question cannot loop through tools indefinitely.
    stopWhen: stepCountIs(aiConfig.maxToolSteps),
    maxOutputTokens: aiConfig.maxOutputTokens,
    abortSignal,
  });
}

/** True when a thrown error came from the provider rather than our own code. */
export function isProviderFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const text = `${error.name} ${error.message}`.toLowerCase();
  return (
    text.includes('apicallerror') ||
    text.includes('fetch failed') ||
    text.includes('timeout') ||
    text.includes('aborted') ||
    text.includes('quota') ||
    text.includes('rate limit') ||
    text.includes('429') ||
    text.includes('503')
  );
}
