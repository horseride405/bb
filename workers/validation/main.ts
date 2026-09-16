import { getWorkerRuntimeConfig } from "@/workers/runtime-config";
import { runValidationWorker } from "@/workers/validation/loop";

async function main() {
  getWorkerRuntimeConfig();

  const controller = new AbortController();
  const shutdown = () => controller.abort();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await runValidationWorker({
    signal: controller.signal,
    onError: (error) => {
      console.error("validation_worker_error", error.message);
    },
  });
}

void main().catch((error: unknown) => {
  console.error("validation_worker_startup_error", error instanceof Error ? error.message : "Worker failed to start");
  process.exitCode = 1;
});
