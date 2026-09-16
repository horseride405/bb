export const failureInjectionScenarios = [
  "reconciliation_timeout",
  "stale_state",
  "duplicate_intent",
  "order_rejection",
  "partial_fill",
  "worker_restart",
  "emergency_stop",
] as const;

export type FailureInjectionScenario = (typeof failureInjectionScenarios)[number];

export type FailureInjectionResult = {
  scenario: FailureInjectionScenario;
  blocked: boolean;
  detail: string;
};

export type FailureInjectionRunner = (
  scenario: FailureInjectionScenario,
) => Promise<{ blocked: boolean; detail?: string }>;

export async function runFailureInjectionSuite(
  runner: FailureInjectionRunner,
): Promise<{
  passed: boolean;
  results: FailureInjectionResult[];
}> {
  const results: FailureInjectionResult[] = [];
  for (const scenario of failureInjectionScenarios) {
    try {
      const result = await runner(scenario);
      results.push({
        scenario,
        blocked: result.blocked,
        detail: result.detail ?? (result.blocked ? "Execution remained blocked" : "Scenario was not blocked"),
      });
    } catch (error) {
      results.push({
        scenario,
        blocked: false,
        detail: error instanceof Error ? error.message : "Scenario runner failed",
      });
    }
  }
  return {
    passed: results.length === failureInjectionScenarios.length && results.every((result) => result.blocked),
    results,
  };
}
