import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database";

const modes = new Set(["paper", "backtest"]);

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const workspaceId = new URL(request.url).searchParams.get("workspace_id");
  let query = supabase
    .from("strategies")
    .select("id, workspace_id, name, description, status, mode, config, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (workspaceId) {
    query = query.eq("workspace_id", workspaceId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Unable to load strategies" }, { status: 500 });
  }

  return NextResponse.json({ strategies: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: {
    workspace_id?: unknown;
    name?: unknown;
    description?: unknown;
    mode?: unknown;
    config?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (
    typeof body.workspace_id !== "string" ||
    typeof body.name !== "string" ||
    typeof body.mode !== "string" ||
    !modes.has(body.mode)
  ) {
    return NextResponse.json({ error: "Workspace, name, and a paper or backtest mode are required" }, { status: 400 });
  }

  const workspaceId = body.workspace_id as string;
  const mode = body.mode as "paper" | "backtest";
  const name = body.name.trim();
  if (name.length < 2 || (body.description !== undefined && typeof body.description !== "string")) {
    return NextResponse.json({ error: "Strategy name and description must be valid" }, { status: 400 });
  }

  const config = (body.config ?? {}) as Json;
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return NextResponse.json({ error: "Strategy config must be an object" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("strategies")
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      name,
      description: body.description as string | undefined,
      mode,
      config,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Unable to create strategy" }, { status: 500 });
  }

  return NextResponse.json({ strategy: data }, { status: 201 });
}
