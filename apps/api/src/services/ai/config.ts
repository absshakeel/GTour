/**
 * Configuration for the tourism assistant.
 *
 * Everything the assistant is allowed to spend is bounded here so a single
 * visitor cannot exhaust the shared free-tier quota. The API key never leaves
 * the server: it is read from the environment and is never echoed in a
 * response, a log line, or an error message.
 */

/**
 * Google's own variable name is `GOOGLE_GENERATIVE_AI_API_KEY`; the shorter
 * aliases are accepted so an existing `.env` does not have to be rewritten.
 * `GEMINIT_API_KEY` is kept only because it is already present in deployments
 * and carries a historical typo.
 */
const API_KEY_VARS = [
  'GEMINI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINIT_API_KEY',
] as const;

/** Flash is the free tier's cheapest useful model and is fast enough to stream. */
const DEFAULT_MODEL = 'gemini-3.5-flash';

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Every limit is a getter rather than a fixed value so it reflects the
 * environment at call time. Reading them once at import would freeze the
 * defaults before `loadEnv()` has run and would make each limit untestable.
 */
export const aiConfig = {
  /** `null` when unconfigured — callers must degrade rather than crash. */
  get apiKey(): string | null {
    for (const name of API_KEY_VARS) {
      const value = process.env[name]?.trim();
      if (value) return value;
    }
    return null;
  },

  get modelId(): string {
    return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  },

  /** Turns of history the client may replay. Bounds prompt size per request. */
  get maxHistoryMessages(): number {
    return readInt('AI_MAX_HISTORY_MESSAGES', 12);
  },

  /** Upper bound on tokens the model may generate in one answer. */
  get maxOutputTokens(): number {
    return readInt('AI_MAX_OUTPUT_TOKENS', 1024);
  },

  /**
   * Wall-clock ceiling for one answer. The free tier throttles aggressively,
   * so a stalled call must fail fast instead of holding the request open.
   */
  get timeoutMs(): number {
    return readInt('AI_TIMEOUT_MS', 30_000);
  },

  /** Retrieval breadth per tool call. Keeps the injected context small. */
  get maxToolRows(): number {
    return readInt('AI_MAX_TOOL_ROWS', 5);
  },

  /**
   * How many tool round-trips one question may take. A hotel question needs
   * search → rooms, and a booking needs search → rooms → draft, so three is the
   * usable lower bound; the ceiling stops a confused model from looping.
   */
  get maxToolSteps(): number {
    return readInt('AI_MAX_TOOL_STEPS', 5);
  },

  get enabled(): boolean {
    return this.apiKey !== null;
  },
};

/** Names only — never values — so logs and docs can list what is supported. */
export const AI_API_KEY_VARS = API_KEY_VARS;
