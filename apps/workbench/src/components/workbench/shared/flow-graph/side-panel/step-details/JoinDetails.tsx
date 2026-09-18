import type { StepJoin } from "@lcase/types";
import { InputField } from "@/components/workbench/shared/fields/InputField";
import { InputListField } from "@/components/workbench/shared/fields/InputListField";

export function JoinDetails({ step }: { step: StepJoin }) {
  return (
    <div className="flex flex-col gap-3 mt-3">
      <InputField label="Type" value={step.type} />
      <InputListField label="Steps" value={step.steps} ordered={false} />
      <InputField label="Next" value={step.next} />
    </div>
  );
}
