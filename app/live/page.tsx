import Link from "next/link";

import WorkspaceShell from "@/app/components/workspace-shell";
import LiveOperationsDashboard from "./live-operations-dashboard";

export default function LivePage() {
  return (
    <WorkspaceShell active="live" status="Controlled-live foundation" workspaceName="Workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Workspace / Controlled-live operations</p>
            <h1>Safety controls</h1>
          </div>
          <Link className="secondary-button back-link" href="/validation">← Validation center</Link>
        </header>
        <LiveOperationsDashboard />
    </WorkspaceShell>
  );
}
