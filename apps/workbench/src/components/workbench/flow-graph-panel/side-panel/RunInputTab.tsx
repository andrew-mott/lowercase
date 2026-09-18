import { useState } from "react";
import type {
  ArtifactListItem,
  FlowDefinition,
  FlowParamDefinition,
} from "@lcase/types";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { FlowVersionRunParamRow } from "@/components/workbench/flow-graph-panel/side-panel/RunInputRow";
import { CreateArtifactDialog } from "@/components/workbench/shared/CreateArtifactDialog";

type Props = {
  flowDef: FlowDefinition;
  params: Record<string, FlowParamDefinition>;
  artifacts: ArtifactListItem[];
  selectedParamHashes: Record<string, string>;
  onParamChange: (name: string, hash: string | undefined) => void;
  missingRequiredParams: string[];
  readOnly?: boolean;
  paramsLoading?: boolean;
  paramsError?: boolean;
  versionId: string;
  panelId: string;
  curatedArtifacts: ArtifactListItem[];
  onOpenArtifact: (hash: string, label: string) => void;
};

export function RunInputTab({
  flowDef,
  params,
  artifacts,
  selectedParamHashes,
  onParamChange,
  missingRequiredParams,
  readOnly,
  paramsLoading,
  paramsError,
  versionId,
  panelId,
  curatedArtifacts,
  onOpenArtifact,
}: Props) {
  const [createDialogParam, setCreateDialogParam] = useState<string | null>(
    null,
  );
  if (Object.keys(params).length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        This flow does not declare any run params.
      </div>
    );
  }

  if (paramsLoading) {
    return (
      <div className="text-sm text-muted-foreground">Loading run params...</div>
    );
  }

  if (paramsError) {
    return (
      <div className="text-sm text-destructive">
        Couldn't load this run's params.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {Object.entries(params).map(([name, def]) => (
        <FlowVersionRunParamRow
          key={name}
          name={name}
          definition={def}
          artifacts={artifacts}
          selectedHash={selectedParamHashes[name]}
          onChange={onParamChange}
          flowDef={flowDef}
          refs={[]}
          readOnly={readOnly}
          versionId={versionId}
          curatedArtifacts={curatedArtifacts}
          curatedOnly={!readOnly}
          onOpenArtifact={onOpenArtifact}
          extra={
            !readOnly ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                title="Create a new artifact for this param"
                onClick={() => setCreateDialogParam(name)}
              >
                <PlusIcon className="size-3.5" />
              </Button>
            ) : undefined
          }
        />
      ))}
      {!readOnly && missingRequiredParams.length > 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Select artifacts for all required params before running.
        </p>
      ) : null}
      <CreateArtifactDialog
        open={createDialogParam !== null}
        onOpenChange={(open) => !open && setCreateDialogParam(null)}
        versionId={versionId}
        initialCuratedParamName={createDialogParam ?? undefined}
        returnTo={
          createDialogParam
            ? { panelId, paramName: createDialogParam }
            : undefined
        }
      />
    </div>
  );
}
