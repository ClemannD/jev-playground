"use client";

import { useState } from "react";
import { ask } from "@/lib/client";
import { JEV_PRICE_PER_INPUT_TOKEN, type EvaluateResponse } from "@/lib/jev";
import { Button, Card, Chip, Distribution, ErrorNote, Explainer, Spinner } from "../ui";

// $ per token from the AI Gateway model list (input, output)
const LLMS: Record<string, [number, number]> = {
  "openai/gpt-5.4-nano": [2e-7, 1.25e-6],
  "anthropic/claude-haiku-4.5": [1e-6, 5e-6],
  "google/gemini-3.5-flash-lite": [3e-7, 2.5e-6],
  "openai/gpt-5-mini": [2.5e-7, 2e-6],
};

const TASKS: { name: string; state: string; instructions: string; options: Record<string, string> }[] = [
  {
    name: "Ticket routing",
    state: "Hey, since your update this morning none of our webhooks are firing. We've lost about 200 orders. Please help ASAP.",
    instructions: "Which team should handle this?",
    options: { billing: "Payments and invoices", engineering: "Bugs, outages, integrations", sales: "Pricing and upgrades", success: "Onboarding and how-to questions" },
  },
  {
    name: "Content moderation",
    state: "lol this ref is blind, somebody get this man some glasses 🤓 worst call of the season",
    instructions: "How should this comment be moderated?",
    options: { allow: "Normal discussion, including mild trash talk", warn: "Borderline; add a warning", remove: "Harassment, hate, or threats" },
  },
  {
    name: "Agent next step",
    state: "User asked to book a table for 4 at 7pm. Tool search_restaurants returned 3 options. User replied: 'the italian one looks good'.",
    instructions: "What should the agent do next?",
    options: { book: "Call the booking tool for the Italian restaurant", search_again: "Search for more restaurants", ask_user: "Ask the user a clarifying question", finish: "Tell the user it's done" },
  },
];

type Round = { jev?: EvaluateResponse; jevMs?: number; llm?: { text: string; latencyMs: number; usage: { inputTokens?: number; outputTokens?: number }; providerMs?: number; costUsd?: number }; llmMs?: number; error?: string };

export function Race() {
  const [taskIdx, setTaskIdx] = useState(0);
  const task = TASKS[taskIdx];
  const [model, setModel] = useState(Object.keys(LLMS)[0]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [running, setRunning] = useState(false);

  async function race(n: number) {
    setRunning(true);
    setRounds([]);
    for (let i = 0; i < n; i++) {
      const round: Round = {};
      const t0 = performance.now();
      await Promise.all([
        ask("Race vs LLM", task.state, { answer: { type: "choice", instructions: task.instructions, criteria: task.options } })
          .then((r) => { round.jev = r; round.jevMs = performance.now() - t0; })
          .catch((e) => { round.error = `Jev: ${(e as Error).message}`; }),
        fetch("/api/race", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, state: task.state, instructions: task.instructions, options: task.options }),
        })
          .then(async (r) => {
            const body = await r.json();
            if (!r.ok) throw new Error(body.error);
            round.llm = body;
            round.llmMs = performance.now() - t0;
          })
          .catch((e) => { round.error = `${round.error ? round.error + " · " : ""}LLM: ${(e as Error).message}`; }),
      ]);
      setRounds((rs) => [...rs, round]);
    }
    setRunning(false);
  }

  const ok = rounds.filter((r) => r.jevMs && r.llmMs);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const jevAvg = avg(ok.map((r) => r.jevMs!));
  const llmAvg = avg(ok.map((r) => r.llmMs!));
  // Prefer the gateway-reported cost; fall back to list prices
  const jevCost = avg(ok.map((r) => r.jev!.costUsd ?? (r.jev!.usage.inputTokens ?? 0) * JEV_PRICE_PER_INPUT_TOKEN));
  const [pin, pout] = LLMS[model];
  const llmCost = avg(ok.map((r) => r.llm!.costUsd ?? (r.llm!.usage.inputTokens ?? 0) * pin + (r.llm!.usage.outputTokens ?? 0) * pout));
  const jevModel = avg(ok.map((r) => r.jev!.providerMs ?? 0));
  const llmModel = avg(ok.map((r) => r.llm!.providerMs ?? 0));
  const agree = ok.filter((r) => r.jev!.answers.answer.type === "choice" && r.llm!.text.includes((r.jev!.answers.answer as { choice: string }).choice)).length;
  const maxMs = Math.max(jevAvg, llmAvg, 1);
  const last = ok.at(-1);

  return (
    <div className="space-y-4">
      <Explainer>
        <b>Jev vs a general-purpose LLM on the same decision.</b> Both get the same state, question, and options, fired at the same
        instant. The LLM has to generate text that you then parse. Jev returns a typed answer with a full distribution.
        Latency is measured end to end from the browser. Cost uses AI Gateway list prices (Jev: $0.042 per 1M input tokens, output
        free). TypeSafe&apos;s own claim is &ldquo;up to 193× faster, 444× cheaper&rdquo;, so see what you get.
      </Explainer>
      <div className="flex flex-wrap items-center gap-2">
        {TASKS.map((t, i) => (
          <Chip key={t.name} active={i === taskIdx} onClick={() => { setTaskIdx(i); setRounds([]); }}>
            {t.name}
          </Chip>
        ))}
        <select value={model} onChange={(e) => setModel(e.target.value)} className="ml-auto rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-ink">
          {Object.keys(LLMS).map((m) => <option key={m}>{m}</option>)}
        </select>
        <Button onClick={() => race(1)} disabled={running}>{running && <Spinner />} Race once</Button>
        <Button variant="ghost" onClick={() => race(5)} disabled={running}>Race ×5</Button>
      </div>

      <Card title={task.instructions} subtitle={task.state}>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {Object.entries(task.options).map(([k, v]) => (
            <span key={k} className="rounded-md border border-line px-2 py-0.5 text-ink-2"><b className="font-mono text-ink">{k}</b> · {v}</span>
          ))}
        </div>
      </Card>

      {rounds.some((r) => r.error) && <ErrorNote error={rounds.find((r) => r.error)?.error} />}

      {ok.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card title="Average latency" subtitle={`${ok.length} round${ok.length > 1 ? "s" : ""}, browser round-trip`} className="md:col-span-2">
            {[["Jev", jevAvg, "var(--accent)"], [model, llmAvg, "var(--series-2)"]].map(([name, ms, color]) => (
              <div key={name as string} className="mb-3 grid grid-cols-[12rem_1fr_4.5rem] items-center gap-3 text-xs">
                <span className="truncate font-mono text-ink">{name}</span>
                <div className="h-3 rounded-full bg-track">
                  <div className="h-3 rounded-full transition-[width] duration-700" style={{ width: `${((ms as number) / maxMs) * 100}%`, background: color as string }} />
                </div>
                <span className="text-right font-mono tabular-nums text-ink">{Math.round(ms as number)} ms</span>
              </div>
            ))}
            {jevModel > 0 && llmModel > 0 && (
              <p className="mb-3 text-xs text-ink-2">
                Time inside the model provider only (excluding gateway and network): Jev{" "}
                <b className="font-mono text-ink">{Math.round(jevModel)} ms</b> vs {model}{" "}
                <b className="font-mono text-ink">{Math.round(llmModel)} ms</b> ({(llmModel / jevModel).toFixed(1)}×).
              </p>
            )}
            <p className="text-sm text-ink-2">
              End to end, Jev was <b className="text-ink">{(llmAvg / jevAvg).toFixed(1)}×</b> faster and roughly{" "}
              <b className="text-ink">{jevCost > 0 ? `${Math.round(llmCost / jevCost)}×` : "∞×"}</b> cheaper per call (
              <span className="font-mono">${jevCost.toExponential(1)}</span> vs <span className="font-mono">${llmCost.toExponential(1)}</span>).
              Agreement: {agree}/{ok.length}.
            </p>
          </Card>
          <Card title="What you get back">
            {last && (
              <div className="space-y-3 text-xs">
                <div>
                  <p className="mb-1 text-ink-3">{model} says:</p>
                  <code className="block rounded bg-surface-2 px-2 py-1 font-mono text-ink">&quot;{last.llm!.text}&quot;</code>
                  <p className="mt-1 text-ink-3">A string. You parse it and hope.</p>
                </div>
                <div>
                  <p className="mb-1 text-ink-3">Jev says:</p>
                  {last.jev!.answers.answer.type === "choice" && last.jev!.answers.answer.probabilities && (
                    <Distribution probabilities={last.jev!.answers.answer.probabilities} winner={last.jev!.answers.answer.choice} />
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
