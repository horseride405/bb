import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

type StrategyRow = {
  id: string;
  name: string;
  status: "draft" | "ready" | "running" | "paused" | "archived";
  mode: "paper" | "backtest" | "live";
  config: unknown;
};

type RunRow = {
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  results: unknown;
};

function strategySymbol(config: unknown) {
  if (typeof config !== "object" || config === null || Array.isArray(config)) return "Market not configured";
  const symbol = (config as Record<string, unknown>).symbol;
  return typeof symbol === "string" ? `${symbol} Futures` : "Market not configured";
}

function resultMetric(results: unknown, key: string) {
  if (typeof results !== "object" || results === null || Array.isArray(results)) return null;
  const value = (results as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="auth-state">
        <div className="auth-card">
          <span className="brand-mark">A</span>
          <p className="eyebrow">ApexPilot control plane</p>
          <h1>Sign in to your workspace</h1>
          <p>Your trading operations, validation evidence, and safety controls are available after authentication.</p>
        </div>
      </main>
    );
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const [{ data: strategies }, { data: runs }] = workspace
    ? await Promise.all([
        supabase.from("strategies").select("id, name, status, mode, config").eq("workspace_id", workspace.id).order("updated_at", { ascending: false }),
        supabase.from("strategy_runs").select("status, results").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(50),
      ])
    : [{ data: [] as StrategyRow[] }, { data: [] as RunRow[] }];

  const strategyRows = (strategies ?? []) as StrategyRow[];
  const runRows = (runs ?? []) as RunRow[];
  const completedRuns = runRows.filter((run) => run.status === "completed");
  const latestDrawdown = completedRuns.map((run) => resultMetric(run.results, "maxDrawdownPct")).find((value): value is number => value !== null);
  const metrics = [
    { label: "Paper equity", value: "Not measured", change: "Run a paper session to populate" },
    { label: "Active strategies", value: String(strategyRows.filter((strategy) => strategy.status === "running").length), change: `${strategyRows.length} total in workspace` },
    { label: "Max drawdown", value: latestDrawdown === undefined ? "Not measured" : `${latestDrawdown.toFixed(2)}%`, change: `${completedRuns.length} completed validation runs` },
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">A</span><span>ApexPilot</span></div>
        <nav aria-label="Main navigation">
          <Link className="nav-item active" href="/"><span>◈</span> Overview</Link>
          <Link className="nav-item" href="/strategies"><span>⌁</span> Strategies</Link>
          <Link className="nav-item" href="/validation"><span>◌</span> Backtests</Link>
          <Link className="nav-item" href="/validation"><span>↗</span> Paper trading</Link>
          <Link className="nav-item" href="/strategies"><span>⚙</span> Risk controls</Link>
          <Link className="nav-item" href="/live"><span>◉</span> Live controls</Link>
        </nav>
        <div className="sidebar-footer"><span><span className="status-dot" /> Live execution locked</span><button className="tenant-switcher">{workspace?.name ?? "No workspace"} <span>⌄</span></button></div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><p className="eyebrow">{workspace?.name ?? "Workspace"} / Overview</p><h1>Welcome back{user.email ? `, ${user.email.split("@")[0]}` : ""}</h1></div>
          <div className="topbar-actions"><div className="avatar">{(user.email?.[0] ?? "U").toUpperCase()}</div></div>
        </header>
        <div className="notice"><span className="notice-icon">!</span><div><strong>Live order submission is locked</strong><p>Validation and paper workflows are available; no real Binance orders can be submitted.</p></div><Link className="secondary-button" href="/live">Review controls</Link></div>
        <section className="metric-grid" aria-label="Workspace metrics">{metrics.map((metric) => <article className="metric-card" key={metric.label}><p>{metric.label}</p><strong>{metric.value}</strong><span>{metric.change}</span></article>)}</section>
        <section className="section-heading"><div><p className="eyebrow">Strategy lab</p><h2>Your strategies</h2></div><Link className="primary-button" href="/strategies">+ Create strategy</Link></section>
        {strategyRows.length === 0 ? (
          <section className="panel empty-state"><span className="empty-icon">⌁</span><strong>No strategies yet</strong><p>Create a strategy to begin validation.</p><Link className="primary-button" href="/strategies">Create your first strategy</Link></section>
        ) : (
          <section className="strategy-list">{strategyRows.map((strategy) => <article className="strategy-card" key={strategy.id}><div className="strategy-main"><div className="strategy-icon">↗</div><div><h3>{strategy.name}</h3><p>{strategySymbol(strategy.config)}</p></div></div><span className={`mode mode-${strategy.mode}`}>{strategy.mode}</span><strong className="return-value">{strategy.status}</strong><span className="strategy-status"><span className="status-dot" /> {strategy.status}</span><Link className="row-action" href="/validation" aria-label={`Open ${strategy.name}`}>→</Link></article>)}</section>
        )}
        <section className="bottom-grid">
          <article className="panel"><div className="panel-heading"><div><p className="eyebrow">Validation pipeline</p><h2>Evidence before execution</h2></div><span className="step-count">{completedRuns.length} completed</span></div><p className="panel-copy">Run historical and paper validation before requesting any controlled-live review.</p><Link className="text-button" href="/validation">Open validation center →</Link></article>
          <article className="panel risk-panel"><div className="panel-heading"><div><p className="eyebrow">Risk monitor</p><h2>Fail-closed controls</h2></div><span className="healthy-badge">Locked</span></div><div className="risk-row"><span>Live submission</span><strong>Disabled</strong></div><div className="risk-row"><span>Workspace data</span><strong>{workspace ? "Connected" : "Not configured"}</strong></div><div className="risk-row"><span>Completed runs</span><strong>{completedRuns.length}</strong></div></article>
        </section>
      </section>
    </main>
  );
}
