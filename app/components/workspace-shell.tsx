import Link from "next/link";
import type { ReactNode } from "react";

type WorkspaceShellProps = {
  active: "overview" | "strategies" | "validation" | "live";
  workspaceName?: string;
  status?: string;
  children: ReactNode;
};

const navigation = [
  { id: "overview", href: "/", icon: "◈", label: "Overview" },
  { id: "strategies", href: "/strategies", icon: "⌁", label: "Strategies" },
  { id: "validation", href: "/validation", icon: "◌", label: "Validation" },
  { id: "live", href: "/live", icon: "◉", label: "Live controls" },
] as const;

export default function WorkspaceShell({
  active,
  workspaceName = "Workspace",
  status = "Live execution locked",
  children,
}: WorkspaceShellProps) {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">A</span><span>ApexPilot</span></div>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <Link className={`nav-item ${item.id === active ? "active" : ""}`} href={item.href} key={item.id}>
              <span>{item.icon}</span> {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span><span className="status-dot" /> {status}</span>
          <button className="tenant-switcher" type="button">{workspaceName} <span>⌄</span></button>
        </div>
      </aside>
      <section className="content">{children}</section>
    </main>
  );
}
