import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { data, error } = await supabase
    .from("binance_account_connections")
    .select("id, name, environment, status, api_key_last4, last_verified_at, last_error, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Unable to load account connections" }, { status: 500 });
  return NextResponse.json({ accounts: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  let body: { workspace_id?: unknown; name?: unknown; environment?: unknown; api_key_last4?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (
    typeof body.workspace_id !== "string" ||
    typeof body.name !== "string" ||
    body.name.trim().length < 1 ||
    body.name.trim().length > 80 ||
    (body.environment !== "testnet" && body.environment !== "mainnet") ||
    (body.api_key_last4 !== undefined &&
      (typeof body.api_key_last4 !== "string" || !/^[A-Za-z0-9]{4}$/.test(body.api_key_last4)))
  ) {
    return NextResponse.json({ error: "Valid workspace, account name, environment, and key suffix are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("binance_account_connections")
    .insert({
      workspace_id: body.workspace_id,
      name: body.name.trim(),
      environment: body.environment,
      api_key_last4: body.api_key_last4 ?? null,
      created_by: user.id,
    })
    .select("id, name, environment, status, api_key_last4, created_at")
    .single();
  if (error) return NextResponse.json({ error: "Unable to create account connection metadata" }, { status: 400 });
  return NextResponse.json({ account: data }, { status: 201 });
}
