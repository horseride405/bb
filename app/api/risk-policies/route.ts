import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

function workspaceIdFrom(request: Request) {
  return new URL(request.url).searchParams.get("workspace_id");
}

async function authenticatedClient() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return { supabase, user: error ? null : user };
}

export async function GET(request: Request) {
  const { supabase, user } = await authenticatedClient();
  const workspaceId = workspaceIdFrom(request);

  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!workspaceId) return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("risk_policies")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();

  if (error) return NextResponse.json({ error: "Unable to load risk policy" }, { status: 404 });
  return NextResponse.json({ policy: data });
}

export async function PATCH(request: Request) {
  const { supabase, user } = await authenticatedClient();
  const workspaceId = workspaceIdFrom(request);

  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!workspaceId) return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const numericFields = [
    "max_leverage",
    "max_position_notional",
    "max_daily_loss_pct",
    "max_drawdown_pct",
    "max_open_positions",
    "min_liquidation_distance_pct",
    "max_trades_per_hour",
  ] as const;
  const booleanFields = ["kill_switch_active"] as const;
  const updates: Partial<
    Record<
      (typeof numericFields)[number],
      number
    >
  > & Partial<Record<(typeof booleanFields)[number], boolean>> = {};

  for (const field of numericFields) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "number" || !Number.isFinite(body[field])) {
        return NextResponse.json({ error: `${field} must be a finite number` }, { status: 400 });
      }
      updates[field] = body[field];
    }
  }
  for (const field of booleanFields) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "boolean") {
        return NextResponse.json({ error: `${field} must be boolean` }, { status: 400 });
      }
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "At least one risk limit is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("risk_policies")
    .update(updates)
    .eq("workspace_id", workspaceId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "Unable to update risk policy" }, { status: 403 });
  return NextResponse.json({ policy: data });
}
