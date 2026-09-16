import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { canInviteRole } from "@/lib/team/invitations";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const workspaceId = new URL(request.url).searchParams.get("workspace_id");
  if (!workspaceId) return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, user_id, role, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "Unable to load workspace members" }, { status: 500 });
  return NextResponse.json({ members: data });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  let body: { workspace_id?: unknown; user_id?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (
    typeof body.workspace_id !== "string" ||
    typeof body.user_id !== "string" ||
    typeof body.role !== "string" ||
    !canInviteRole(body.role)
  ) {
    return NextResponse.json({ error: "Workspace, user, and a non-owner role are required" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("workspace_members")
    .update({ role: body.role })
    .eq("workspace_id", body.workspace_id)
    .eq("user_id", body.user_id)
    .select("workspace_id, user_id, role, created_at")
    .single();
  if (error || !data) return NextResponse.json({ error: "Only admins can update workspace roles" }, { status: 403 });
  return NextResponse.json({ member: data });
}
