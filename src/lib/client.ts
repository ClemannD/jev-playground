"use client";

import { useSyncExternalStore } from "react";
import type { EvaluateRequest, EvaluateResponse, Questions, JsonInput } from "./jev";

export type LogEntry = {
  id: number;
  widget: string;
  at: Date;
  request: EvaluateRequest;
  response?: EvaluateResponse;
  error?: string;
  roundTripMs?: number;
};

let entries: LogEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function upsert(entry: LogEntry) {
  const others = entries.filter((e) => e.id !== entry.id);
  entries = [entry, ...others].sort((a, b) => b.id - a.id).slice(0, 200);
  emit();
}

export function clearLog() {
  entries = [];
  emit();
}

export function useLog() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => entries,
    () => entries,
  );
}

/** Calls Jev via our API route and records the exchange in the request log. */
export async function ask<Q extends Questions>(
  widget: string,
  state: JsonInput,
  questions: Q,
  signal?: AbortSignal,
): Promise<EvaluateResponse> {
  const entry: LogEntry = { id: nextId++, widget, at: new Date(), request: { state, questions } };
  upsert(entry);
  const started = performance.now();
  try {
    const res = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state, questions }),
      signal,
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    upsert({ ...entry, response: body, roundTripMs: performance.now() - started });
    return body as EvaluateResponse;
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    upsert({ ...entry, error: aborted ? "aborted (superseded)" : String((error as Error).message ?? error) });
    throw error;
  }
}
