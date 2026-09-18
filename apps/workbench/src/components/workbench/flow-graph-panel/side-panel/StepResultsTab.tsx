import type { FlowDefinition, Ref } from "@lcase/types";
import type { StepRunInfo } from "@/components/workbench/shared/flow-graph/use-step-run-info";
import { StepResultsTab as StepResultsPanel } from "@/components/workbench/flow-graph-panel/side-panel/step-results/Content";

// "Open in main panel" has no dockview equivalent yet -- same stubbed
// no-op as StepDetailsTab uses. See docs/todo.md.
export function StepResultsTab({
  stepId,
  flowDef,
  refs,
  paramHashes,
  stepRunInfo,
  runId,
  isReused,
  onToggleReused,
  onOpenArtifact,
}: {
  stepId: string | null;
  flowDef: FlowDefinition;
  refs: Ref[];
  paramHashes: Record<string, string>;
  stepRunInfo: Record<string, StepRunInfo>;
  runId: string | null;
  isReused?: boolean;
  onToggleReused?: () => void;
  onOpenArtifact: (hash: string, label: string) => void;
}) {
  // This tab stays manually selectable via the rail even with no run
  // active (unlike the auto-switch-on-node-click gate in Content.tsx), so
  // it needs its own message for "no run at all" -- distinct from
  // StepOutputExportsPanel's per-step "hasn't run in this run yet", which
  // assumes a run exists but this particular step didn't execute in it.
  if (!runId) {
    return (
      <div className="flex flex-col gap-2">
        {stepId && <h2 className="text-lg">{stepId}</h2>}
        <p className="mt-3 text-sm text-muted-foreground">
          No run has been started yet.
        </p>
      </div>
    );
  }

  return (
    <StepResultsPanel
      stepId={stepId}
      flowDef={flowDef}
      refs={refs}
      paramHashes={paramHashes}
      stepRunInfo={stepRunInfo}
      isReused={isReused}
      onToggleReused={onToggleReused}
      onOpenInMainPanel={() => {}}
      onOpenArtifact={onOpenArtifact}
    />
  );
}
