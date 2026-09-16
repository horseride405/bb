import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const workspaceId = new URL(request.url).searchParams.get("workspace_id");
  if (!workspaceId) return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("audit_events")
    .select("id, event_type, resource_type, resource_id, metadata, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "Unable to load audit history" }, { status: 500 });
  return NextResponse.json({ events: data });
}
