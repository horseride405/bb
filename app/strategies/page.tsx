import Link from "next/link";

import WorkspaceShell from "@/app/components/workspace-shell";
import StrategyBuilder from "./strategy-builder";

export default function StrategiesPage() {
  return (
    <WorkspaceShell active="strategies" status="Binance market data ready" workspaceName="Workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Strategy lab / New strategy</p>
            <h1>Configure a strategy</h1>
          </div>
          <Link className="secondary-button back-link" href="/">← Back to overview</Link>
        </header>
        <StrategyBuilder />
    </WorkspaceShell>
  );
}
