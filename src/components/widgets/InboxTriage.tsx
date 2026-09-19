"use client";

import { useState } from "react";
import { ask } from "@/lib/client";
import type { Answer, EvaluateResponse, Questions } from "@/lib/jev";
import { Button, Card, ErrorNote, Explainer, Spinner, StatusBadge, TextArea } from "../ui";

type Email = { from: string; subject: string; body: string };

const EMAILS: Email[] = [
  { from: "ceo@ourcompany.com", subject: "Board deck — need numbers by 3pm", body: "Can you send me the Q3 churn numbers before the board call at 3? Just the headline figure is fine." },
  { from: "security@paypa1-alerts.com", subject: "Your account has been limited", body: "We detected unusual activity. Verify your identity within 24 hours at http://paypa1-verify.co or your account will be permanently suspended." },
  { from: "newsletter@producthunt.com", subject: "Top 5 launches this week", body: "This week's top launches include an AI note-taker, a Figma plugin for gradients, and more." },
  { from: "jordan@bigcustomer.io", subject: "Re: renewal", body: "Honestly, after last month's outage we're evaluating alternatives. Can we get on a call this week to talk about the renewal and what you're doing to prevent this?" },
  { from: "mom@family.net", subject: "dinner sunday?", body: "Are you coming Sunday? Dad is making lasagna. Let me know so I can plan 😊" },
  { from: "noreply@github.com", subject: "[infra] CI failed on main", body: "Workflow 'deploy-prod' failed on main (commit 4f2a1c9). 3 jobs failed: migrate-db, smoke-tests, notify." },
  { from: "recruiter@talentsync.biz", subject: "Exciting opportunity!!", body: "Hi {first_name}, I came across your profile and think you'd be a PERFECT fit for a rockstar ninja role. Are you open to chat?" },
  { from: "alex@ourcompany.com", subject: "lunch?", body: "Thai place at 12:30? No worries if you're busy." },
];

const CATEGORIES = {
  work_urgent: "Work that needs action today",
  work_fyi: "Work-related, informational or can wait",
  customer: "From a customer or about a customer relationship",
  personal: "Friends and family",
  notification: "Automated system notifications",
  marketing: "Newsletters, promotions, recruiting spam",
  phishing: "Scam or credential-phishing attempt",
} as const;

// Speculative fan-out: ask everything we might want up front, in one call per email.
const QUESTIONS = {
  category: { type: "choice", instructions: "Which inbox category does this email belong to?", criteria: CATEGORIES },
  urgency: { type: "score", instructions: "How time-sensitive is this email for the recipient?", criteria: ["Whenever", "This week", "Today", "Within the hour"] },
  needs_reply: { type: "boolean", instructions: "Does this email need a personal reply from the recipient?" },
  phishing: { type: "boolean", instructions: "Is this a phishing or scam attempt?" },
  churn_risk: { type: "boolean", instructions: "Does this signal that a customer might leave?" },
  mood: { type: "choice", instructions: "What is the sender's emotional tone?", criteria: { warm: null, neutral: null, stressed: null, upset: null, pushy: null } },
} as const satisfies Questions;

type Row = { email: Email; res?: EvaluateResponse; error?: string; loading?: boolean };

const prob = (a?: Answer) => (a?.type === "boolean" ? a.probability : 0);
const priority = (r?: EvaluateResponse) => {
  if (!r) return -1;
  const u = r.answers.urgency?.type === "score" ? r.answers.urgency.score / 3 : 0;
  // Code decides what "priority" means. The model only supplies the atoms.
  return (1 - prob(r.answers.phishing)) * (0.5 * u + 0.3 * prob(r.answers.needs_reply) + 0.2 * prob(r.answers.churn_risk));
};

export function InboxTriage() {
  const [rows, setRows] = useState<Row[]>(EMAILS.map((email) => ({ email })));
  const [wall, setWall] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [sorted, setSorted] = useState(true);
  const [sequential, setSequential] = useState(false);
  const running = rows.some((r) => r.loading);

  async function triageAll(list = rows) {
    setWall(null);
    setRows(list.map((r) => ({ ...r, loading: true, error: undefined })));
    const start = performance.now();
    const triageOne = async (r: Row, i: number) => {
      try {
        const res = await ask("Inbox Triage", `From: ${r.email.from}\nSubject: ${r.email.subject}\n\n${r.email.body}`, QUESTIONS);
        setRows((rs) => rs.map((x, j) => (j === i ? { ...x, res, loading: false } : x)));
      } catch (e) {
        setRows((rs) => rs.map((x, j) => (j === i ? { ...x, error: (e as Error).message, loading: false } : x)));
      }
    };
    if (sequential) for (const [i, r] of list.entries()) await triageOne(r, i);
    else await Promise.all(list.map(triageOne));
    setWall(performance.now() - start);
  }

  function addCustom() {
    if (!custom.trim()) return;
    const [first, ...rest] = custom.trim().split("\n");
    const next = [{ email: { from: "you@test.dev", subject: first, body: rest.join("\n") || first } }, ...rows];
    setRows(next);
    setCustom("");
    triageAll(next);
  }

  const done = rows.filter((r) => r.res);
  const sumLatency = done.reduce((a, r) => a + (r.res?.latencyMs ?? 0), 0);
  const tokens = done.reduce((a, r) => a + (r.res?.usage.inputTokens ?? 0), 0);
  const view = sorted ? [...rows].sort((a, b) => priority(b.res) - priority(a.res)) : rows;

  return (
    <div className="space-y-4">
      <Explainer>
        <b>Speculative fan-out.</b> Every email gets {Object.keys(QUESTIONS).length} questions in <i>one</i> call, including
        speculative ones such as &ldquo;churn risk?&rdquo; that only matter for some emails. Jev evaluates them in parallel,
        so extra questions cost very little latency. All {rows.length} emails are also sent concurrently. The priority ranking
        is a formula in your code: <code className="font-mono">(1−P(phish)) × (0.5·urgency + 0.3·P(reply) + 0.2·P(churn))</code>.
      </Explainer>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => triageAll()} disabled={running}>
          {running && <Spinner />} Triage inbox ({rows.length} calls {sequential ? "one at a time" : "in parallel"})
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-ink-2" title="AI Gateway's free tier rate-limits bursts">
          <input type="checkbox" checked={sequential} onChange={(e) => setSequential(e.target.checked)} /> One at a time (free-tier friendly)
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <input type="checkbox" checked={sorted} onChange={(e) => setSorted(e.target.checked)} /> Sort by priority
        </label>
        {wall !== null && (
          <span className="text-xs text-ink-2">
            Wall clock <b className="font-mono text-ink">{Math.round(wall)} ms</b> · sum of server latencies{" "}
            <span className="font-mono">{Math.round(sumLatency)} ms</span> · {done.length * Object.keys(QUESTIONS).length} answers ·{" "}
            <span className="font-mono">{tokens}</span> input tokens
          </span>
        )}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="text-left text-ink-3">
              <tr>
                <th className="pb-2 font-normal">Email</th>
                <th className="pb-2 font-normal">Category</th>
                <th className="pb-2 font-normal">Mood</th>
                <th className="pb-2 font-normal">Urgency</th>
                <th className="pb-2 text-right font-normal">Reply?</th>
                <th className="pb-2 text-right font-normal">Phish?</th>
                <th className="pb-2 text-right font-normal">Churn?</th>
                <th className="pb-2 text-right font-normal">Priority</th>
                <th className="pb-2 text-right font-normal">ms</th>
              </tr>
            </thead>
            <tbody>
              {view.map((r) => {
                const a = r.res?.answers;
                const phish = prob(a?.phishing);
                return (
                  <tr key={r.email.subject + r.email.from} className="border-t border-line align-top">
                    <td className="max-w-[18rem] py-2 pr-3">
                      <div className="truncate font-medium text-ink">{r.email.subject}</div>
                      <div className="truncate text-ink-3">{r.email.from}</div>
                    </td>
                    {r.loading ? (
                      <td colSpan={8} className="py-2 text-ink-3"><Spinner /></td>
                    ) : r.error ? (
                      <td colSpan={8} className="py-2"><ErrorNote error={r.error} /></td>
                    ) : !a ? (
                      <td colSpan={8} className="py-2 text-ink-3">untriaged</td>
                    ) : (
                      <>
                        <td className="py-2">
                          {a.category?.type === "choice" && (
                            <span className="font-mono text-ink">{a.category.choice}</span>
                          )}
                          <div className="text-ink-3">{r.res!.confidence.category ? `${Math.round(r.res!.confidence.category.value * 100)}% conf` : ""}</div>
                        </td>
                        <td className="py-2 font-mono text-ink-2">{a.mood?.type === "choice" && a.mood.choice}</td>
                        <td className="py-2 text-ink-2">
                          {a.urgency?.type === "score" && <UrgencyMeter score={a.urgency.score} />}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums">{Math.round(prob(a.needs_reply) * 100)}%</td>
                        <td className="py-2 text-right">
                          {phish > 0.5 ? <StatusBadge status="critical">{Math.round(phish * 100)}%</StatusBadge> : <span className="font-mono tabular-nums text-ink-2">{Math.round(phish * 100)}%</span>}
                        </td>
                        <td className="py-2 text-right">
                          {prob(a.churn_risk) > 0.5 ? <StatusBadge status="warning">{Math.round(prob(a.churn_risk) * 100)}%</StatusBadge> : <span className="font-mono tabular-nums text-ink-2">{Math.round(prob(a.churn_risk) * 100)}%</span>}
                        </td>
                        <td className="py-2 text-right font-mono font-semibold tabular-nums text-ink">{Math.round(priority(r.res) * 100)}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-ink-3">{Math.round(r.res!.latencyMs)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Add your own email" subtitle="First line = subject, the rest = body. Adds it to the list and re-triages everything.">
        <TextArea rows={3} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={"URGENT: invoice overdue\nPlease wire $4,950 to the new account below today…"} />
        <Button onClick={addCustom} disabled={running || !custom.trim()} className="mt-2">Add &amp; triage</Button>
      </Card>
    </div>
  );
}

function UrgencyMeter({ score }: { score: number }) {
  const labels = QUESTIONS.urgency.criteria;
  return (
    <div className="w-28">
      <div className="h-1.5 rounded-full bg-track">
        <div className="h-1.5 rounded-full bg-accent" style={{ width: `${(score / 3) * 100}%` }} />
      </div>
      <div className="mt-0.5 text-ink-3">{labels[Math.round(score)]}</div>
    </div>
  );
}
