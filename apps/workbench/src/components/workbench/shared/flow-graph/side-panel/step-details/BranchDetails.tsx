import type { StepBranch } from "@lcase/types";
import { InputField } from "@/components/workbench/shared/fields/InputField";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function BranchDetails({ step }: { step: StepBranch }) {
  const caseEntries = Object.entries(step.cases);

  return (
    <div className="flex flex-col gap-3 mt-3">
      <InputField label="Type" value={step.type} />
      <InputField label="Value" value={step.value} />
      <Field orientation="vertical" className="items-start">
        <FieldLabel className="shrink-0 text-xs">Cases</FieldLabel>
        <div className="flex-1 flex flex-col gap-2 mr-3">
          <div className="flex flex-row gap-2">
            <span className="flex-1 text-xs text-muted-foreground">Case</span>
            <span className="flex-1 text-xs text-muted-foreground">
              Target Step
            </span>
          </div>
          {caseEntries.map(([caseValue, targetStepId]) => (
            <div key={caseValue} className="flex flex-row gap-2">
              <Input
                value={caseValue}
                readOnly
                className="flex-1 h-6 pl-2 md:text-xs border-0"
              />
              <Input
                value={targetStepId}
                readOnly
                className="flex-1 h-6 pl-2 md:text-xs border-0 bg-neutral-100"
              />
            </div>
          ))}
        </div>
      </Field>
      <InputField label="Default" value={step.default} />
    </div>
  );
}
