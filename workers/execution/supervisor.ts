export type WorkerSupervisorOptions = {
  runCycle: (signal: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  maxBackoffMs?: number;
  shutdownTimeoutMs?: number;
  onError?: (error: Error) => void;
  onShutdown?: () => Promise<void>;
};

function wait(milliseconds: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

async function finishWithTimeout(operation: () => Promise<void>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = operation().catch(() => undefined);
  await Promise.race([
    cleanup,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
}

export async function runWorkerSupervisor(options: WorkerSupervisorOptions) {
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const maxBackoffMs = options.maxBackoffMs ?? 10_000;
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 10_000;
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 100) {
    throw new Error("Worker supervisor poll interval must be at least 100ms");
  }
  if (!Number.isInteger(maxBackoffMs) || maxBackoffMs < pollIntervalMs) {
    throw new Error("Worker supervisor max backoff must not be below the poll interval");
  }
  if (!Number.isInteger(shutdownTimeoutMs) || shutdownTimeoutMs < 1) {
    throw new Error("Worker supervisor shutdown timeout must be positive");
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  let backoffMs = pollIntervalMs;
  try {
    while (!controller.signal.aborted) {
      try {
        await options.runCycle(controller.signal);
        backoffMs = pollIntervalMs;
      } catch (error) {
        options.onError?.(error instanceof Error ? error : new Error("Worker cycle failed"));
        backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
      }
      await wait(backoffMs, controller.signal);
    }
  } finally {
    options.signal?.removeEventListener("abort", abort);
    if (options.onShutdown) {
      await finishWithTimeout(options.onShutdown, shutdownTimeoutMs);
    }
  }
}
