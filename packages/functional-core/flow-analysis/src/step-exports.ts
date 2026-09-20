import type { ExportDeclaration, StepDefinition } from "@lcase/types";

/**
 * A step's export declarations, for the step types that can declare them.
 * The one place that knows which step types those are.
 */
export function stepExports(
  step: StepDefinition,
): Record<string, ExportDeclaration> | undefined {
  if (step.type === "httpjson" || step.type === "http") return step.exports;
  return undefined;
}

/**
 * Whether a step stores a whole output that other things can reference as
 * `steps.<id>.output`. Control-flow steps never do.
 */
export function stepHasOutput(step: StepDefinition): boolean {
  return step.type === "httpjson" || step.type === "http";
}
