import type { OpenInMainPanel } from "@/components/workbench/shared/MainPanelTypes";
import type { ResolvedRef } from "@/components/workbench/shared/ref-resolution";
import { ReferenceRow } from "./ReferenceRow";

type Props = {
  stepId: string;
  resolvedRefs: ResolvedRef[];
  onOpenInMainPanel: OpenInMainPanel;
};

// shows the raw references and what they resolved to
export function StepReferencesPanel({
  stepId,
  resolvedRefs,
  onOpenInMainPanel,
}: Props) {
  if (resolvedRefs.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        No template references found in step "{stepId}".
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 mt-3">
      {resolvedRefs.map((resolvedRef, index) => (
        <ReferenceRow
          key={`${resolvedRef.ref.string}-${index}`}
          stepId={stepId}
          resolvedRef={resolvedRef}
          onOpenInMainPanel={onOpenInMainPanel}
        />
      ))}
    </div>
  );
}
