import type { FlowDefinition } from "@lcase/types";
import { HttpJsonDetails } from "./HttpJsonDetails";
import { ParallelDetails } from "./ParallelDetails";
import { JoinDetails } from "./JoinDetails";
import { BranchDetails } from "./BranchDetails";
import { McpDetails } from "./McpDetails";
import type { OpenInMainPanel } from "@/components/workbench/shared/MainPanelTypes";

type Props = {
  flowDef: FlowDefinition | null;
  stepId: string | null;
  onOpenInMainPanel: OpenInMainPanel;
  onNavigateToDefinition?: (path: string[]) => void;
};

export function StepDetails({
  stepId,
  flowDef,
  onOpenInMainPanel,
  onNavigateToDefinition,
}: Props) {
  if (!stepId || !flowDef)
    return (
      <p className="text-xs text-muted-foreground">Select a valid stepid</p>
    );
  const step = flowDef.steps[stepId];
  if (!step)
    return (
      <p className="text-xs text-muted-foreground">Select a valid stepId</p>
    );

  switch (step.type) {
    case "httpjson":
      return (
        <HttpJsonDetails
          step={step}
          stepId={stepId}
          onOpenInMainPanel={onOpenInMainPanel}
          onNavigateToDefinition={onNavigateToDefinition}
        />
      );
    case "parallel":
      return <ParallelDetails step={step} />;
    case "join":
      return <JoinDetails step={step} />;
    case "branch":
      return <BranchDetails step={step} />;
    case "mcp":
      return <McpDetails step={step} />;
  }
}
