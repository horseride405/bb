import Link from "next/link";

import WorkspaceShell from "@/app/components/workspace-shell";
import ValidationDashboard from "./validation-dashboard";

export default function ValidationPage() {
  return (
    <WorkspaceShell active="validation" status="Binance market data ready" workspaceName="Workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Strategy lab / Validation center</p>
            <h1>Validate before you trade</h1>
          </div>
          <Link className="secondary-button back-link" href="/strategies">← Configure strategy</Link>
        </header>
        <ValidationDashboard />
    </WorkspaceShell>
  );
}
