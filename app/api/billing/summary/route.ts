import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getPlanEntitlements } from "@/lib/billing/entitlements";
import { getCurrentUsagePeriod } from "@/lib/billing/usage";

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
  if (!workspaceId) {
    return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
  }

  const period = getCurrentUsagePeriod();
  const [subscriptionResult, usageResult] = await Promise.all([
    supabase
      .from("workspace_subscriptions")
      .select("workspace_id, plan, status, current_period_start, current_period_end")
      .eq("workspace_id", workspaceId)
      .single(),
    supabase
      .from("workspace_usage_periods")
      .select("validation_runs, active_strategies, connected_accounts, period_start, period_end")
      .eq("workspace_id", workspaceId)
      .eq("period_start", period.periodStart)
      .eq("period_end", period.periodEnd)
      .maybeSingle(),
  ]);
  if (subscriptionResult.error || !subscriptionResult.data) {
    return NextResponse.json({ error: "Billing subscription not found" }, { status: 404 });
  }
  if (usageResult.error) {
    return NextResponse.json({ error: "Unable to load workspace usage" }, { status: 500 });
  }
  return NextResponse.json({
    subscription: subscriptionResult.data,
    entitlements: getPlanEntitlements(subscriptionResult.data.plan),
    usage: usageResult.data ?? {
      validation_runs: 0,
      active_strategies: 0,
      connected_accounts: 0,
      period_start: period.periodStart,
      period_end: period.periodEnd,
    },
  });
}
