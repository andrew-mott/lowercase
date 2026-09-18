import type { FlowDefinition } from "@lcase/types";
import { StepDetails } from "@/components/workbench/shared/flow-graph/side-panel/step-details/Content";
import { Button } from "@/components/ui/button";
import { Maximize2Icon } from "lucide-react";

// "Open in main panel" (a big focused-content preview) is an old-page-only
// concept with no equivalent in the new dockview world -- onOpenInMainPanel
// stays a deliberate no-op stub (still used by the deferred reference-
// resolution family, not this tab's own concern). Its httpjson body/exports
// preview buttons instead navigate into the json-definition panel via
// onNavigateToDefinition (the related change). See docs/initiatives/ui-workspace/INITIATIVE.md.
export function StepDetailsTab({
  stepId,
  flowDef,
  onNavigateToDefinition,
}: {
  stepId: string | null;
  flowDef: FlowDefinition;
  onNavigateToDefinition: (path: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-0 mt-0 mb-0 py-0 px-0">
      {stepId && (
        <div className="flex flex-row justify-between">
          <h2 className="text-xs font-bold">{stepId}</h2>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 cursor-pointer"
            onClick={() => onNavigateToDefinition(["steps", stepId])}
          >
            <Maximize2Icon className="size-3.5" />
          </Button>
        </div>
      )}
      <StepDetails
        stepId={stepId}
        flowDef={flowDef}
        onOpenInMainPanel={() => {}}
        onNavigateToDefinition={onNavigateToDefinition}
      />
    </div>
  );
}
