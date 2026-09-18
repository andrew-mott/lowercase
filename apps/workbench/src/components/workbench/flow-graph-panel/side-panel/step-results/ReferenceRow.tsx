import type { OpenInMainPanel } from "@/components/workbench/shared/MainPanelTypes";
import {
  formatBindPath,
  type ResolvedRef,
} from "@/components/workbench/shared/ref-resolution";
import {
  stringifyForPreview,
  truncateForPreview,
} from "@/components/workbench/flow-graph-panel/side-panel/step-results/preview-text";

type Props = {
  stepId: string;
  resolvedRef: ResolvedRef;
  onOpenInMainPanel: OpenInMainPanel;
};

export function ReferenceRow({ resolvedRef }: Props) {
  const { ref, hash, usage } = resolvedRef;
  const label = `{{${ref.string}}}`;
  const fieldPath = formatBindPath(ref.bindPath);

  if (hash === null) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="text-xs font-mono font-bold">{label}</div>
        <div className="text-xs text-muted-foreground">in {fieldPath}</div>
        <div className="text-xs text-amber-600 dark:text-amber-400">
          Could not resolve (scope "{ref.scope}" isn't resolvable yet).
        </div>
      </div>
    );
  }

  if (!usage) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="text-xs font-mono font-bold">{label}</div>
        <div className="text-xs text-muted-foreground">
          in {fieldPath} — loading…
        </div>
      </div>
    );
  }

  if (!usage.resolved) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="text-xs font-mono font-bold">{label}</div>
        <div className="text-xs text-muted-foreground">in {fieldPath}</div>
        <div className="text-xs text-amber-600 dark:text-amber-400">
          Could not resolve against the loaded artifact.
        </div>
      </div>
    );
  }

  const resolvedText = stringifyForPreview(usage.resolvedValue);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-xs font-mono font-bold">{label}</div>
      <div className="text-xs text-muted-foreground">in {fieldPath}</div>
      <pre className="text-xs whitespace-pre-wrap break-words rounded bg-neutral-100 dark:bg-neutral-900 p-2">
        {truncateForPreview(resolvedText)}
      </pre>
    </div>
  );
}
