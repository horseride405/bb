import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { canInviteRole } from "@/lib/team/invitations";
import { createClient } from "@/lib/supabase/server";
import { hashInvitationToken } from "@/lib/team/invitations";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const workspaceId = new URL(request.url).searchParams.get("workspace_id");
  if (!workspaceId) return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
  const { data, error } = await supabase
    .from("workspace_invitations")
    .select("id, workspace_id, email, role, expires_at, accepted_at, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Unable to load invitations" }, { status: 500 });
  return NextResponse.json({ invitations: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  let body: { workspace_id?: unknown; email?: unknown; role?: unknown; expires_in_days?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (
    typeof body.workspace_id !== "string" ||
    typeof body.email !== "string" ||
    typeof body.role !== "string" ||
    !canInviteRole(body.role)
  ) {
    return NextResponse.json({ error: "Workspace, email, and an inviteable role are required" }, { status: 400 });
  }
  const email = body.email.trim().toLowerCase();
  const days = typeof body.expires_in_days === "number" ? body.expires_in_days : 7;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !Number.isInteger(days) || days < 1 || days > 30) {
    return NextResponse.json({ error: "Use a valid email and an expiry between 1 and 30 days" }, { status: 400 });
  }
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await supabase
    .from("workspace_invitations")
    .insert({
      workspace_id: body.workspace_id,
      email,
      role: body.role,
      token_digest: hashInvitationToken(token),
      invited_by: user.id,
      expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
    })
    .select("id, workspace_id, email, role, expires_at, created_at")
    .single();
  if (error) {
    const status = error.code === "23505" ? 409 : 403;
    return NextResponse.json({ error: status === 409 ? "A pending invitation already exists" : "Only workspace admins can invite members" }, { status });
  }
  return NextResponse.json({ invitation: data, token }, { status: 201 });
}
