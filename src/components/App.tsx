"use client";

import { useState } from "react";
import { Exchange } from "./Exchange";
import { RequestLog } from "./RequestLog";
import { AgentPilot } from "./widgets/AgentPilot";
import { CompositeScorer } from "./widgets/CompositeScorer";
import { Guardrail } from "./widgets/Guardrail";
import { InboxTriage } from "./widgets/InboxTriage";
import { LiveRouter } from "./widgets/LiveRouter";
import { Race } from "./widgets/Race";
import { VibeCheck } from "./widgets/VibeCheck";
import { Workbench } from "./widgets/Workbench";

const WIDGETS = [
  { id: "workbench", name: "Workbench", tag: "The 3 primitives", C: Workbench },
  { id: "router", name: "Live Router", tag: "Confidence gating", C: LiveRouter },
  { id: "inbox", name: "Inbox Triage", tag: "Speculative fan-out", C: InboxTriage },
  { id: "scorer", name: "Composite Scorer", tag: "Atomic scores + code weights", C: CompositeScorer },
  { id: "agent", name: "Agent Pilot", tag: "Control flow on JSON state", C: AgentPilot },
  { id: "guardrail", name: "Guardrail", tag: "Output verification", C: Guardrail },
  { id: "vibes", name: "Vibe Check", tag: "Arbitrary spectrums", C: VibeCheck },
  { id: "race", name: "Race vs LLM", tag: "Latency & cost", C: Race },
] as const;

export function App() {
  const [active, setActive] = useState<(typeof WIDGETS)[number]["id"]>("workbench");
  const current = WIDGETS.find((w) => w.id === active)!;

  return (
    <div className="grid h-screen grid-cols-[14rem_minmax(0,1fr)_20rem]">
      <nav className="flex flex-col border-r border-line bg-surface p-3">
        <div className="mb-5 px-2 pt-1">
          <h1 className="text-lg font-semibold tracking-tight">Jev Playground</h1>
          <p className="text-[11px] leading-snug text-ink-3">
            <span className="font-mono">typesafe-ai/jev</span> via Vercel AI Gateway. A &ldquo;System One&rdquo; model: typed questions in, calibrated probabilities out.
          </p>
        </div>
        <ul className="space-y-0.5">
          {WIDGETS.map((w) => (
            <li key={w.id}>
              <button
                onClick={() => setActive(w.id)}
                className={`w-full rounded-lg px-2 py-1.5 text-left transition ${active === w.id ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2/60 hover:text-ink"}`}
              >
                <div className="text-sm">{w.name}</div>
                <div className="text-[11px] text-ink-3">{w.tag}</div>
              </button>
            </li>
          ))}
        </ul>
        <a href="https://docs.typesafe.ai/introduction" target="_blank" rel="noreferrer" className="mt-auto px-2 text-[11px] text-ink-3 hover:text-ink">
          TypeSafe docs ↗
        </a>
      </nav>
      <main className="min-h-0 overflow-y-auto p-6">
        <header className="mb-5">
          <h2 className="text-xl font-semibold">{current.name}</h2>
          <p className="text-sm text-ink-2">{current.tag}</p>
        </header>
        {/* Keep every widget mounted so state survives tab switches */}
        {WIDGETS.map(({ id, name, C }) => (
          <div key={id} hidden={id !== active}>
            <C />
            <Exchange widget={name} />
          </div>
        ))}
      </main>
      <RequestLog />
    </div>
  );
}
