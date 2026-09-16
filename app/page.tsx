import Link from "next/link";

const metrics = [
  { label: "Paper equity", value: "$25,000.00", change: "+2.84%" },
  { label: "Active strategies", value: "3", change: "1 running" },
  { label: "Max drawdown", value: "4.12%", change: "Within limit" },
];

const strategies = [
  {
    name: "BTC Momentum",
    market: "BTCUSDT Perpetual",
    mode: "Paper",
    returnValue: "+8.42%",
    status: "Running",
  },
  {
    name: "ETH Mean Reversion",
    market: "ETHUSDT Perpetual",
    mode: "Backtest",
    returnValue: "+5.17%",
    status: "Ready",
  },
  {
    name: "Funding Guard",
    market: "Multi-market",
    mode: "Draft",
    returnValue: "—",
    status: "Needs review",
  },
];

export default function Home() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">A</span>
          <span>ApexPilot</span>
        </div>
        <nav aria-label="Main navigation">
          <Link className="nav-item active" href="/">
            <span>◈</span> Overview
          </Link>
          <Link className="nav-item" href="/strategies">
            <span>⌁</span> Strategies
          </Link>
          <Link className="nav-item" href="/validation">
            <span>◌</span> Backtests
          </Link>
          <Link className="nav-item" href="/validation">
            <span>↗</span> Paper trading
          </Link>
          <Link className="nav-item" href="/strategies">
            <span>⚙</span> Risk controls
          </Link>
          <Link className="nav-item" href="/live">
            <span>◉</span> Live controls
          </Link>
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" /> Binance testnet connected
          <button className="tenant-switcher">Horseride workspace <span>⌄</span></button>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Workspace / Overview</p>
            <h1>Good morning, Horseride</h1>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Notifications">⌁</button>
            <div className="avatar">H</div>
          </div>
        </header>

        <div className="notice">
          <span className="notice-icon">!</span>
          <div>
            <strong>Paper trading is active</strong>
            <p>Strategies use live Binance market data without placing real orders.</p>
          </div>
          <button className="secondary-button">Review safety checklist</button>
        </div>

        <section className="metric-grid" aria-label="Workspace metrics">
          {metrics.map((metric) => (
            <article className="metric-card" key={metric.label}>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <span>{metric.change}</span>
            </article>
          ))}
        </section>

        <section className="section-heading">
          <div>
            <p className="eyebrow">Strategy lab</p>
            <h2>Your strategies</h2>
          </div>
          <Link className="primary-button" href="/strategies">+ Create strategy</Link>
        </section>

        <section className="strategy-list">
          {strategies.map((strategy) => (
            <article className="strategy-card" key={strategy.name}>
              <div className="strategy-main">
                <div className="strategy-icon">↗</div>
                <div>
                  <h3>{strategy.name}</h3>
                  <p>{strategy.market}</p>
                </div>
              </div>
              <span className={`mode mode-${strategy.mode.toLowerCase()}`}>{strategy.mode}</span>
              <strong className="return-value">{strategy.returnValue}</strong>
              <span className="strategy-status"><span className="status-dot" /> {strategy.status}</span>
              <button className="row-action" aria-label={`Open ${strategy.name}`}>→</button>
            </article>
          ))}
        </section>

        <section className="bottom-grid">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Validation pipeline</p>
                <h2>Next recommended step</h2>
              </div>
              <span className="step-count">2 of 4</span>
            </div>
            <p className="panel-copy">
              Run an out-of-sample backtest for BTC Momentum before increasing its paper allocation.
            </p>
            <div className="progress-track"><span /></div>
            <button className="text-button">Open validation plan →</button>
          </article>
          <article className="panel risk-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Risk monitor</p>
                <h2>All controls healthy</h2>
              </div>
              <span className="healthy-badge">Healthy</span>
            </div>
            <div className="risk-row"><span>Daily loss limit</span><strong>0.8% / 3.0%</strong></div>
            <div className="risk-row"><span>Open exposure</span><strong>18% / 40%</strong></div>
            <div className="risk-row"><span>Data freshness</span><strong>320ms</strong></div>
          </article>
        </section>
      </section>
    </main>
  );
}
