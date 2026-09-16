"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Strategy = { id: string; name: string };
type ResultMetrics = {
  netPnl: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  winRatePct: number;
  profitFactor: number | null;
  tradeCount: number;
  fees: number;
  funding: number;
};
type ResultTrade = {
  side: "long" | "short";
  pnl: number;
  fees: number;
  entryTime: number;
  exitTime: number;
  exitReason?: "signal" | "end" | "liquidation" | "trailing_stop_loss" | "trailing_take_profit";
};
type RiskReview = { passed: boolean; violations: string[]; observed?: { maxDailyLossPct?: number }; };
type ValidationConfig = {
  template?: string;
  positionMode?: string;
  trailingStopLossPct?: number | null;
  trailingTakeProfitPct?: number | null;
  trailingTakeProfitActivationPct?: number | null;
  maxLeverage?: number;
  maxPositionNotional?: number;
  minLiquidationDistancePct?: number;
  maxTradesPerHour?: number;
  minTradeIntervalSeconds?: number;
};
type Run = {
  id: string;
  run_type: "paper" | "backtest";
  status: string;
  results: {
    version?: number;
    metrics?: ResultMetrics;
    equityCurve?: number[];
    equityCurveTimes?: number[];
    trades?: ResultTrade[];
    validationConfig?: ValidationConfig;
    riskReview?: RiskReview;
  } | null;
  error_message: string | null;
  created_at: string;
};

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
    const refreshTimer = window.setInterval(() => {
      void loadValidationState();
    }, 5_000);
    return () => window.clearInterval(refreshTimer);
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
                <RunRow key={run.id} run={run} />
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

function RunRow({ run }: { run: Run }) {
  const metrics = run.results?.metrics;
  const exitCounts = (run.results?.trades ?? []).reduce<Record<string, number>>((counts, trade) => {
    const reason = trade.exitReason ?? "signal";
    counts[reason] = (counts[reason] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <div className="run-entry">
      <div className="run-row">
        <span className={`run-type run-${run.run_type}`}>{run.run_type}</span>
        <strong>{run.status}</strong>
        <span>{new Date(run.created_at).toLocaleDateString()}</span>
      </div>
      {metrics && run.status === "completed" && (
        <div className="run-metrics">
          <Metric label="Return" value={`${metrics.totalReturnPct.toFixed(2)}%`} />
          <Metric label="Drawdown" value={`${metrics.maxDrawdownPct.toFixed(2)}%`} />
          <Metric label="Win rate" value={`${metrics.winRatePct.toFixed(1)}%`} />
          <Metric label="Trades" value={String(metrics.tradeCount)} />
          <Metric
            label="Daily loss"
            value={
              run.results?.riskReview?.observed?.maxDailyLossPct === undefined
                ? "—"
                : `${run.results.riskReview.observed.maxDailyLossPct.toFixed(2)}%`
            }
          />
          <Metric label="Risk review" value={run.results?.riskReview?.passed ? "Passed" : "Review"} />
        </div>
      )}
      {run.status === "completed" && run.results && (
        <details className="run-details">
          <summary>Inspect validation data</summary>
          <div className="run-detail-grid">
            <Metric label="Equity points" value={String(run.results.equityCurve?.length ?? 0)} />
            <Metric label="Closed trades" value={String(run.results.trades?.length ?? metrics?.tradeCount ?? 0)} />
            <Metric
              label="Final equity"
              value={
                run.results.equityCurve?.at(-1) === undefined
                  ? "—"
                  : run.results.equityCurve.at(-1)!.toFixed(2)
              }
            />
            <Metric
              label="Last candle"
              value={
                run.results.equityCurveTimes?.at(-1) === undefined
                  ? "—"
                  : new Date(run.results.equityCurveTimes.at(-1)!).toLocaleString()
              }
            />
          </div>
          {run.results.validationConfig && (
            <div className="trade-list">
              <span>Template: {run.results.validationConfig.template ?? "—"}</span>
              <span>Mode: {run.results.validationConfig.positionMode ?? "—"}</span>
              <span>
                Trailing: SL {run.results.validationConfig.trailingStopLossPct ?? "off"}% · TP{" "}
                {run.results.validationConfig.trailingTakeProfitPct ?? "off"}%
                {run.results.validationConfig.trailingTakeProfitActivationPct === null ||
                run.results.validationConfig.trailingTakeProfitActivationPct === undefined
                  ? ""
                  : ` · activates at ${run.results.validationConfig.trailingTakeProfitActivationPct}%`}
              </span>
              <span>
                Risk: {run.results.validationConfig.maxLeverage ?? "—"}x · cooldown{" "}
                {run.results.validationConfig.minTradeIntervalSeconds ?? "—"}s
              </span>
            </div>
          )}
          {Object.keys(exitCounts).length > 0 && (
            <div className="trade-list">
              {Object.entries(exitCounts).map(([reason, count]) => (
                <span key={reason}>{formatExitReason(reason)}: {count}</span>
              ))}
            </div>
          )}
          {run.results.trades && run.results.trades.length > 0 && (
            <div className="trade-list">
              {run.results.trades.slice(-3).map((trade, index) => (
                <span key={`${trade.entryTime}-${trade.exitTime}-${index}`}>
                  {trade.side} · {formatExitReason(trade.exitReason ?? "signal")} · {new Date(trade.exitTime).toLocaleDateString()}: {trade.pnl >= 0 ? "+" : ""}
                  {trade.pnl.toFixed(2)} PnL
                </span>
              ))}
            </div>
          )}
        </details>
      )}
      {run.status === "completed" && run.results?.riskReview && !run.results.riskReview.passed && (
        <p className="run-error">{run.results.riskReview.violations.join("; ")}</p>
      )}
      {run.status === "failed" && run.error_message && <p className="run-error">{run.error_message}</p>}
    </div>
  );
}

function formatExitReason(reason: string) {
  return reason
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function Metric({ label, value }: { label: string; value: string }) {
  return <span><small>{label}</small><strong>{value}</strong></span>;
}

function ReadinessCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "good" | "bad" | "pending" | "locked" }) {
  return <article className="readiness-card"><span className={`readiness-indicator ${tone}`} /><p>{label}</p><strong>{value}</strong><small>{detail}</small></article>;
}

function ValidationStep({ number, title, detail, state }: { number: string; title: string; detail: string; state: "next" | "locked" }) {
  return <div className={`validation-step ${state}`}><span className="step-number">{number}</span><div><strong>{title}</strong><p>{detail}</p></div><span className="step-state">{state === "next" ? "Next" : "Locked"}</span></div>;
}
