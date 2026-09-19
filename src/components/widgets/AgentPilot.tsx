"use client";

import { useState } from "react";
import { ask } from "@/lib/client";
import type { EvaluateResponse, Questions } from "@/lib/jev";
import { Button, Card, Chip, ConfidencePill, Distribution, ErrorNote, Explainer, Spinner, StatusBadge, TextArea } from "../ui";

type Event = { role: "user" | "agent" | "tool"; content: string; tool?: string };
type Scenario = { name: string; goal: string; tools: Record<string, string>; events: Event[] };

const SCENARIOS: Scenario[] = [
  {
    name: "Flight rebooking",
    goal: "Rebook the user's cancelled flight to Denver for tomorrow morning.",
    tools: {
      search_flights: "Search available flights by route and date",
      book_flight: "Book a specific flight (charges the card on file)",
      lookup_booking: "Look up the user's existing booking",
    },
    events: [
      { role: "user", content: "My UA 1482 to Denver got cancelled. Can you get me on something tomorrow morning?" },
      { role: "tool", tool: "lookup_booking", content: '{"booking":"KX29PL","flight":"UA1482","status":"CANCELLED","seat_class":"economy"}' },
      { role: "tool", tool: "search_flights", content: '{"error":"503 Service Unavailable","retryable":true}' },
      { role: "tool", tool: "search_flights", content: '{"results":[{"flight":"UA 302","dep":"07:05","price_diff":0},{"flight":"UA 918","dep":"09:40","price_diff":120}]}' },
      { role: "user", content: "The 7:05 is perfect, book it." },
      { role: "tool", tool: "book_flight", content: '{"confirmation":"RT88QZ","flight":"UA 302","dep":"07:05","charged":0}' },
    ],
  },
  {
    name: "Frustrated data request",
    goal: "Produce last quarter's revenue by region for the user.",
    tools: {
      run_sql: "Run a read-only SQL query on the warehouse",
      list_tables: "List warehouse tables",
      make_chart: "Render a chart from a result set",
    },
    events: [
      { role: "user", content: "give me Q2 revenue by region" },
      { role: "tool", tool: "run_sql", content: '{"error":"relation \\"revenue\\" does not exist"}' },
      { role: "tool", tool: "list_tables", content: '{"tables":["fct_orders","dim_region","dim_customer"]}' },
      { role: "tool", tool: "run_sql", content: '{"error":"column \\"region\\" does not exist in fct_orders"}' },
      { role: "user", content: "this is taking forever. it's in dim_region, join on region_id. come on." },
      { role: "tool", tool: "run_sql", content: '{"rows":[{"region":"NA","revenue":4.1e6},{"region":"EMEA","revenue":2.7e6},{"region":"APAC","revenue":1.9e6}]}' },
    ],
  },
  {
    name: "Risky request",
    goal: "Help the user manage their cloud infrastructure.",
    tools: {
      list_instances: "List running compute instances",
      delete_instance: "Permanently delete an instance (irreversible)",
      resize_instance: "Change instance size",
    },
    events: [
      { role: "user", content: "clean up the old stuff in prod, it's costing too much" },
      { role: "tool", tool: "list_instances", content: '{"instances":[{"id":"i-01","name":"prod-db-primary","age_days":812},{"id":"i-02","name":"test-jordan-tmp","age_days":340},{"id":"i-03","name":"prod-api-3","age_days":95}]}' },
      { role: "user", content: "yeah just delete everything older than 90 days" },
    ],
  },
];

const questionsFor = (s: Scenario) =>
  ({
    next_step: {
      type: "choice",
      instructions: "Given the transcript so far, what should the agent do next?",
      criteria: {
        ...Object.fromEntries(Object.entries(s.tools).map(([k, v]) => [`call_${k}`, v])),
        retry_last_tool: "Retry the last tool call because it failed transiently",
        ask_user: "Ask the user a clarifying or confirmation question",
        answer_user: "Respond to the user with results; the goal is achieved",
        escalate: "Stop and hand off to a human operator",
      },
    },
    goal_done: { type: "boolean", instructions: "Has the goal been fully achieved?" },
    last_tool_failed: { type: "boolean", instructions: "Did the most recent tool call fail?" },
    user_frustrated: { type: "boolean", instructions: "Is the user frustrated with the agent?" },
    danger: {
      type: "score",
      instructions: "How risky or irreversible would the most likely next action be?",
      criteria: ["Harmless / read-only", "Minor, easily undone", "Costly but reversible", "Irreversible or destructive"],
    },
  }) satisfies Questions;

type Step = { event: Event; res?: EvaluateResponse; error?: string };

export function AgentPilot() {
  const [scIdx, setScIdx] = useState(0);
  const sc = SCENARIOS[scIdx];
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [inject, setInject] = useState("");
  const [showState, setShowState] = useState(false);

  const transcript = (evts: Event[]) =>
    evts.map((e) => (e.role === "tool" ? { role: "tool_result", tool: e.tool, content: e.content } : { role: e.role, content: e.content }));

  const stateFor = (evts: Event[]) => ({ goal: sc.goal, available_tools: sc.tools, transcript: transcript(evts) });

  async function push(event: Event) {
    const evts = [...steps.map((s) => s.event), event];
    const idx = steps.length;
    setSteps((s) => [...s, { event }]);
    setBusy(true);
    try {
      const res = await ask("Agent Pilot", stateFor(evts), questionsFor(sc));
      setSteps((s) => s.map((x, i) => (i === idx ? { ...x, res } : x)));
    } catch (e) {
      setSteps((s) => s.map((x, i) => (i === idx ? { ...x, error: (e as Error).message } : x)));
    } finally {
      setBusy(false);
    }
  }

  const nextScripted = sc.events[steps.filter((s) => !s.event.content.startsWith("[injected]")).length] as Event | undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Explainer>
          <b>Jev as an agent&apos;s control flow.</b> Agent loops make many small decisions: which tool next, retry or give up, ask the
          user, stop? Using a big LLM for each one is slow and expensive. Here the whole agent state is sent as <b>structured JSON</b>,
          and Jev answers five control-flow questions after every event. Watch it flag transient errors for a retry, notice when the
          user gets annoyed, and rate how risky a destructive action is.
        </Explainer>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((s, i) => (
            <Chip key={s.name} active={i === scIdx} onClick={() => { setScIdx(i); setSteps([]); }}>
              {s.name}
            </Chip>
          ))}
        </div>
        <Card title={`Goal: ${sc.goal}`} subtitle={`Tools: ${Object.keys(sc.tools).join(", ")}`}>
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-3">
                <span className="pt-0.5 font-mono text-[11px] uppercase text-ink-3">{s.event.role === "tool" ? s.event.tool : s.event.role}</span>
                <div className="space-y-2">
                  <div className={`rounded-lg px-3 py-2 text-xs ${s.event.role === "user" ? "bg-surface-2 text-ink" : "border border-line font-mono text-ink-2"}`}>
                    {s.event.content}
                  </div>
                  {!s.res && !s.error && <Spinner />}
                  <ErrorNote error={s.error} />
                  {s.res && <Decision res={s.res} />}
                </div>
              </li>
            ))}
            {steps.length === 0 && <p className="text-sm text-ink-2">Step through the trace. Jev re-evaluates after every event.</p>}
          </ol>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={() => nextScripted && push(nextScripted)} disabled={busy || !nextScripted}>
              {busy && <Spinner />} {nextScripted ? `Next event (${nextScripted.role === "tool" ? nextScripted.tool : nextScripted.role})` : "End of trace"}
            </Button>
            <Button variant="ghost" onClick={() => setSteps([])}>Reset</Button>
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={inject}
              onChange={(e) => setInject(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && inject.trim()) {
                  push({ role: "user", content: `[injected] ${inject}` });
                  setInject("");
                }
              }}
              placeholder="Inject your own user message (Enter)…"
              className="flex-1 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs text-ink outline-none focus:border-accent"
            />
          </div>
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Current state sent to Jev" actions={<Chip onClick={() => setShowState((v) => !v)}>{showState ? "hide" : "show"}</Chip>}>
          {showState ? (
            <TextArea readOnly rows={18} className="font-mono text-[11px]" value={JSON.stringify(stateFor(steps.map((s) => s.event)), null, 2)} />
          ) : (
            <p className="text-xs text-ink-2">State is a JSON object (goal, tools, transcript). Jev accepts structured state directly, so there&apos;s no prompt templating.</p>
          )}
        </Card>
        {steps.at(-1)?.res && (
          <Card title="next_step distribution" subtitle="Latest event" actions={<ConfidencePill {...steps.at(-1)!.res!.confidence.next_step} />}>
            {(() => {
              const a = steps.at(-1)!.res!.answers.next_step;
              return a.type === "choice" && a.probabilities ? <Distribution probabilities={a.probabilities} winner={a.choice} /> : null;
            })()}
          </Card>
        )}
      </div>
    </div>
  );
}

function Decision({ res }: { res: EvaluateResponse }) {
  const a = res.answers;
  const p = (k: string) => (a[k]?.type === "boolean" ? (a[k] as { probability: number }).probability : 0);
  const danger = a.danger?.type === "score" ? a.danger.score : 0;
  const next = a.next_step?.type === "choice" ? a.next_step.choice : "?";
  const conf = res.confidence.next_step?.value ?? 0;
  // Guardrail in code: destructive + not confident → force confirmation
  const gated = danger >= 2 && next.startsWith("call_") && conf < 0.95;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="text-ink-3">→</span>
      <span className="rounded-md bg-accent/20 px-2 py-0.5 font-mono text-ink">{next}</span>
      <span className="font-mono text-ink-3">{Math.round(conf * 100)}%</span>
      {gated && <StatusBadge status="critical">code override: confirm with user (danger {danger.toFixed(1)}/3)</StatusBadge>}
      {p("last_tool_failed") > 0.5 && <StatusBadge status="warning">tool failed {Math.round(p("last_tool_failed") * 100)}%</StatusBadge>}
      {p("user_frustrated") > 0.5 && <StatusBadge status="warning">user frustrated {Math.round(p("user_frustrated") * 100)}%</StatusBadge>}
      {p("goal_done") > 0.5 && <StatusBadge status="good">goal done {Math.round(p("goal_done") * 100)}%</StatusBadge>}
      {!gated && danger >= 2 && <StatusBadge status="warning">danger {danger.toFixed(1)}/3</StatusBadge>}
      <span className="ml-auto font-mono text-ink-3">{Math.round(res.latencyMs)} ms</span>
    </div>
  );
}
