"use client";

import { useEffect, useRef, useState } from "react";
import { ask } from "@/lib/client";
import type { EvaluateResponse, Questions } from "@/lib/jev";
import { Card, Chip, ConfidencePill, Distribution, ErrorNote, Explainer, Latency, ProbRow, Slider, Spinner, StatusBadge, TextArea } from "../ui";

const INTENTS = {
  cancel_subscription: "Wants to cancel or downgrade their plan",
  refund: "Wants money back for a charge",
  bug_report: "Something in the product is broken",
  how_to: "Asking how to do something in the product",
  upgrade: "Interested in buying more / a bigger plan",
  small_talk: "Greeting, thanks, or chit-chat with no request",
} as const;

const HANDLERS: Record<keyof typeof INTENTS, { handler: string; risky: boolean }> = {
  cancel_subscription: { handler: "Retention flow", risky: true },
  refund: { handler: "Refund API", risky: true },
  bug_report: { handler: "Create Linear issue", risky: false },
  how_to: { handler: "Docs RAG (LLM)", risky: false },
  upgrade: { handler: "Sales handoff", risky: false },
  small_talk: { handler: "Canned reply", risky: false },
};

const QUESTIONS = {
  intent: { type: "choice", instructions: "What does the customer want?", criteria: INTENTS },
  frustration: {
    type: "score",
    instructions: "How frustrated is the customer?",
    criteria: ["Calm", "Mildly annoyed", "Frustrated", "Furious"],
  },
  wants_human: { type: "boolean", instructions: "Is the customer explicitly asking to talk to a human?" },
} as const satisfies Questions;

const EXAMPLES = [
  "how do I export my dashboard to csv?",
  "you charged me twice and I want my money back NOW",
  "thinking about moving the whole team over, what does enterprise cost?",
  "the app keeps crashing when I upload a photo",
  "I don't really use it anymore",
  "hmm",
  "can I talk to an actual person please, this bot is useless",
];

type Hist = { text: string; intent: string; conf: number; ms: number };

export function LiveRouter() {
  const [text, setText] = useState(EXAMPLES[0]);
  const [result, setResult] = useState<EvaluateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoAt, setAutoAt] = useState(0.8);
  const [riskyAt, setRiskyAt] = useState(0.92);
  const [floor, setFloor] = useState(0.45);
  const [history, setHistory] = useState<Hist[]>([]);
  const ctrl = useRef<AbortController | null>(null);
  // Don't spend a call on mount (every tab stays mounted); wait for the first edit
  const [touched, setTouched] = useState(false);
  const edit = (t: string) => {
    setTouched(true);
    setText(t);
  };

  useEffect(() => {
    if (!touched || !text.trim()) return;
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      setLoading(true);
      setError(null);
      try {
        const r = await ask("Live Router", text, QUESTIONS, c.signal);
        setResult(r);
        const intent = r.answers.intent;
        if (intent.type === "choice")
          setHistory((h) => [{ text, intent: intent.choice, conf: r.confidence.intent?.value ?? 0, ms: r.latencyMs }, ...h].slice(0, 8));
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        if (ctrl.current === c) setLoading(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [text, touched]);

  const intent = result?.answers.intent;
  const conf = result?.confidence.intent?.value;
  const frustration = result?.answers.frustration;
  const wantsHuman = result?.answers.wants_human;

  let decision: { status: "good" | "warning" | "critical"; label: string; detail: string } | null = null;
  if (intent?.type === "choice" && conf !== undefined) {
    const h = HANDLERS[intent.choice as keyof typeof HANDLERS];
    const threshold = h?.risky ? riskyAt : autoAt;
    if (wantsHuman?.type === "boolean" && wantsHuman.probability > 0.6)
      decision = { status: "critical", label: "Escalate to human", detail: "Customer asked for a person (this rule lives in code, not the model)." };
    else if (conf < floor) decision = { status: "critical", label: "Ask a clarifying question", detail: `Confidence ${Math.round(conf * 100)}% is below the ${Math.round(floor * 100)}% floor. The model is saying it doesn't know.` };
    else if (conf >= threshold) decision = { status: "good", label: `Auto-route → ${h?.handler}`, detail: `Confidence clears the ${h?.risky ? "high-stakes" : "standard"} bar of ${Math.round(threshold * 100)}%.` };
    else decision = { status: "warning", label: `Confirm first: “Sounds like ${intent.choice.replace("_", " ")}. Right?”`, detail: `Above the floor but below the ${Math.round(threshold * 100)}% ${h?.risky ? "high-stakes" : "standard"} bar.` };
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Explainer>
          <b>Intent routing + confidence gating.</b> Each keystroke (debounced to 450 ms) sends one call with three questions.
          The <i>answer</i> says what the customer wants, and the <i>confidence</i> says whether to act on it. The routing policy
          (the thresholds below) lives in code, and high-stakes actions such as refunds and cancellations need a higher bar. Try
          typing something vague and watch the distribution flatten.
        </Explainer>
        <Card title="Customer message" actions={loading ? <Spinner /> : <Latency ms={result?.latencyMs} />}>
          <TextArea rows={3} value={text} onChange={(e) => edit(e.target.value)} placeholder="Type like a customer…" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((e) => (
              <Chip key={e} onClick={() => edit(e)} active={touched && e === text}>
                {e.length > 38 ? e.slice(0, 36) + "…" : e}
              </Chip>
            ))}
          </div>
        </Card>
        {!touched && <p className="text-xs text-ink-3">Pick an example or start typing. Evaluation begins on your first edit.</p>}
        <ErrorNote error={error} />
        {decision && (
          <Card title="Routing decision">
            <StatusBadge status={decision.status}>{decision.label}</StatusBadge>
            <p className="mt-2 text-xs text-ink-2">{decision.detail}</p>
          </Card>
        )}
        <Card title="Policy (lives in your code)" subtitle="Drag these. No new API call is needed, because the decision is recomputed locally.">
          <div className="space-y-2">
            <Slider label="Floor (below → ask)" value={floor} onChange={setFloor} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Auto-act (normal)" value={autoAt} onChange={setAutoAt} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Auto-act (refund/cancel)" value={riskyAt} onChange={setRiskyAt} format={(v) => `${Math.round(v * 100)}%`} />
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        {intent?.type === "choice" && (
          <Card title="intent" subtitle="choice" actions={<ConfidencePill {...result!.confidence.intent} />}>
            {intent.probabilities && <Distribution probabilities={intent.probabilities} winner={intent.choice} />}
          </Card>
        )}
        <div className="grid grid-cols-2 gap-4">
          {frustration?.type === "score" && (
            <Card title="frustration" subtitle="score 0–3">
              <p className="text-2xl font-semibold tabular-nums">{frustration.score.toFixed(2)}</p>
              <p className="text-xs text-ink-2">{QUESTIONS.frustration.criteria[Math.round(frustration.score)]}</p>
            </Card>
          )}
          {wantsHuman?.type === "boolean" && (
            <Card title="wants_human" subtitle="boolean">
              <p className="text-2xl font-semibold tabular-nums">{Math.round(wantsHuman.probability * 100)}%</p>
              <ProbRow label="P(yes)" p={wantsHuman.probability} highlight />
            </Card>
          )}
        </div>
        {history.length > 0 && (
          <Card title="Recent evaluations">
            <ul className="space-y-1 text-xs">
              {history.map((h, i) => (
                <li key={i} className="grid grid-cols-[1fr_7rem_3rem_3.5rem] gap-2 text-ink-2">
                  <span className="truncate text-ink">{h.text}</span>
                  <span className="truncate font-mono">{h.intent}</span>
                  <span className="text-right font-mono tabular-nums">{Math.round(h.conf * 100)}%</span>
                  <span className="text-right font-mono tabular-nums">{Math.round(h.ms)}ms</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
