import { evaluateLiveExecutionGate, type LiveExecutionGateInput, type LiveExecutionGateResult } from "@/lib/execution/live-gate";

export type ExecutionPreflight = LiveExecutionGateResult & {
  submitted: false;
};

export function preflightLiveExecution(input: LiveExecutionGateInput): ExecutionPreflight {
  return {
    ...evaluateLiveExecutionGate(input),
    submitted: false,
  };
}
