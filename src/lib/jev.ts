// Shared (server + client) types and helpers for talking to Jev.

export type JsonInput = string | Readonly<Record<string, unknown>> | readonly unknown[];

export type ChoiceQuestion = {
  type: "choice";
  instructions: JsonInput;
  criteria: Readonly<Record<string, JsonInput | null>>;
};
export type ScoreQuestion = {
  type: "score";
  instructions: JsonInput;
  criteria: readonly (JsonInput | null)[];
};
export type BooleanQuestion = {
  type: "boolean";
  instructions: JsonInput;
  criteria?: { readonly true?: JsonInput | null; readonly false?: JsonInput | null };
};
export type Question = ChoiceQuestion | ScoreQuestion | BooleanQuestion;
export type Questions = Readonly<Record<string, Question>>;

export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities?: Record<string, number>;
};
export type ScoreAnswer = {
  type: "score";
  score: number;
  probabilities?: Record<string, number>;
};
export type BooleanAnswer = { type: "boolean"; probability: number };
export type Answer = ChoiceAnswer | ScoreAnswer | BooleanAnswer;

export type EvaluateRequest = { state: JsonInput; questions: Questions };

export type EvaluateResponse = {
  answers: Record<string, Answer>;
  /** Per-question confidence (choice/score only). */
  confidence: Record<string, { value: number; source: "provider" | "computed" }>;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  latencyMs: number;
  /** Time spent inside TypeSafe itself, per the gateway's routing metadata. */
  providerMs?: number;
  /** Gateway-reported market cost in USD. */
  costUsd?: number;
  providerMetadata?: unknown;
  warnings?: unknown[];
};

/** Jev on AI Gateway: $0.042 / 1M input tokens, output is free. */
export const JEV_PRICE_PER_INPUT_TOKEN = 0.042 / 1_000_000;

/** 1 - normalized entropy: 1 = all mass on one option, 0 = uniform. */
export function entropyConfidence(probs: Record<string, number>): number {
  const values = Object.values(probs);
  if (values.length < 2) return 1;
  const h = values.reduce((acc, p) => (p > 0 ? acc - p * Math.log(p) : acc), 0);
  return Math.max(0, Math.min(1, 1 - h / Math.log(values.length)));
}

/**
 * TypeSafe returns a `confidence` on choice/score answers. Through the AI SDK it
 * lands somewhere in providerMetadata, so search for it rather than hard-code
 * the shape: either `{ [id]: { confidence } }` or `{ confidence: { [id] } }`.
 */
export function findProviderConfidence(meta: unknown, id: string): number | undefined {
  const seen = new Set<unknown>();
  const visit = (node: unknown): number | undefined => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    const obj = node as Record<string, unknown>;
    const byId = obj[id] as Record<string, unknown> | undefined;
    if (byId && typeof byId === "object" && typeof byId.confidence === "number") return byId.confidence;
    const conf = obj.confidence as Record<string, unknown> | undefined;
    if (conf && typeof conf === "object" && typeof conf[id] === "number") return conf[id] as number;
    for (const v of Object.values(obj)) {
      const found = visit(v);
      if (found !== undefined) return found;
    }
  };
  return visit(meta);
}

type GatewayMeta = {
  cost?: string;
  marketCost?: string;
  routing?: { modelAttempts?: { providerAttempts?: { startTime?: number; endTime?: number; success?: boolean }[] }[] };
};

/** Pulls provider time and cost out of AI Gateway's providerMetadata. */
export function gatewayStats(meta: unknown): { providerMs?: number; costUsd?: number } {
  const gw = (meta as { gateway?: GatewayMeta } | undefined)?.gateway;
  if (!gw) return {};
  const attempt = gw.routing?.modelAttempts
    ?.flatMap((m) => m.providerAttempts ?? [])
    .find((a) => a.success && a.startTime && a.endTime);
  const cost = Number(gw.marketCost ?? gw.cost);
  return {
    providerMs: attempt ? attempt.endTime! - attempt.startTime! : undefined,
    costUsd: Number.isFinite(cost) ? cost : undefined,
  };
}

export function parseStateInput(raw: string): JsonInput {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through to plain text
    }
  }
  return raw;
}
