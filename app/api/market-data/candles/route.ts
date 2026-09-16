import { NextResponse } from "next/server";

import { fetchBinanceCandles } from "@/lib/market-data/binance";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const symbol = searchParams.get("symbol") ?? "BTCUSDT";
  const interval = searchParams.get("interval") ?? "15m";
  const limit = Number(searchParams.get("limit") ?? "200");

  try {
    const candles = await fetchBinanceCandles(symbol, interval, limit);
    return NextResponse.json(
      { symbol: symbol.toUpperCase(), interval, candles, source: "binance-futures-public" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load market data";
    const status = message.startsWith("Invalid") || message.startsWith("Unsupported") || message.startsWith("Candle") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
