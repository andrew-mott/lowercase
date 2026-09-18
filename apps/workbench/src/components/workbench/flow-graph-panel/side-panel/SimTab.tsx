import type { SimDefinition } from "@lcase/types";
import { Button } from "@/components/ui/button";
import { IdentityField } from "@/components/workbench/shared/fields/IdentityField";
import { InputField } from "@/components/workbench/shared/fields/InputField";

export function SimTab({
  simDefinition,
  runId,
  simDraftActive,
  onStartAuthoring,
}: {
  simDefinition: SimDefinition | null;
  runId: string | null;
  simDraftActive: boolean;
  onStartAuthoring: () => void;
}) {
  if (!simDefinition) {
    if (simDraftActive) {
      return (
        <div className="text-sm text-muted-foreground">
          Authoring a sim from this run — mark steps to reuse from Step Results,
          then save from the bar above the graph.
        </div>
      );
    }
    if (!runId) {
      return (
        <div className="text-sm text-muted-foreground">
          No run loaded yet. Run this flow to simulate from it once it finishes,
          or open one of its past runs from the tree instead.
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          This run isn't a sim yet.
        </p>
        <Button
          onClick={onStartAuthoring}
          className="cursor-pointer w-fit bg-purple-300/60 dark:bg-purple-600 dark:text-neutral-50 hover:bg-purple-300 dark:hover:bg-purple-700 text-neutral-900"
        >
          Simulate this run
        </Button>
      </div>
    );
  }

  const { sim, spec } = simDefinition;
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm">Current Simulation</div>
      <IdentityField label="Id" value={sim.id} />
      <InputField label="Name" value={sim.name} />
      <InputField label="Description" value={sim.description} />
      <IdentityField label="Parent Run" value={spec.parentRunId} />
    </div>
  );
}
