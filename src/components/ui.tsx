"use client";

import type { ReactNode } from "react";

export function Card({ title, subtitle, children, className = "", actions }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-4 ${className}`}>
      {(title || actions) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-ink">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Button({ children, onClick, disabled, variant = "primary", className = "", type = "button" }: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
  className?: string;
  type?: "button" | "submit";
}) {
  const styles =
    variant === "primary"
      ? "bg-accent text-white hover:brightness-110"
      : "border border-line text-ink-2 hover:text-ink hover:border-ink-3";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Chip({ children, onClick, active }: { children: ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs transition ${
        active ? "border-accent bg-accent/15 text-ink" : "border-line text-ink-2 hover:border-ink-3 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function Spinner() {
  return <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

export function Latency({ ms }: { ms?: number }) {
  if (ms === undefined) return null;
  return <span className="font-mono text-xs text-ink-2 tabular-nums">{Math.round(ms)} ms</span>;
}

export const pct = (p: number, digits = 0) => `${(p * 100).toFixed(digits)}%`;

/** A single horizontal probability bar. The winning row gets the accent fill. */
export function ProbRow({ label, p, highlight, hint }: { label: ReactNode; p: number; highlight?: boolean; hint?: string }) {
  return (
    <div className="group grid grid-cols-[minmax(0,9rem)_1fr_3.5rem] items-center gap-2 text-xs" title={hint}>
      <span className={`truncate ${highlight ? "font-medium text-ink" : "text-ink-2"}`}>{label}</span>
      <div className="h-2 rounded-full bg-track">
        <div
          className={`h-2 rounded-full transition-[width] duration-500 ${highlight ? "bg-accent" : "bg-ink-3"}`}
          style={{ width: `${Math.max(p * 100, p > 0 ? 1 : 0)}%` }}
        />
      </div>
      <span className="text-right font-mono tabular-nums text-ink-2">{pct(p, 1)}</span>
    </div>
  );
}

export function Distribution({ probabilities, labels, winner }: {
  probabilities: Record<string, number>;
  labels?: Record<string, string>;
  winner?: string;
}) {
  return (
    <div className="space-y-1.5">
      {Object.entries(probabilities).map(([key, p]) => (
        <ProbRow key={key} label={labels?.[key] ?? key} p={p} highlight={key === winner} />
      ))}
    </div>
  );
}

export type Status = "good" | "warning" | "critical";
const STATUS: Record<Status, { color: string; icon: string }> = {
  good: { color: "var(--status-good)", icon: "✓" },
  warning: { color: "var(--status-warning)", icon: "!" },
  critical: { color: "var(--status-critical)", icon: "✕" },
};

/** Status is never color alone: always icon + label. */
export function StatusBadge({ status, children }: { status: Status; children: ReactNode }) {
  const s = STATUS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium text-ink"
      style={{ borderColor: s.color, background: `color-mix(in oklab, ${s.color} 14%, transparent)` }}
    >
      <span
        className="grid h-3.5 w-3.5 place-items-center rounded-full text-[9px] font-bold text-black"
        style={{ background: s.color }}
      >
        {s.icon}
      </span>
      {children}
    </span>
  );
}

export function ConfidencePill({ value, source }: { value?: number; source?: "provider" | "computed" }) {
  if (value === undefined) return null;
  const status: Status = value >= 0.75 ? "good" : value >= 0.45 ? "warning" : "critical";
  return (
    <span title={source === "computed" ? "Computed locally as 1 − normalized entropy (provider did not return one)" : "Confidence reported by TypeSafe"}>
      <StatusBadge status={status}>
        confidence {pct(value)}
        {source === "computed" && <sup>*</sup>}
      </StatusBadge>
    </span>
  );
}

export function ErrorNote({ error }: { error?: string | null }) {
  if (!error) return null;
  if (/rate.?limit/i.test(error))
    return (
      <div className="rounded-lg border border-[var(--status-warning)] bg-[color-mix(in_oklab,var(--status-warning)_10%,transparent)] px-3 py-2 text-xs text-ink">
        <span className="font-semibold">! Rate limited:</span> AI Gateway&apos;s free tier throttles Jev requests. Wait a minute and
        retry, or add paid credits to your Vercel team to remove the limit.
      </div>
    );
  return (
    <div className="rounded-lg border border-[var(--status-critical)] bg-[color-mix(in_oklab,var(--status-critical)_10%,transparent)] px-3 py-2 text-xs text-ink">
      <span className="font-semibold">✕ Error:</span> {error}
    </div>
  );
}

export function Explainer({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-3 py-2 text-xs leading-relaxed text-ink-2">
      {children}
    </div>
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full resize-y rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent ${props.className ?? ""}`}
    />
  );
}

export function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, format = (v: number) => v.toFixed(2) }: {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <label className="grid grid-cols-[minmax(0,8rem)_1fr_3rem] items-center gap-2 text-xs text-ink-2">
      <span className="truncate">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-[var(--accent)]"
      />
      <span className="text-right font-mono tabular-nums">{format(value)}</span>
    </label>
  );
}
