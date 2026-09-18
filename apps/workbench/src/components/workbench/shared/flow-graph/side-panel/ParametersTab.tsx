import type { FlowParamDefinition } from "@lcase/types";
import { FlowParameters } from "@/components/workbench/shared/flow-graph/side-panel/Parameters";

export function ParametersTab({
  params,
}: {
  params: Record<string, FlowParamDefinition>;
}) {
  return <FlowParameters label="Parameters" value={params} />;
}
