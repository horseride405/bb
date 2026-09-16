import { NextResponse } from "next/server";

import { fetchBinanceMarkets } from "@/lib/market-data/binance";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const markets = await fetchBinanceMarkets();
    return NextResponse.json(
      {
        markets: markets.filter((market) => market.status === "TRADING"),
        source: "binance-futures-exchange-info",
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch {
    return NextResponse.json({ error: "Unable to load Binance Futures market catalog" }, { status: 502 });
  }
}
