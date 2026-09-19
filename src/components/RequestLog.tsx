"use client";

import { useState } from "react";
import { clearLog, useLog, type LogEntry } from "@/lib/client";
import { JEV_PRICE_PER_INPUT_TOKEN } from "@/lib/jev";

export function RequestLog() {
  const log = useLog();
  const [open, setOpen] = useState<number | null>(null);
  const done = log.filter((e) => e.response);
  const tokens = done.reduce((a, e) => a + (e.response!.usage.inputTokens ?? 0), 0);
  const answers = done.reduce((a, e) => a + Object.keys(e.response!.answers).length, 0);
  const lat = done.map((e) => e.response!.latencyMs).sort((a, b) => a - b);
  const p50 = lat[Math.floor(lat.length / 2)];
  const prov = done.map((e) => e.response!.providerMs).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
  const provP50 = prov[Math.floor(prov.length / 2)];
  const cost = done.reduce((a, e) => a + (e.response!.costUsd ?? (e.response!.usage.inputTokens ?? 0) * JEV_PRICE_PER_INPUT_TOKEN), 0);

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-line bg-surface">
      <div className="border-b border-line p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-2">Request log</h2>
          <button onClick={clearLog} className="text-[11px] text-ink-3 hover:text-ink">clear</button>
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <dt className="text-ink-3">Calls</dt><dd className="text-right font-mono tabular-nums">{log.length}</dd>
          <dt className="text-ink-3">Answers</dt><dd className="text-right font-mono tabular-nums">{answers}</dd>
          <dt className="text-ink-3">p50 latency</dt><dd className="text-right font-mono tabular-nums">{p50 ? `${Math.round(p50)} ms` : "–"}</dd>
          <dt className="text-ink-3" title="Time inside TypeSafe, excluding gateway + network">p50 model time</dt><dd className="text-right font-mono tabular-nums">{provP50 ? `${Math.round(provP50)} ms` : "–"}</dd>
          <dt className="text-ink-3">Input tokens</dt><dd className="text-right font-mono tabular-nums">{tokens.toLocaleString()}</dd>
          <dt className="text-ink-3">Session cost</dt><dd className="text-right font-mono tabular-nums">${cost.toFixed(6)}</dd>
        </dl>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {log.map((e) => (
          <li key={e.id} className="border-b border-line">
            <button onClick={() => setOpen(open === e.id ? null : e.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] hover:bg-surface-2">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.error ? "bg-[var(--status-critical)]" : e.response ? "bg-[var(--status-good)]" : "animate-pulse bg-ink-3"}`} />
              <span className="truncate text-ink">{e.widget}</span>
              <span className="text-ink-3">{Object.keys(e.request.questions).length}q</span>
              <span className="ml-auto font-mono tabular-nums text-ink-2">{e.response ? `${Math.round(e.response.latencyMs)}ms` : e.error ? "err" : "…"}</span>
            </button>
            {open === e.id && <Detail entry={e} />}
          </li>
        ))}
        {log.length === 0 && <li className="p-3 text-[11px] text-ink-3">Every call to Jev shows up here with its raw request and response.</li>}
      </ul>
    </aside>
  );
}

function Detail({ entry }: { entry: LogEntry }) {
  const block = "max-h-72 overflow-auto rounded bg-surface-2 p-2 font-mono text-[10px] leading-relaxed text-ink-2";
  return (
    <div className="space-y-2 px-3 pb-3 text-[11px]">
      <p className="text-ink-3">Request</p>
      <pre className={block}>{JSON.stringify(entry.request, null, 2)}</pre>
      <p className="text-ink-3">Response {entry.roundTripMs ? `(browser round-trip ${Math.round(entry.roundTripMs)} ms)` : ""}</p>
      <pre className={block}>{entry.error ?? JSON.stringify(entry.response, null, 2)}</pre>
    </div>
  );
}
