import { processNextValidationRun } from "@/workers/validation/runner";

export type ValidationWorkerLoopOptions = {
  pollIntervalMs?: number;
  maxIdleIntervalMs?: number;
  signal?: AbortSignal;
  processRun?: () => Promise<unknown>;
  onError?: (error: Error) => void;
};

function wait(milliseconds: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export async function runValidationWorker(options: ValidationWorkerLoopOptions = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const maxIdleIntervalMs = options.maxIdleIntervalMs ?? 10_000;
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 100) {
    throw new Error("Validation worker poll interval must be at least 100ms");
  }
  if (!Number.isInteger(maxIdleIntervalMs) || maxIdleIntervalMs < pollIntervalMs) {
    throw new Error("Validation worker max idle interval must not be below the poll interval");
  }

  const processRun = options.processRun ?? (() => processNextValidationRun());
  let idleIntervalMs = pollIntervalMs;

  while (!options.signal?.aborted) {
    try {
      const result = await processRun();
      idleIntervalMs = result === null ? Math.min(idleIntervalMs * 2, maxIdleIntervalMs) : pollIntervalMs;
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error("Validation worker failed"));
      idleIntervalMs = Math.min(idleIntervalMs * 2, maxIdleIntervalMs);
    }
    await wait(idleIntervalMs, options.signal);
  }
}
