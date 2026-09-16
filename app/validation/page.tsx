import Link from "next/link";

import ValidationDashboard from "./validation-dashboard";

export default function ValidationPage() {
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
          <Link className="nav-item" href="/strategies">
            <span>⌁</span> Strategies
          </Link>
          <Link className="nav-item active" href="/validation">
            <span>◌</span> Validation
          </Link>
          <Link className="nav-item" href="/strategies">
            <span>↗</span> Paper trading
          </Link>
          <Link className="nav-item" href="/strategies">
            <span>⚙</span> Risk controls
          </Link>
        </nav>
        <div className="sidebar-footer">
          <span><span className="status-dot" /> Binance market data ready</span>
          <button className="tenant-switcher">Horseride workspace <span>⌄</span></button>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Strategy lab / Validation center</p>
            <h1>Validate before you trade</h1>
          </div>
          <Link className="secondary-button back-link" href="/strategies">← Configure strategy</Link>
        </header>
        <ValidationDashboard />
      </section>
    </main>
  );
}
