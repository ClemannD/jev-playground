"use client";

import { useMemo, useState } from "react";
import { ask } from "@/lib/client";
import { parseStateInput, type EvaluateResponse, type Question, type Questions } from "@/lib/jev";
import { Button, Card, Chip, ConfidencePill, Distribution, ErrorNote, Explainer, Latency, ProbRow, Spinner, TextArea, pct } from "../ui";

type Draft = {
  key: number;
  id: string;
  type: Question["type"];
  instructions: string;
  /** choice: "key: description" per line; score: one level per line (low → high); boolean: "true: …" / "false: …" */
  criteria: string;
};

type Preset = { name: string; state: string; questions: Omit<Draft, "key">[] };

const PRESETS: Preset[] = [
  {
    name: "Restaurant review",
    state:
      "Came for my anniversary. The pasta was honestly the best I've had outside Italy, but we waited 50 minutes for a table despite having a reservation and the host just shrugged. Probably won't be back, which is a shame.",
    questions: [
      { id: "sentiment", type: "choice", instructions: "What is the overall sentiment of the review?", criteria: "positive: Mostly praise\nmixed: Both strong praise and strong complaints\nnegative: Mostly complaints" },
      { id: "food_quality", type: "score", instructions: "How does the reviewer rate the food?", criteria: "Terrible\nBelow average\nFine\nGood\nExceptional" },
      { id: "will_return", type: "boolean", instructions: "Does the reviewer intend to come back?", criteria: "" },
      { id: "needs_manager", type: "boolean", instructions: "Should a manager personally respond to this review?", criteria: "true: A service failure that a personal apology could fix\nfalse: Routine feedback" },
    ],
  },
  {
    name: "Support ticket",
    state:
      "Hi, I was charged twice for my Pro subscription this month (order #8812 and #8813). Can you refund one of them? Thanks!",
    questions: [
      { id: "department", type: "choice", instructions: "Which team should handle this ticket?", criteria: "billing: Payments, refunds, invoices\ntechnical: Bugs, outages, errors\naccount: Login, profile, permissions\nsales: Upgrades, pricing questions" },
      { id: "urgency", type: "score", instructions: "How urgent is this ticket?", criteria: "Can wait a week\nWithin a few days\nToday\nImmediately" },
      { id: "polite", type: "boolean", instructions: "Is the customer polite?", criteria: "" },
    ],
  },
  {
    name: "JSON state (order)",
    state: JSON.stringify(
      {
        order: { id: "A-2291", total_usd: 1899, items: ["MacBook Pro 14"], shipping: "overnight" },
        customer: { account_age_days: 1, previous_orders: 0, email: "xk29fj@tempmail.io" },
        payment: { card_country: "RO", ip_country: "US", billing_matches_shipping: false },
      },
      null,
      2,
    ),
    questions: [
      { id: "fraud_risk", type: "score", instructions: "How likely is this order to be fraudulent?", criteria: "Very low\nLow\nModerate\nHigh\nVery high" },
      { id: "action", type: "choice", instructions: "What should the system do with this order?", criteria: "approve: Ship normally\nhold: Hold for manual review\nverify: Ask the customer for extra verification\ndecline: Decline the order" },
      { id: "disposable_email", type: "boolean", instructions: "Does the customer appear to use a disposable email address?", criteria: "" },
    ],
  },
];

let draftKey = 1;
const withKeys = (qs: Omit<Draft, "key">[]): Draft[] => qs.map((q) => ({ ...q, key: draftKey++ }));

function toQuestion(d: Draft): Question {
  const lines = d.criteria.split("\n").map((l) => l.trim()).filter(Boolean);
  if (d.type === "choice") {
    const criteria: Record<string, string | null> = {};
    for (const line of lines) {
      const idx = line.indexOf(":");
      if (idx === -1) criteria[line] = null;
      else criteria[line.slice(0, idx).trim()] = line.slice(idx + 1).trim() || null;
    }
    return { type: "choice", instructions: d.instructions, criteria };
  }
  if (d.type === "score") return { type: "score", instructions: d.instructions, criteria: lines };
  const criteria: { true?: string; false?: string } = {};
  for (const line of lines) {
    const m = line.match(/^(true|false)\s*:\s*(.+)$/i);
    if (m) criteria[m[1].toLowerCase() as "true" | "false"] = m[2];
  }
  return { type: "boolean", instructions: d.instructions, ...(Object.keys(criteria).length ? { criteria } : {}) };
}

const PLACEHOLDER: Record<Question["type"], string> = {
  choice: "option_key: description\nanother_option: description",
  score: "Lowest level\nMiddle level\nHighest level",
  boolean: "(optional)\ntrue: what yes means\nfalse: what no means",
};

export function Workbench() {
  const [state, setState] = useState(PRESETS[0].state);
  const [drafts, setDrafts] = useState<Draft[]>(() => withKeys(PRESETS[0].questions));
  const [result, setResult] = useState<EvaluateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const questions = useMemo<Questions>(
    () => Object.fromEntries(drafts.filter((d) => d.id.trim()).map((d) => [d.id.trim(), toQuestion(d)])),
    [drafts],
  );
  const parsedState = useMemo(() => parseStateInput(state), [state]);

  const update = (key: number, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setResult(await ask("Workbench", parsedState, questions));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const code = `import { experimental_evaluate as evaluate } from "ai";

const { answers } = await evaluate({
  model: "typesafe-ai/jev",
  state: ${JSON.stringify(parsedState, null, 2).replace(/\n/g, "\n  ")},
  questions: ${JSON.stringify(questions, null, 2).replace(/\n/g, "\n  ")},
});`;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Explainer>
          Jev doesn&apos;t write text. You hand it a <b>state</b> (text or JSON) and a set of typed <b>questions</b>, and it
          returns a <b>probability distribution</b> for each one. All questions are evaluated in parallel and independently,
          in a single call. There are three primitives: <b>choice</b> (pick one option), <b>score</b> (a rating on an ordered
          rubric) and <b>boolean</b> (P(yes), which TypeSafe calls a &ldquo;Noul&rdquo;).
        </Explainer>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Chip
              key={p.name}
              onClick={() => {
                setState(p.state);
                setDrafts(withKeys(p.questions));
                setResult(null);
              }}
            >
              {p.name}
            </Chip>
          ))}
        </div>

        <Card title="State" subtitle={typeof parsedState === "string" ? "Sent as plain text" : "Parsed as JSON and sent as structured state"}>
          <TextArea rows={6} value={state} onChange={(e) => setState(e.target.value)} className="font-mono text-xs" />
        </Card>

        {drafts.map((d) => (
          <Card key={d.key}>
            <div className="mb-2 flex gap-2">
              <input
                value={d.id}
                onChange={(e) => update(d.key, { id: e.target.value.replace(/\s/g, "_") })}
                className="w-40 rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-xs text-ink outline-none focus:border-accent"
                placeholder="question_id"
              />
              <select
                value={d.type}
                onChange={(e) => update(d.key, { type: e.target.value as Question["type"] })}
                className="rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-ink"
              >
                <option value="choice">choice</option>
                <option value="score">score</option>
                <option value="boolean">boolean (Noul)</option>
              </select>
              <button
                className="ml-auto text-xs text-ink-3 hover:text-ink"
                onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}
              >
                remove
              </button>
            </div>
            <TextArea rows={1} value={d.instructions} onChange={(e) => update(d.key, { instructions: e.target.value })} placeholder="Instructions / the question" />
            <TextArea
              rows={d.type === "boolean" ? 2 : 4}
              value={d.criteria}
              onChange={(e) => update(d.key, { criteria: e.target.value })}
              placeholder={PLACEHOLDER[d.type]}
              className="mt-2 font-mono text-xs"
            />
          </Card>
        ))}

        <div className="flex flex-wrap gap-2">
          {(["choice", "score", "boolean"] as const).map((t) => (
            <Button
              key={t}
              variant="ghost"
              onClick={() =>
                setDrafts((ds) => [...ds, { key: draftKey++, id: `q${ds.length + 1}`, type: t, instructions: "", criteria: "" }])
              }
            >
              + {t}
            </Button>
          ))}
          <Button onClick={run} disabled={loading || !Object.keys(questions).length} className="ml-auto">
            {loading && <Spinner />} Ask Jev ({Object.keys(questions).length} questions, 1 call)
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <ErrorNote error={error} />
        {result && (
          <div className="flex items-center gap-4 text-xs text-ink-2">
            <span>
              Server latency <Latency ms={result.latencyMs} />
            </span>
            <span className="font-mono">
              {result.usage.inputTokens ?? "?"} in / {result.usage.outputTokens ?? "?"} out tokens
            </span>
          </div>
        )}
        {result &&
          Object.entries(result.answers).map(([id, a]) => (
            <Card
              key={id}
              title={<span className="font-mono">{id}</span>}
              subtitle={a.type}
              actions={<ConfidencePill {...result.confidence[id]} />}
            >
              {a.type === "choice" && (
                <>
                  <p className="mb-2 text-lg font-semibold">{a.choice}</p>
                  {a.probabilities && <Distribution probabilities={a.probabilities} winner={a.choice} />}
                </>
              )}
              {a.type === "score" && (
                <ScoreView
                  score={a.score}
                  probabilities={a.probabilities}
                  levels={questions[id]?.type === "score" ? questions[id].criteria : []}
                />
              )}
              {a.type === "boolean" && (
                <>
                  <p className="mb-2 text-lg font-semibold">
                    {a.probability >= 0.5 ? "Yes" : "No"}{" "}
                    <span className="text-sm font-normal text-ink-2">P(yes) = {pct(a.probability, 1)}</span>
                  </p>
                  <ProbRow label="P(yes)" p={a.probability} highlight />
                </>
              )}
            </Card>
          ))}
        {!result && !error && (
          <Card>
            <p className="text-sm text-ink-2">Answers show up here. Click <b>Ask Jev</b>.</p>
          </Card>
        )}
        <Card
          title="Equivalent AI SDK code"
          actions={<Chip onClick={() => setShowCode((s) => !s)}>{showCode ? "hide" : "show"}</Chip>}
        >
          {showCode ? (
            <pre className="max-h-96 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-ink-2">{code}</pre>
          ) : (
            <p className="text-xs text-ink-2">This is the exact <code>experimental_evaluate</code> call the current form produces.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

export function ScoreView({ score, probabilities, levels }: { score: number; probabilities?: Record<string, number>; levels: readonly unknown[] }) {
  const max = Math.max(levels.length - 1, 1);
  const nearest = Math.round(score);
  return (
    <div>
      <p className="mb-1 text-lg font-semibold">
        {score.toFixed(2)} <span className="text-sm font-normal text-ink-2">/ {max} → &ldquo;{String(levels[nearest] ?? nearest)}&rdquo;</span>
      </p>
      <div className="relative mb-3 h-2 rounded-full bg-track">
        <div className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded bg-accent" style={{ left: `calc(${(score / max) * 100}% - 2px)` }} />
      </div>
      {probabilities && (
        <div className="space-y-1.5">
          {Object.entries(probabilities).map(([k, p]) => (
            <ProbRow key={k} label={`${k} · ${String(levels[Number(k)] ?? "")}`} p={p} highlight={Number(k) === nearest} />
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-ink-3">The score is the probability-weighted mean across levels, so it can fall between them.</p>
    </div>
  );
}
