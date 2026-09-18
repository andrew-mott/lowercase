import { useCallback, useMemo, useState } from "react";
import type { FlowDefinition, Ref } from "@lcase/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OpenInMainPanel } from "@/components/workbench/shared/MainPanelTypes";
import type { StepRunInfo } from "@/components/workbench/shared/flow-graph/use-step-run-info";
import {
  buildRefUsage,
  findStepRefs,
  resolveRefHash,
  type ParamArtifactContent,
  type ResolvedRef,
} from "@/components/workbench/shared/ref-resolution";
import { ArtifactHashLoader } from "./ArtifactHashLoader";
import { StepOutputExportsPanel } from "./StepOutputExportsPanel";
import { StepFieldResolutionPanel } from "./StepFieldResolutionPanel";
import { StepReferencesPanel } from "./StepReferencesPanel";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type Props = {
  stepId: string | null;
  flowDef: FlowDefinition | null;
  refs: Ref[];
  paramHashes: Record<string, string>;
  stepRunInfo: Record<string, StepRunInfo>;
  onOpenInMainPanel: OpenInMainPanel;
  isReused?: boolean;
  onToggleReused?: () => void;
  // Preferred over onOpenInMainPanel for StepOutputExportsPanel specifically
  // -- routes a real artifact hash into the artifact panel instead of
  // flattening to inline text. Not forwarded to StepFieldResolutionPanel/
  // StepReferencesPanel, which have no hash to route (deferred, see
  // docs/initiatives/ui-workspace/INITIATIVE.md's the related change entry).
  onOpenArtifact?: (hash: string, label: string) => void;
};

type SubTab = "outputExports" | "fieldResolution" | "references";

function formatStatus(status: string | undefined) {
  if (status === "completed")
    return <span className="text-completed-foreground">completed</span>;
  if (status === "failed")
    return <span className="text-failed-foreground">failed</span>;
  if (status === "running")
    return <span className="text-running-foreground">running</span>;
}

// right side panel tab on run page, holds the sub tabs content and selected state
// analyzes refs, their artifact hashes, and resolves them to drive tab components
export function StepResultsTab({
  stepId,
  flowDef,
  refs,
  paramHashes,
  stepRunInfo,
  onOpenInMainPanel,
  isReused,
  onToggleReused,
  onOpenArtifact,
}: Props) {
  const [subTab, setSubTab] = useState<SubTab>("outputExports");
  const [artifactsByHash, setArtifactsByHash] = useState<
    Record<string, ParamArtifactContent>
  >({});

  const stepRefs = useMemo(
    () => (stepId ? findStepRefs(refs, stepId) : []),
    [refs, stepId],
  );

  const refsWithHash = useMemo(
    () =>
      stepRefs.map((ref) => ({
        ref,
        hash: resolveRefHash(ref, { paramHashes, stepArtifacts: stepRunInfo }),
      })),
    [stepRefs, paramHashes, stepRunInfo],
  );

  const outputExportHashes = useMemo(() => {
    const info = stepId ? stepRunInfo[stepId] : undefined;
    if (!info) return [];
    return [
      ...(info.outputHash ? [info.outputHash] : []),
      ...Object.values(info.exportHashes ?? {}),
    ];
  }, [stepId, stepRunInfo]);

  const distinctHashes = useMemo(() => {
    const set = new Set<string>();
    for (const { hash } of refsWithHash) {
      if (hash !== null) set.add(hash);
    }
    for (const hash of outputExportHashes) set.add(hash);
    return [...set];
  }, [refsWithHash, outputExportHashes]);

  const handleLoaded = useCallback(
    (hash: string, artifact: ParamArtifactContent) => {
      setArtifactsByHash((prev) =>
        prev[hash] ? prev : { ...prev, [hash]: artifact },
      );
    },
    [],
  );

  const resolvedRefs: ResolvedRef[] = useMemo(
    () =>
      refsWithHash.map(({ ref, hash }) => {
        const artifact = hash ? artifactsByHash[hash] : undefined;
        const usage =
          flowDef && artifact
            ? buildRefUsage(ref, flowDef, artifact)
            : undefined;
        return { ref, hash, artifact, usage };
      }),
    [refsWithHash, artifactsByHash, flowDef],
  );

  if (!stepId) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Click a step in the graph to see its run results.
      </p>
    );
  }

  const info = stepRunInfo[stepId];
  // Prefer the caller's explicit plan (a sim's declared, pre-run reuse
  // list) when given -- otherwise fall back to whether this step's own
  // outcome in the run actually being viewed was a reuse (`step.reused`,
  // surfaced as `info.sourceRunId`). Either way this is always a fact, not
  // an editable choice, in the new dockview UI -- `onToggleReused` is never
  // passed there, so the switch stays disabled regardless of which source
  // set it.
  const effectiveIsReused =
    isReused ?? (info?.sourceRunId !== undefined ? true : undefined);

  return (
    <div className="flex flex-col gap-2">
      {distinctHashes.map((hash) => (
        <ArtifactHashLoader key={hash} hash={hash} onLoaded={handleLoaded} />
      ))}

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold">{stepId}</h2>
        {effectiveIsReused !== undefined && (
          <div className="flex items-center space-x-2">
            <Label htmlFor={stepId} className="text-xs">
              Reuse
            </Label>
            <Switch
              checked={effectiveIsReused}
              onCheckedChange={onToggleReused}
              disabled={!onToggleReused}
              size="default"
              id={stepId}
              className="data-[state=checked]:bg-violet-600 dark:data-[state=checked]:bg-violet-400"
            />
          </div>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        Status: {formatStatus(info?.status) ?? "unknown"}
        {info?.matchedCase !== undefined
          ? ` (case: ${info.matchedCase ?? "default"})`
          : null}
      </div>

      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as SubTab)}>
        <TabsList
          variant="default"
          className="bg-neutral-200/60 dark:bg-neutral-800"
        >
          <TabsTrigger value="outputExports" className="text-xs">
            Output
          </TabsTrigger>
          <TabsTrigger value="fieldResolution" className="text-xs">
            Fields
          </TabsTrigger>
          <TabsTrigger value="references" className="text-xs">
            Refs
          </TabsTrigger>
        </TabsList>
        <TabsContent value="outputExports">
          <StepOutputExportsPanel
            stepId={stepId}
            stepRunInfo={info}
            artifactsByHash={artifactsByHash}
            onOpenInMainPanel={onOpenInMainPanel}
            onOpenArtifact={onOpenArtifact}
          />
        </TabsContent>
        <TabsContent value="fieldResolution">
          {flowDef ? (
            <StepFieldResolutionPanel
              stepId={stepId}
              flowDef={flowDef}
              resolvedRefs={resolvedRefs}
              onOpenInMainPanel={onOpenInMainPanel}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="references">
          <StepReferencesPanel
            stepId={stepId}
            resolvedRefs={resolvedRefs}
            onOpenInMainPanel={onOpenInMainPanel}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
