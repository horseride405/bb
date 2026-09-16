function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required in the worker environment`);
  return value;
}

export function getWorkerRuntimeConfig() {
  return {
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    binanceApiBaseUrl: process.env.BINANCE_FUTURES_API_BASE_URL?.trim() ?? "https://fapi.binance.com",
    binanceWsBaseUrl: process.env.BINANCE_FUTURES_WS_BASE_URL?.trim() ?? "wss://fstream.binance.com",
  };
}
