import { createHash } from "node:crypto";

export type InvitableRole = "admin" | "trader" | "viewer";

export function hashInvitationToken(token: string) {
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) {
    throw new Error("Invitation token is invalid");
  }
  return createHash("sha256").update(token).digest("hex");
}

export function canInviteRole(role: string): role is InvitableRole {
  return role === "admin" || role === "trader" || role === "viewer";
}
