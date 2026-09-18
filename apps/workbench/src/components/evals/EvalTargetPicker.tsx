import {
  useGetFlowVersionDefQuery,
  useGetFlowsQuery,
} from "@/redux/api/flows-api";
import { skipToken } from "@reduxjs/toolkit/query";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

export type EvalTargetShape = {
  flowId: string;
  stepId: string;
  exportName: string;
};

export function EvalTargetPicker({
  value,
  onChange,
}: {
  value: Partial<EvalTargetShape>;
  onChange: (value: Partial<EvalTargetShape>) => void;
}) {
  const { data: flowsRes } = useGetFlowsQuery();
  const flows = (flowsRes?.ok ? flowsRes.value : []).filter(
    (f) => f.flow.kind !== "eval",
  );
  const selectedFlow = flows.find((f) => f.flow.id === value.flowId);

  const { data: flowVersionRes } = useGetFlowVersionDefQuery(
    selectedFlow ? selectedFlow.latestVersion.id : skipToken,
  );
  const definition = flowVersionRes?.ok
    ? flowVersionRes.value.definition
    : undefined;

  const stepsWithExports = Object.entries(definition?.steps ?? {}).filter(
    ([, step]) => step.type === "httpjson" && step.exports,
  ) as Array<[string, { type: "httpjson"; exports: Record<string, unknown> }]>;

  const selectedStep = value.stepId
    ? stepsWithExports.find(([stepId]) => stepId === value.stepId)
    : undefined;
  const exportNames = selectedStep ? Object.keys(selectedStep[1].exports) : [];

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="cursor-pointer">
        <Select
          value={value.flowId}
          onValueChange={(flowId) =>
            onChange({ flowId, stepId: undefined, exportName: undefined })
          }
        >
          <SelectTrigger className="w-[20rem] max-w-full">
            <SelectValue placeholder="Select A Flow" />
          </SelectTrigger>
          <SelectContent
            position="popper"
            className="w-[var(--radix-select-trigger-width)]"
          >
            <SelectGroup>
              <SelectLabel>Select A Flow</SelectLabel>
              {flows.map((f) => (
                <SelectItem value={f.flow.id} key={f.flow.id}>
                  {f.flow.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="cursor-pointer">
        <Select
          key={value.flowId ?? "no-flow"}
          value={value.stepId}
          onValueChange={(stepId) =>
            onChange({ ...value, stepId, exportName: undefined })
          }
          disabled={!selectedFlow}
        >
          <SelectTrigger className="w-[16rem] max-w-full">
            <SelectValue placeholder="Select A Step" />
          </SelectTrigger>
          <SelectContent
            position="popper"
            className="w-[var(--radix-select-trigger-width)]"
          >
            <SelectGroup>
              <SelectLabel>Select A Step</SelectLabel>
              {stepsWithExports.map(([stepId]) => (
                <SelectItem value={stepId} key={stepId}>
                  {stepId}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="cursor-pointer">
        <Select
          key={`${value.flowId ?? "no-flow"}:${value.stepId ?? "no-step"}`}
          value={value.exportName}
          onValueChange={(exportName) => onChange({ ...value, exportName })}
          disabled={!selectedStep}
        >
          <SelectTrigger className="w-[16rem] max-w-full">
            <SelectValue placeholder="Select An Export" />
          </SelectTrigger>
          <SelectContent
            position="popper"
            className="w-[var(--radix-select-trigger-width)]"
          >
            <SelectGroup>
              <SelectLabel>Select An Export</SelectLabel>
              {exportNames.map((name) => (
                <SelectItem value={name} key={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
