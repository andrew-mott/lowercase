import type {
  ArtifactIndex,
  ArtifactListItem,
  FlowDefinition,
  FlowParamDefinition,
  Ref,
} from "@lcase/types";
import { isArtifactCompatible } from "@lcase/flow-analysis";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Maximize2Icon, ListTreeIcon } from "lucide-react";
import { useLazyGetArtifactQuery } from "@/redux/api/artifacts-api";
import type { OpenInMainPanel } from "@/components/workbench/shared/MainPanelTypes";
import {
  artifactFormatToLanguage,
  buildRefUsage,
  findParamRefs,
  renderParamRefReport,
} from "@/components/workbench/shared/ref-resolution";

const UNSET_VALUE = "__unset__";

type Props = {
  name: string;
  definition: FlowParamDefinition;
  artifacts: ArtifactListItem[];
  selectedHash?: string;
  onChange: (name: string, hash: string | undefined) => void;
  onOpenInMainPanel?: OpenInMainPanel;
  flowDef: FlowDefinition | null;
  refs: Ref[];
  // static display, no Select -- used for a run-opened panel, where the
  // param is that run's actual historical record, not something to edit.
  // Old-mode's caller (FlowVersionRunParamsPanel.tsx) never passes this,
  // so it stays false there and old-mode is unaffected.
  readOnly?: boolean;
  // Below: all optional, all unused by old-mode's caller -- additive,
  // zero-touch for FlowVersionRunParamsPanel.tsx (the related change).
  versionId?: string;
  curatedArtifacts?: ArtifactListItem[];
  // when true, the Select's offered candidates come from curatedArtifacts
  // (filtered further by this param's own paramCurations) instead of every
  // content-type-compatible artifact -- never broadens back out to "all
  // compatible" as a fallback.
  curatedOnly?: boolean;
  // dockview-specific content (the create-artifact shortcut) has to live
  // outside this shared component entirely -- useDockviewApi() throws with
  // no provider, and old-mode's FlowVersionRun.tsx page has none. Rendered
  // alongside the existing Preview/Show-usages buttons.
  extra?: React.ReactNode;
  // Preferred over onOpenInMainPanel for Preview when present -- opens the
  // real artifact panel (metadata + content) instead of flattening to
  // inline text. Same dockview-only constraint as `extra` above; old-mode
  // never passes this.
  onOpenArtifact?: (hash: string, label: string) => void;
};

// rendere a param row and its selection logic
export function FlowVersionRunParamRow({
  name,
  definition,
  artifacts,
  selectedHash,
  onChange,
  onOpenInMainPanel,
  flowDef,
  refs,
  readOnly,
  versionId,
  curatedArtifacts,
  curatedOnly,
  extra,
  onOpenArtifact,
}: Props) {
  const [triggerGetArtifact, { isFetching }] = useLazyGetArtifactQuery();

  const isOptional = definition.optional === true;
  const compatibleArtifacts = artifacts.filter((item) =>
    isArtifactCompatible(item.artifact.contentType, definition.type),
  );
  const candidateArtifacts = curatedOnly
    ? (curatedArtifacts ?? []).filter(
        (item) =>
          isArtifactCompatible(item.artifact.contentType, definition.type) &&
          item.associations.paramCurations.some(
            (pc) => pc.flowVersionId === versionId && pc.paramName === name,
          ),
      )
    : compatibleArtifacts;

  const selectedArtifact = artifacts.find(
    (item) => item.artifact.hash === selectedHash,
  );
  const selectedIsCompatible =
    selectedArtifact &&
    isArtifactCompatible(
      selectedArtifact.artifact.contentType,
      definition.type,
    );
  const selectedInCandidates = candidateArtifacts.some(
    (item) => item.artifact.hash === selectedHash,
  );
  const canPreview =
    selectedArtifact && selectedArtifact.artifact.format !== "bytes";
  // The artifact panel (ArtifactContentPanel) already handles `bytes`
  // gracefully -- "binary artifact, preview not supported" plus real
  // metadata -- so the bytes exclusion only applies to the old inline-text
  // fallback, not this route.
  const canOpenArtifact = onOpenArtifact
    ? Boolean(selectedArtifact)
    : canPreview;

  const paramRefs = findParamRefs(refs, name);
  const canShowUsages = canPreview && paramRefs.length > 0;

  async function handlePreview() {
    if (!selectedHash) return;
    if (onOpenArtifact) {
      onOpenArtifact(selectedHash, `Param "${name}"`);
      return;
    }
    if (!onOpenInMainPanel) return;
    const result = await triggerGetArtifact({ hash: selectedHash });
    if (!result.data?.ok) return;
    const data = result.data;
    if (data.format === "bytes") return;
    const value =
      data.format === "json" ? JSON.stringify(data.value, null, 2) : data.value;
    onOpenInMainPanel(
      `Param "${name}"`,
      value,
      artifactFormatToLanguage(data.format),
    );
  }

  async function handleShowUsages() {
    if (!selectedHash || !flowDef || !onOpenInMainPanel) return;
    const result = await triggerGetArtifact({ hash: selectedHash });
    if (!result.data?.ok || result.data.format === "bytes") return;
    const data = result.data;
    const usages = paramRefs.map((ref) => buildRefUsage(ref, flowDef, data));
    onOpenInMainPanel(
      `Param "${name}" usages`,
      renderParamRefReport(name, usages),
      "markdown",
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <div className="font-medium text-xs">{name}</div>
        <div className="text-xs text-neutral-500 dark:text-slate-300">
          {definition.type} •{" "}
          {isOptional ? (
            "optional"
          ) : (
            <span className="text-amber-700 dark:text-amber-400">required</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {readOnly ? (
          <div
            className="w-60 truncate text-xs font-bold "
            title={selectedHash}
          >
            {selectedArtifact
              ? artifactLabel(selectedArtifact.artifact)
              : (selectedHash ?? "No artifact")}
          </div>
        ) : (
          <Select
            onValueChange={(value) => {
              onChange(name, value === UNSET_VALUE ? undefined : value);
            }}
            value={selectedHash ?? UNSET_VALUE}
          >
            <SelectTrigger className="w-60 text-xs max-w-45 min-w-0" size="sm">
              <SelectValue placeholder="Select an artifact" />
            </SelectTrigger>
            <SelectContent className="text-xs m-0 p-0 ">
              <SelectGroup>
                <SelectLabel className="text-neutral-700 dark:text-neutral-300 font-bold">
                  {name}
                </SelectLabel>
                <SelectItem
                  value={UNSET_VALUE}
                  className="text-muted-foreground text-xs"
                >
                  {isOptional ? "No artifact selected" : "Select an artifact"}
                </SelectItem>
                {selectedHash && !selectedInCandidates ? (
                  selectedIsCompatible && selectedArtifact ? (
                    <SelectItem
                      value={selectedHash}
                      className="text-xs text-neutral-500 dark:text-neutral-300"
                    >
                      {`${artifactLabel(selectedArtifact.artifact)} (not curated)`}
                    </SelectItem>
                  ) : (
                    <SelectItem value={selectedHash}>
                      {`Selected artifact unavailable or incompatible: ${selectedHash}`}
                    </SelectItem>
                  )
                ) : null}
                {candidateArtifacts.map((item) => (
                  <SelectItem
                    key={item.artifact.hash}
                    value={item.artifact.hash}
                    className="text-xs text-neutral-800 dark:text-neutral-200"
                  >
                    {artifactLabel(item.artifact)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
        {(onOpenInMainPanel || onOpenArtifact) && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            disabled={!canOpenArtifact || isFetching}
            onClick={handlePreview}
            title="Preview artifact content"
          >
            <Maximize2Icon className="size-3.5" />
          </Button>
        )}
        {onOpenInMainPanel && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            disabled={!canShowUsages || isFetching}
            onClick={handleShowUsages}
            title="Show where this param is used"
          >
            <ListTreeIcon className="size-3.5" />
          </Button>
        )}
        {extra}
      </div>
    </div>
  );
}

function artifactLabel(artifact: ArtifactIndex): string {
  return artifact.label || artifact.filename || artifact.hash;
}
