import Link from "next/link";

import LiveOperationsDashboard from "./live-operations-dashboard";

export default function LivePage() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">A</span>
          <span>ApexPilot</span>
        </div>
        <nav aria-label="Main navigation">
          <Link className="nav-item" href="/"><span>◈</span> Overview</Link>
          <Link className="nav-item" href="/strategies"><span>⌁</span> Strategies</Link>
          <Link className="nav-item" href="/validation"><span>◌</span> Validation</Link>
          <Link className="nav-item active" href="/live"><span>↗</span> Live controls</Link>
        </nav>
        <div className="sidebar-footer">
          <span><span className="status-dot" /> Controlled-live foundation</span>
          <button className="tenant-switcher">Horseride workspace <span>⌄</span></button>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Workspace / Controlled-live operations</p>
            <h1>Safety controls</h1>
          </div>
          <Link className="secondary-button back-link" href="/validation">← Validation center</Link>
        </header>
        <LiveOperationsDashboard />
      </section>
    </main>
  );
}
