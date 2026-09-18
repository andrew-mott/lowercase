import type { FlowProblem } from "@lcase/types";
import { FlowProblemsList } from "@/components/workbench/shared/flow-graph/side-panel/ProblemsList";

export function ProblemsTab({ problems }: { problems: FlowProblem[] }) {
  return <FlowProblemsList problems={problems} />;
}
