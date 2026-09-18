import type { StepHttpJson } from "@lcase/types";
import { InputField } from "@/components/workbench/shared/fields/InputField";
import { HeadersField } from "@/components/workbench/shared/fields/HeadersField";
import { CodeEditorField } from "@/components/workbench/shared/fields/CodeEditorField";
import { ExportsField } from "@/components/workbench/shared/fields/ExportsField";
import type { OpenInMainPanel } from "@/components/workbench/shared/MainPanelTypes";

type Props = {
  step: StepHttpJson;
  stepId: string;
  onOpenInMainPanel: OpenInMainPanel;
  onNavigateToDefinition?: (path: string[]) => void;
};

export function HttpJsonDetails({
  step,
  stepId,
  onOpenInMainPanel,
  onNavigateToDefinition,
}: Props) {
  return (
    <div className="flex flex-col gap-3 mt-3">
      <InputField label="Type" value={step.type} />
      <InputField label="URL" value={step.url} />
      <InputField label="Method" value={step.method} />
      <HeadersField label="Headers" value={step.headers} />
      <InputField label="On Success" value={step.on?.success} />
      <InputField label="On Failure" value={step.on?.failure} />
      <CodeEditorField
        label="Body"
        value={step.body}
        onOpen={(displayValue) =>
          onOpenInMainPanel(`Step "${stepId}" - body`, displayValue, "json")
        }
        onNavigate={
          onNavigateToDefinition
            ? () => onNavigateToDefinition(["steps", stepId, "body"])
            : undefined
        }
      />
      <ExportsField
        label="Exports"
        stepId={stepId}
        value={step.exports}
        onOpenInMainPanel={onOpenInMainPanel}
        onNavigateToDefinition={onNavigateToDefinition}
      />
    </div>
  );
}
