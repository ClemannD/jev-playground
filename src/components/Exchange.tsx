"use client";

import { useState } from "react";
import { useLog } from "@/lib/client";

/** Request and response JSON, side by side, for a widget's most recent Jev calls. */
export function Exchange({ widget }: { widget: string }) {
  const entries = useLog().filter((e) => e.widget === widget);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showMeta, setShowMeta] = useState(false);
  // Follow the newest call unless the user picked an older one
  const entry = entries.find((e) => e.id === selectedId) ?? entries[0];

  if (!entry)
    return (
      <section className="mt-6 rounded-xl border border-dashed border-line p-4 text-xs text-ink-3">
        The request and response for this widget&apos;s Jev calls will appear here.
      </section>
    );

  const response = entry.error
    ? { error: entry.error }
    : entry.response
      ? showMeta
        ? entry.response
        : { ...entry.response, providerMetadata: undefined }
      : "waiting for response…";

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-2 text-sm font-semibold">Request / response</h3>
        {entries.slice(0, 12).map((e, i) => (
          <button
            key={e.id}
            onClick={() => setSelectedId(i === 0 ? null : e.id)}
            className={`rounded-md border px-2 py-0.5 font-mono text-[11px] ${
              e.id === entry.id ? "border-accent bg-accent/15 text-ink" : "border-line text-ink-3 hover:text-ink"
            }`}
            title={e.at.toLocaleTimeString()}
          >
            {i === 0 ? "latest" : `-${i}`}
            {e.error ? " ✕" : ""}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-ink-2">
          <input type="checkbox" checked={showMeta} onChange={(e) => setShowMeta(e.target.checked)} /> include providerMetadata
        </label>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        <JsonPane
          title="Request"
          subtitle={`POST /api/evaluate → experimental_evaluate · ${Object.keys(entry.request.questions).length} questions`}
          value={entry.request}
        />
        <JsonPane
          title="Response"
          subtitle={
            entry.response
              ? `${Math.round(entry.response.latencyMs)} ms server${entry.response.providerMs ? ` · ${entry.response.providerMs} ms in model` : ""}`
              : entry.error
                ? "failed"
                : "pending"
          }
          value={response}
        />
      </div>
    </section>
  );
}

function JsonPane({ title, subtitle, value }: { title: string; subtitle: string; value: unknown }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-1 flex items-baseline gap-2 text-xs">
        <span className="font-semibold text-ink">{title}</span>
        <span className="truncate text-ink-3">{subtitle}</span>
        <button
          className="ml-auto text-[11px] text-ink-3 hover:text-ink"
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="h-80 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-ink-2">{text}</pre>
    </div>
  );
}
