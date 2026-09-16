import type { FundingRate } from "@/lib/market-data/binance";

export function validateFundingRates(
  fundingRates: FundingRate[],
  window?: { startTime: number; endTime: number },
) {
  for (const rate of fundingRates) {
    if (
      !Number.isInteger(rate.fundingTime) ||
      rate.fundingTime < 0 ||
      !Number.isFinite(rate.fundingRate)
    ) {
      throw new Error("Funding rates must contain finite timestamps and rates");
    }
    if (
      window &&
      (rate.fundingTime < window.startTime || rate.fundingTime > window.endTime)
    ) {
      throw new Error("Funding rates must fall within the validation window");
    }
  }
  if (
    fundingRates.some(
      (rate, index, rates) =>
        index > 0 && rate.fundingTime <= rates[index - 1].fundingTime,
    )
  ) {
    throw new Error("Funding rates must be sorted by funding time");
  }
}
