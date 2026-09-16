export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
};

export function retryDelayMs(
  attempt: number,
  baseDelayMs = 250,
  maxDelayMs = 5_000,
): number {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error("Retry attempt must be a positive integer");
  }
  return Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 5_000;
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("Retry maxAttempts must be a positive integer");
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      await sleep(retryDelayMs(attempt, baseDelayMs, maxDelayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Operation failed after retries");
}
