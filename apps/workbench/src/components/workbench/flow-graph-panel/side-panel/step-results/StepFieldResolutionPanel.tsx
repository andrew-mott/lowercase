import type { FlowDefinition } from "@lcase/types";
import type { OpenInMainPanel } from "@/components/workbench/shared/MainPanelTypes";
import {
  formatBindPath,
  type ResolvedRef,
} from "@/components/workbench/shared/ref-resolution";
import { FieldResolutionRow } from "./FieldResolutionRow";

type Props = {
  stepId: string;
  flowDef: FlowDefinition;
  resolvedRefs: ResolvedRef[];
  onOpenInMainPanel: OpenInMainPanel;
};

// displays field resolution rows, grouping resolved refs by bindPath
export function StepFieldResolutionPanel({
  stepId,
  flowDef,
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

  const groups = new Map<string, ResolvedRef[]>();
  for (const resolvedRef of resolvedRefs) {
    const key = resolvedRef.ref.bindPath.join(".");
    const group = groups.get(key) ?? [];
    group.push(resolvedRef);
    groups.set(key, group);
  }

  return (
    <div className="flex flex-col gap-4 mt-3">
      {[...groups.entries()].map(([groupKey, group]) => (
        <FieldResolutionRow
          key={groupKey}
          stepId={stepId}
          flowDef={flowDef}
          bindPath={formatBindPath(group[0].ref.bindPath)}
          group={group}
          onOpenInMainPanel={onOpenInMainPanel}
        />
      ))}
    </div>
  );
}
