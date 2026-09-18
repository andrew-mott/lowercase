import type { StepMcp } from "@lcase/types";
import { InputField } from "@/components/workbench/shared/fields/InputField";

export function McpDetails({ step }: { step: StepMcp }) {
  return (
    <div className="flex flex-col gap-3 mt-3">
      <InputField label="Type" value={step.type} />
      <InputField label="URL" value={step.url} />
      <InputField label="Transport" value={step.transport} />
      <InputField label="Feature Primitive" value={step.feature.primitive} />
      <InputField label="Feature Name" value={step.feature.name} />
      <InputField label="On Success" value={step.on?.success} />
      <InputField label="On Failure" value={step.on?.failure} />
    </div>
  );
}
