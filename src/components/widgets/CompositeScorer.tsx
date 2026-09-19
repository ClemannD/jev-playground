"use client";

import { useMemo, useState } from "react";
import { ask } from "@/lib/client";
import type { EvaluateResponse, Questions } from "@/lib/jev";
import { Button, Card, Chip, ErrorNote, Explainer, Latency, Slider, Spinner, TextArea } from "../ui";

type Dim = { id: string; label: string; instructions: string; levels: string[] };
type Rubric = { name: string; blurb: string; dims: Dim[]; samples: { name: string; text: string }[] };

const L5 = (a: string, b: string, c: string, d: string, e: string) => [a, b, c, d, e];

const RUBRICS: Rubric[] = [
  {
    name: "Startup pitch",
    blurb: "Would a seed investor take the meeting?",
    dims: [
      { id: "problem", label: "Problem", instructions: "How clearly is a painful, real problem described?", levels: L5("No problem stated", "Vague", "Plausible", "Clear and specific", "Urgent, well-evidenced pain") },
      { id: "market", label: "Market", instructions: "How large and well-defined is the target market?", levels: L5("Not mentioned", "Tiny or unclear", "Niche", "Sizable", "Huge and clearly defined") },
      { id: "traction", label: "Traction", instructions: "How much evidence of traction (users, revenue, growth) is there?", levels: L5("None", "Anecdotal", "Early signs", "Solid metrics", "Exceptional growth") },
      { id: "team", label: "Team", instructions: "How well-suited is the team to this problem?", levels: L5("Not mentioned", "Generic", "Relevant background", "Strong fit", "Uniquely qualified") },
      { id: "clarity", label: "Clarity", instructions: "How clear and concise is the writing?", levels: L5("Incoherent", "Rambling", "Okay", "Clear", "Crisp and memorable") },
      { id: "hype", label: "Low hype", instructions: "How free is the pitch from buzzwords and unsupported hype?", levels: L5("Pure buzzwords", "Very hypey", "Some hype", "Mostly grounded", "Entirely grounded") },
    ],
    samples: [
      { name: "Grounded", text: "We help independent veterinary clinics cut no-shows. Clinics lose ~$60k/yr to missed appointments. Our SMS + deposit tool is live in 41 clinics, $18k MRR growing 15% MoM, no-shows down 38% on average. I ran ops for a 12-clinic vet group for 6 years; my cofounder was a staff engineer at Stripe." },
      { name: "Buzzword soup", text: "We're building the AI-native, web3-enabled operating system for the future of work. Leveraging LLM agents and decentralized synergy, we will disrupt a $4 trillion TAM. Pre-launch, but the vision is massive. Team of passionate visionaries." },
      { name: "Good idea, no proof", text: "Construction sites waste tons of material because orders are done by phone and paper. We want to build an app that lets foremen order materials from their phone and tracks deliveries. We haven't started yet but we think contractors would love it." },
    ],
  },
  {
    name: "Bug report",
    blurb: "Can an engineer act on this without a follow-up?",
    dims: [
      { id: "repro", label: "Repro steps", instructions: "How complete are the steps to reproduce?", levels: L5("None", "Hint only", "Partial", "Mostly complete", "Exact, numbered steps") },
      { id: "expected", label: "Expected vs actual", instructions: "How clearly are expected and actual behavior contrasted?", levels: L5("Missing", "Implied", "One of the two", "Both stated", "Both precise") },
      { id: "env", label: "Environment", instructions: "How much environment detail (version, OS, browser, device) is given?", levels: L5("None", "Minimal", "Some", "Most relevant", "Complete") },
      { id: "evidence", label: "Evidence", instructions: "How much evidence (logs, errors, screenshots) is included?", levels: L5("None", "Described vaguely", "Paraphrased error", "Exact error text", "Logs + error + trace") },
      { id: "tone", label: "Tone", instructions: "How constructive is the tone?", levels: L5("Hostile", "Rude", "Neutral", "Constructive", "Collaborative") },
    ],
    samples: [
      { name: "Great report", text: "Export to CSV fails for dashboards with >10k rows.\nSteps: 1) Open Sales dashboard 2) Set range to 'Last 12 months' 3) Click Export → CSV.\nExpected: file downloads. Actual: spinner for ~30s then toast 'Export failed (E504)'.\nChrome 128 / macOS 15.1, app v4.12.0. Console: `POST /api/export 504 Gateway Timeout`. Works fine with 'Last 30 days'." },
      { name: "Angry one-liner", text: "export is broken AGAIN. fix it. how is this still happening" },
      { name: "Half there", text: "When I try to export my dashboard it doesn't work, it just spins for a while. I'm on Chrome I think. It was working last week." },
    ],
  },
];

const buildQuestions = (dims: Dim[]): Questions =>
  Object.fromEntries(dims.map((d) => [d.id, { type: "score", instructions: d.instructions, criteria: d.levels }]));

export function CompositeScorer() {
  const [rubricIdx, setRubricIdx] = useState(0);
  const rubric = RUBRICS[rubricIdx];
  const [text, setText] = useState(rubric.samples[0].text);
  const [weights, setWeights] = useState<Record<string, number>>(() => Object.fromEntries(rubric.dims.map((d) => [d.id, 1])));
  const [result, setResult] = useState<EvaluateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickRubric(i: number) {
    setRubricIdx(i);
    setText(RUBRICS[i].samples[0].text);
    setWeights(Object.fromEntries(RUBRICS[i].dims.map((d) => [d.id, 1])));
    setResult(null);
  }

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setResult(await ask("Composite Scorer", text, buildQuestions(rubric.dims)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Normalized 0..1 per dimension. The composite is computed here, in code, from weights you control.
  const normalized = useMemo(() => {
    if (!result) return null;
    return Object.fromEntries(
      rubric.dims.map((d) => {
        const a = result.answers[d.id];
        return [d.id, a?.type === "score" ? a.score / (d.levels.length - 1) : 0];
      }),
    );
  }, [result, rubric]);

  const composite = useMemo(() => {
    if (!normalized) return null;
    const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    return rubric.dims.reduce((acc, d) => acc + normalized[d.id] * (weights[d.id] ?? 0), 0) / total;
  }, [normalized, weights, rubric]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Explainer>
          <b>Composite scoring.</b> Asking an LLM to &ldquo;rate this pitch out of 10&rdquo; tangles several judgments into one
          opaque number. Here, Jev answers {rubric.dims.length} <i>atomic</i> Score questions in one call, and your code combines
          them. Move the weight sliders: the composite updates instantly with no new model call, because the weighting is plain
          arithmetic in your code.
        </Explainer>
        <div className="flex flex-wrap gap-2">
          {RUBRICS.map((r, i) => (
            <Chip key={r.name} active={i === rubricIdx} onClick={() => pickRubric(i)}>
              Rubric: {r.name}
            </Chip>
          ))}
        </div>
        <Card title={rubric.name} subtitle={rubric.blurb} actions={<Latency ms={result?.latencyMs} />}>
          <TextArea rows={7} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {rubric.samples.map((s) => (
              <Chip key={s.name} active={s.text === text} onClick={() => setText(s.text)}>
                {s.name}
              </Chip>
            ))}
            <Button onClick={run} disabled={loading} className="ml-auto">
              {loading && <Spinner />} Score it
            </Button>
          </div>
        </Card>
        <ErrorNote error={error} />
        <Card title="Weights" subtitle="Your business logic, not the model's">
          <div className="space-y-2">
            {rubric.dims.map((d) => (
              <Slider
                key={d.id}
                label={d.label}
                value={weights[d.id] ?? 1}
                min={0}
                max={3}
                step={0.1}
                onChange={(v) => setWeights((w) => ({ ...w, [d.id]: v }))}
                format={(v) => `×${v.toFixed(1)}`}
              />
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Composite" subtitle="Σ(weight × normalized score) / Σ weights">
          {composite === null ? (
            <p className="text-sm text-ink-2">Run a score to see the radar.</p>
          ) : (
            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-semibold tabular-nums">{Math.round(composite * 100)}</span>
              <span className="text-sm text-ink-2">/ 100</span>
            </div>
          )}
        </Card>
        {normalized && result && (
          <Card title="Profile" subtitle="Each axis is one atomic Score question">
            <Radar dims={rubric.dims} values={normalized} weights={weights} />
            <table className="mt-3 w-full text-xs">
              <thead className="text-left text-ink-3">
                <tr>
                  <th className="font-normal">Dimension</th>
                  <th className="font-normal">Level</th>
                  <th className="text-right font-normal">Score</th>
                  <th className="text-right font-normal">Conf.</th>
                </tr>
              </thead>
              <tbody>
                {rubric.dims.map((d) => {
                  const a = result.answers[d.id];
                  const s = a?.type === "score" ? a.score : 0;
                  return (
                    <tr key={d.id} className="border-t border-line text-ink-2">
                      <td className="py-1 text-ink">{d.label}</td>
                      <td className="py-1">{d.levels[Math.round(s)]}</td>
                      <td className="py-1 text-right font-mono tabular-nums">{s.toFixed(2)}/{d.levels.length - 1}</td>
                      <td className="py-1 text-right font-mono tabular-nums">
                        {result.confidence[d.id] ? `${Math.round(result.confidence[d.id].value * 100)}%` : "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}

function Radar({ dims, values, weights }: { dims: Dim[]; values: Record<string, number>; weights: Record<string, number> }) {
  const size = 320;
  const c = size / 2;
  const r = c - 56;
  const angle = (i: number) => (Math.PI * 2 * i) / dims.length - Math.PI / 2;
  const pt = (i: number, v: number) => [c + Math.cos(angle(i)) * r * v, c + Math.sin(angle(i)) * r * v] as const;
  const poly = dims.map((d, i) => pt(i, values[d.id]).join(",")).join(" ");
  const [hover, setHover] = useState<string | null>(null);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-sm" role="img" aria-label="Radar chart of dimension scores">
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          key={ring}
          points={dims.map((_, i) => pt(i, ring).join(",")).join(" ")}
          fill="none"
          stroke="var(--line)"
          strokeWidth={1}
        />
      ))}
      {dims.map((d, i) => {
        const [x, y] = pt(i, 1);
        const [lx, ly] = pt(i, 1.2);
        return (
          <g key={d.id}>
            <line x1={c} y1={c} x2={x} y2={y} stroke="var(--line)" strokeWidth={1} />
            <text
              x={lx}
              y={ly}
              textAnchor={Math.abs(lx - c) < 8 ? "middle" : lx > c ? "start" : "end"}
              dominantBaseline="middle"
              className="fill-[var(--ink-2)] text-[11px]"
              opacity={weights[d.id] === 0 ? 0.35 : 1}
            >
              {d.label}
            </text>
          </g>
        );
      })}
      <polygon points={poly} fill="color-mix(in oklab, var(--accent) 22%, transparent)" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" className="transition-all duration-500" />
      {dims.map((d, i) => {
        const [x, y] = pt(i, values[d.id]);
        return (
          <g key={d.id} onMouseEnter={() => setHover(d.id)} onMouseLeave={() => setHover(null)}>
            <circle cx={x} cy={y} r={12} fill="transparent" />
            <circle cx={x} cy={y} r={4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
            {hover === d.id && (
              <g>
                <rect x={x + 8} y={y - 22} width={96} height={20} rx={4} fill="var(--surface-2)" stroke="var(--line)" />
                <text x={x + 14} y={y - 8} className="fill-[var(--ink)] text-[11px]">
                  {d.label}: {Math.round(values[d.id] * 100)}%
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
