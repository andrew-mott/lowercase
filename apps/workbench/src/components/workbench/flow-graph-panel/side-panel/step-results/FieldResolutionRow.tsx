import type { FlowDefinition } from "@lcase/types";
import type { OpenInMainPanel } from "@/components/workbench/shared/MainPanelTypes";
import {
  foldResolvedField,
  type ResolvedRef,
} from "@/components/workbench/shared/ref-resolution";
import {
  stringifyForPreview,
  truncateForPreview,
} from "@/components/workbench/flow-graph-panel/side-panel/step-results/preview-text";

type Props = {
  stepId: string;
  flowDef: FlowDefinition;
  bindPath: string;
  group: ResolvedRef[];
  onOpenInMainPanel: OpenInMainPanel;
};

// displays one field before and after references were resolved and bound
export function FieldResolutionRow({
  stepId,
  flowDef,
  bindPath,
  group,
}: Props) {
  const { originalField, value, anyUnresolved, anyLoading } = foldResolvedField(
    flowDef,
    stepId,
    group[0].ref.bindPath,
    group,
  );
  const originalText = stringifyForPreview(originalField);
  const resolvedText = stringifyForPreview(value);

  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-bold">{bindPath}</div>
      <div className="text-xs text-muted-foreground">Before</div>
      <pre className="text-xs whitespace-pre-wrap break-words rounded bg-neutral-100 dark:bg-neutral-900 p-2">
        {truncateForPreview(originalText)}
      </pre>
      <div className="text-xs text-muted-foreground">After</div>
      <pre className="text-xs whitespace-pre-wrap break-words rounded bg-neutral-100 dark:bg-neutral-900 p-2">
        {truncateForPreview(resolvedText)}
      </pre>
      {anyUnresolved ? (
        <div className="text-xs text-amber-600 dark:text-amber-400">
          Could not resolve one or more references in this field.
        </div>
      ) : null}
      {anyLoading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : null}
    </div>
  );
}
