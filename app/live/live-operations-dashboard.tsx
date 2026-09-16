"use client";

import { useEffect, useState } from "react";

type Workspace = { id: string; name: string };
type Operations = {
  policy: {
    live_trading_enabled: boolean;
    live_emergency_stop_active: boolean;
    kill_switch_active: boolean;
  } | null;
  accounts: Array<{
    id: string;
    name: string;
    environment: string;
    status: string;
    api_key_last4: string | null;
    last_verified_at: string | null;
    last_error: string | null;
  }>;
  approvals: Array<{
    id: string;
    strategy_id: string;
    account_connection_id: string;
    expires_at: string;
    revoked_at: string | null;
  }>;
  intents: Array<{
    id: string;
    strategy_id: string;
    side: string;
    reduce_only: boolean;
    position_notional: number;
    status: string;
    blocked_reasons: string[];
    created_at: string;
  }>;
  reconciliation: Array<{
    id: string;
    account_connection_id: string;
    observed_at: string;
    status: string;
    error_message: string | null;
  }>;
  audit: Array<{
    id: string;
    event_type: string;
    resource_type: string;
    resource_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
};

type State = "loading" | "ready" | "auth" | "error";

export default function LiveOperationsDashboard() {
  const [state, setState] = useState<State>("loading");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [operations, setOperations] = useState<Operations | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  async function load() {
    try {
      const workspacesResponse = await fetch("/api/workspaces");
      if (workspacesResponse.status === 401) {
        setState("auth");
        return;
      }
      if (!workspacesResponse.ok) {
        setState("error");
        return;
      }
      const workspacesPayload = (await workspacesResponse.json()) as { workspaces: Workspace[] };
      const firstWorkspace = workspacesPayload.workspaces[0] ?? null;
      setWorkspace(firstWorkspace);
      if (!firstWorkspace) {
        setOperations(null);
        setState("ready");
        return;
      }
      const operationsResponse = await fetch(`/api/live/operations?workspace_id=${encodeURIComponent(firstWorkspace.id)}`);
      if (!operationsResponse.ok) {
        setState("error");
        return;
      }
      setOperations((await operationsResponse.json()) as Operations);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  async function activateEmergencyStop() {
    if (!workspace) return;
    const response = await fetch("/api/live/emergency-stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: workspace.id, active: true }),
    });
    setActionMessage(response.ok ? "Emergency stop is active." : "Unable to activate the emergency stop.");
    await load();
  }

  if (state === "auth") return <div className="inline-state">Sign in to load controlled-live operations.</div>;
  if (state === "error") return <div className="inline-state error-state">Live operations could not be loaded. Check the workspace environment.</div>;
  if (state === "loading") return <div className="inline-state">Loading safety state…</div>;
  if (!workspace || !operations) return <div className="inline-state">Create or join a workspace before configuring controlled-live access.</div>;

  const latestByAccount = new Map<string, Operations["reconciliation"][number]>();
  for (const snapshot of operations.reconciliation) {
    if (!latestByAccount.has(snapshot.account_connection_id)) latestByAccount.set(snapshot.account_connection_id, snapshot);
  }
  const blockedIntents = operations.intents.filter((intent) => intent.status === "blocked").length;

  return (
    <div className="validation-page">
      <section className="validation-banner">
        <div>
          <p className="eyebrow">Controlled-live boundary</p>
          <h2>Order submission is not enabled</h2>
          <p>These controls expose account health, approvals, reconciliation, and preflight decisions. Every intent remains non-submitting.</p>
        </div>
        <span className="locked-badge">No live orders</span>
      </section>

      <section className="readiness-grid">
        <ReadinessCard label="Live trading" value={operations.policy?.live_trading_enabled ? "Enabled flag" : "Disabled"} detail="Signed order adapter is absent" tone="locked" />
        <ReadinessCard label="Emergency stop" value={operations.policy?.live_emergency_stop_active ? "Active" : "Inactive"} detail="Activation is admin-controlled" tone={operations.policy?.live_emergency_stop_active ? "good" : "bad"} />
        <ReadinessCard label="Blocked intents" value={String(blockedIntents)} detail={`${operations.intents.length} recent preflight decisions`} tone={blockedIntents > 0 ? "pending" : "good"} />
      </section>

      {actionMessage && <div className="inline-state">{actionMessage}</div>}

      <section className="workflow-grid">
        <article className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Account connections</p><h2>{operations.accounts.length} configured</h2></div>
            {!operations.policy?.live_emergency_stop_active && <button className="primary-button" type="button" onClick={() => void activateEmergencyStop()}>Activate stop</button>}
          </div>
          <div className="run-list">
            {operations.accounts.length === 0 && <div className="empty-state"><span className="empty-icon">⌁</span><p>No account metadata configured.</p></div>}
            {operations.accounts.map((account) => {
              const snapshot = latestByAccount.get(account.id);
              return (
                <div className="run-entry" key={account.id}>
                  <div className="run-row">
                    <span className={`run-type ${account.status === "connected" ? "run-paper" : "run-backtest"}`}>{account.status}</span>
                    <strong>{account.name} · {account.environment}</strong>
                    <span>{account.api_key_last4 ? `••••${account.api_key_last4}` : "No key suffix"}</span>
                  </div>
                  <div className="run-error">
                    Reconciliation: {snapshot?.status ?? "not observed"} · {snapshot?.observed_at ? new Date(snapshot.observed_at).toLocaleString() : "no snapshot"}
                    {account.last_error ? ` · ${account.last_error}` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Recent intent decisions</p><h2>{operations.intents.length} recorded</h2></div>
            <span className="healthy-badge">{operations.approvals.filter((approval) => !approval.revoked_at && Date.parse(approval.expires_at) > Date.now()).length} active approvals</span>
          </div>
          <div className="run-list">
            {operations.intents.length === 0 && <div className="empty-state"><span className="empty-icon">◎</span><p>No execution intents have been preflighted.</p></div>}
            {operations.intents.slice(0, 6).map((intent) => (
              <div className="run-entry" key={intent.id}>
                <div className="run-row">
                  <span className={`run-type ${intent.status === "blocked" ? "run-backtest" : "run-paper"}`}>{intent.status}</span>
                  <strong>{intent.side} · {intent.reduce_only ? "reduce-only" : "non-reduce"}</strong>
                  <span>{Number(intent.position_notional).toFixed(2)}</span>
                </div>
                {intent.blocked_reasons.length > 0 && <div className="run-error">{intent.blocked_reasons.join(", ")}</div>}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Immutable control history</p><h2>{operations.audit.length} recent events</h2></div>
          <span className="step-count">Tenant scoped</span>
        </div>
        <div className="run-list">
          {operations.audit.length === 0 && <div className="empty-state"><span className="empty-icon">◌</span><p>No controlled-live audit events recorded.</p></div>}
          {operations.audit.slice(0, 8).map((event) => (
            <div className="run-entry" key={event.id}>
              <div className="run-row">
                <span className="run-type run-paper">{event.event_type.replaceAll("_", " ")}</span>
                <strong>{event.resource_type}{event.resource_id ? ` · ${event.resource_id.slice(0, 8)}` : ""}</strong>
                <span>{new Date(event.created_at).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReadinessCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "good" | "bad" | "pending" | "locked" }) {
  return (
    <article className="readiness-card">
      <span className={`readiness-indicator ${tone}`} />
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
