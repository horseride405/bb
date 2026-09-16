import Link from "next/link";

import StrategyBuilder from "./strategy-builder";

export default function StrategiesPage() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">A</span>
          <span>ApexPilot</span>
        </div>
        <nav aria-label="Main navigation">
          <Link className="nav-item" href="/">
            <span>◈</span> Overview
          </Link>
          <Link className="nav-item active" href="/strategies">
            <span>⌁</span> Strategies
          </Link>
          <Link className="nav-item" href="/strategies">
            <span>◌</span> Backtests
          </Link>
          <Link className="nav-item" href="/strategies">
            <span>↗</span> Paper trading
          </Link>
          <Link className="nav-item" href="/strategies">
            <span>⚙</span> Risk controls
          </Link>
        </nav>
        <div className="sidebar-footer">
          <span><span className="status-dot" /> Binance testnet connected</span>
          <button className="tenant-switcher">Horseride workspace <span>⌄</span></button>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Strategy lab / New strategy</p>
            <h1>Configure a strategy</h1>
          </div>
          <Link className="secondary-button back-link" href="/">← Back to overview</Link>
        </header>
        <StrategyBuilder />
      </section>
    </main>
  );
}
