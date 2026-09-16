"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Strategy = { id: string; name: string };
type Run = { id: string; run_type: "paper" | "backtest"; status: string; created_at: string };

type LoadState = "loading" | "ready" | "auth" | "error";

export default function ValidationDashboard() {
  const [state, setState] = useState<LoadState>("loading");
  const [marketReady, setMarketReady] = useState(false);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);

  useEffect(() => {
    async function loadValidationState() {
      try {
        const [strategiesResponse, candlesResponse] = await Promise.all([
          fetch("/api/strategies"),
          fetch("/api/market-data/candles?symbol=BTCUSDT&interval=15m&limit=1"),
        ]);

        if (strategiesResponse.status === 401) {
          setState("auth");
          return;
        }
        if (!strategiesResponse.ok || !candlesResponse.ok) {
          setState("error");
          return;
        }

        const strategiesPayload = (await strategiesResponse.json()) as { strategies: Strategy[] };
        setMarketReady(true);
        const firstStrategy = strategiesPayload.strategies[0] ?? null;
        setStrategy(firstStrategy);

        if (firstStrategy) {
          const runsResponse = await fetch(`/api/strategies/${firstStrategy.id}/runs`);
          if (runsResponse.ok) {
            const runsPayload = (await runsResponse.json()) as { runs: Run[] };
            setRuns(runsPayload.runs);
          }
        }
        setState("ready");
      } catch {
        setState("error");
      }
    }

    void loadValidationState();
  }, []);

  return (
    <div className="validation-page">
      <section className="validation-banner">
        <div>
          <p className="eyebrow">Safety gate</p>
          <h2>Live execution is locked</h2>
          <p>Every strategy must produce evidence in backtest and paper trading before any live mode can be reviewed.</p>
        </div>
        <span className="locked-badge">Locked by default</span>
      </section>

      <section className="readiness-grid">
        <ReadinessCard label="Market data" value={state === "loading" ? "Checking…" : marketReady ? "Connected" : "Unavailable"} detail="Binance Futures public candles" tone={marketReady ? "good" : state === "error" ? "bad" : "pending"} />
        <ReadinessCard label="Validation worker" value="Queue ready" detail="Paper and backtest runs" tone="good" />
        <ReadinessCard label="Live execution" value="Disabled" detail="Requires risk approval" tone="locked" />
      </section>

      {state === "auth" && <div className="inline-state">Sign in to load workspace strategies and validation runs.</div>}
      {state === "error" && <div className="inline-state error-state">Validation services could not be reached. Try again after checking the workspace environment.</div>}

      <section className="workflow-grid">
        <article className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Required workflow</p><h2>Evidence pipeline</h2></div>
            <span className="step-count">0 / 4 complete</span>
          </div>
          <div className="validation-steps">
            <ValidationStep number="1" title="Historical backtest" detail="Fees, funding, slippage, and liquidation model" state="next" />
            <ValidationStep number="2" title="Out-of-sample test" detail="Walk-forward validation on unseen data" state="locked" />
            <ValidationStep number="3" title="Paper trading" detail="Live market data with no real orders" state="locked" />
            <ValidationStep number="4" title="Risk review" detail="Workspace limits and emergency controls" state="locked" />
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Workspace activity</p><h2>{strategy ? strategy.name : "No strategy selected"}</h2></div>
            {strategy && <span className="healthy-badge">{runs.length} runs</span>}
          </div>
          {runs.length > 0 ? (
            <div className="run-list">
              {runs.slice(0, 4).map((run) => (
                <div className="run-row" key={run.id}>
                  <span className={`run-type run-${run.run_type}`}>{run.run_type}</span>
                  <strong>{run.status}</strong>
                  <span>{new Date(run.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state"><span className="empty-icon">◌</span><p>No validation runs yet.</p><Link className="text-button" href="/strategies">Configure a strategy →</Link></div>
          )}
        </article>
      </section>
    </div>
  );
}

function ReadinessCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "good" | "bad" | "pending" | "locked" }) {
  return <article className="readiness-card"><span className={`readiness-indicator ${tone}`} /><p>{label}</p><strong>{value}</strong><small>{detail}</small></article>;
}

function ValidationStep({ number, title, detail, state }: { number: string; title: string; detail: string; state: "next" | "locked" }) {
  return <div className={`validation-step ${state}`}><span className="step-number">{number}</span><div><strong>{title}</strong><p>{detail}</p></div><span className="step-state">{state === "next" ? "Next" : "Locked"}</span></div>;
}
