"use client";

import { useState } from "react";
import { ask } from "@/lib/client";
import type { EvaluateResponse, Questions } from "@/lib/jev";
import { Button, Card, Chip, ErrorNote, Explainer, Latency, Spinner, TextArea } from "../ui";

type Spectrum = { left: string; right: string };

const DEFAULT_SPECTRUMS: Spectrum[] = [
  { left: "Corporate", right: "Unhinged" },
  { left: "Boomer", right: "Gen Z" },
  { left: "Cat energy", right: "Dog energy" },
  { left: "Doomer", right: "Optimist" },
  { left: "Minimalist", right: "Maximalist" },
  { left: "Written by a human", right: "Written by an AI" },
];

const SAMPLES = [
  "Per my last email, please ensure all deliverables are aligned with Q3 synergies before EOD. Thanks in advance.",
  "ok so i just microwaved a fork on accident and honestly? character development. we move 🔥",
  "In today's fast-paced digital landscape, it's important to note that leveraging innovative solutions can unlock transformative value. Let's delve in!",
  "The garden is quiet this morning. One tomato turned red overnight. I'll wait one more day.",
];

const LEVELS = (s: Spectrum) => [
  `Strongly ${s.left}`,
  `Somewhat ${s.left}`,
  `Neither / balanced`,
  `Somewhat ${s.right}`,
  `Strongly ${s.right}`,
];

const keyOf = (s: Spectrum, i: number) => `s${i}_${s.left}_${s.right}`.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 60);

export function VibeCheck() {
  const [text, setText] = useState(SAMPLES[1]);
  const [spectrums, setSpectrums] = useState(DEFAULT_SPECTRUMS);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [res, setRes] = useState<EvaluateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    const questions: Questions = Object.fromEntries(
      spectrums.map((s, i) => [keyOf(s, i), { type: "score", instructions: `Where does this text fall between "${s.left}" and "${s.right}"?`, criteria: LEVELS(s) }]),
    );
    try {
      setRes(await ask("Vibe Check", text, questions));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-4">
        <Explainer>
          <b>Scores don&apos;t need to be serious.</b> A Score is an ordered rubric, so any spectrum you can describe in words becomes
          a measurable axis. Add your own below. Each one is another question in the <i>same</i> call. The tick shows the
          weighted-mean score, and the faint bars show the full distribution over the 5 levels, which tells you when Jev is torn.
        </Explainer>
        <Card title="Text" actions={<Latency ms={res?.latencyMs} />}>
          <TextArea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SAMPLES.map((s) => (
              <Chip key={s} active={s === text} onClick={() => setText(s)}>{s.slice(0, 28)}…</Chip>
            ))}
          </div>
        </Card>
        <Card title="Add a spectrum">
          <div className="flex gap-2">
            <input value={left} onChange={(e) => setLeft(e.target.value)} placeholder="Left pole (e.g. Sleepy)" className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs text-ink outline-none focus:border-accent" />
            <input value={right} onChange={(e) => setRight(e.target.value)} placeholder="Right pole (e.g. Caffeinated)" className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs text-ink outline-none focus:border-accent" />
            <Button
              variant="ghost"
              disabled={!left.trim() || !right.trim()}
              onClick={() => { setSpectrums((s) => [...s, { left: left.trim(), right: right.trim() }]); setLeft(""); setRight(""); }}
            >
              Add
            </Button>
          </div>
        </Card>
        <Button onClick={run} disabled={loading}>
          {loading && <Spinner />} Check the vibe ({spectrums.length} scores, 1 call)
        </Button>
        <ErrorNote error={error} />
      </div>
      <Card title="Vibe profile">
        <div className="space-y-5">
          {spectrums.map((s, i) => {
            const a = res?.answers[keyOf(s, i)];
            const score = a?.type === "score" ? a.score : null;
            const probs = a?.type === "score" ? a.probabilities : undefined;
            return (
              <div key={keyOf(s, i)}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-ink-2">{s.left}</span>
                  <button className="text-ink-3 hover:text-ink" onClick={() => setSpectrums((ss) => ss.filter((_, j) => j !== i))} aria-label="remove">×</button>
                  <span className="text-ink-2">{s.right}</span>
                </div>
                <div className="relative h-8 rounded-md bg-track">
                  {/* distribution, one column per level */}
                  <div className="absolute inset-0 grid grid-cols-5 items-end gap-[2px] px-[2px]">
                    {[0, 1, 2, 3, 4].map((lvl) => (
                      <div
                        key={lvl}
                        className="rounded-t-sm transition-[height] duration-500"
                        style={{
                          height: `${(probs?.[String(lvl)] ?? 0) * 100}%`,
                          background: lvl < 2 ? "var(--accent)" : lvl > 2 ? "var(--series-2)" : "var(--ink-3)",
                          opacity: 0.35,
                        }}
                      />
                    ))}
                  </div>
                  <div className="absolute inset-y-0 left-1/2 w-px bg-ink-3" />
                  {score !== null && (
                    <div className="absolute inset-y-[-3px] w-1 rounded bg-ink transition-[left] duration-700" style={{ left: `calc(${(score / 4) * 100}% - 2px)` }} />
                  )}
                </div>
                {score !== null && (
                  <p className="mt-1 text-center text-[11px] text-ink-2">
                    {LEVELS(s)[Math.round(score)]} <span className="font-mono text-ink-3">({score.toFixed(2)})</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
