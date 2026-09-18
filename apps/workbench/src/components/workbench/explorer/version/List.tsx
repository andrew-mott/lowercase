import { useState } from "react";
import type {
  ArtifactListItem,
  FlowVersionRecord,
  RunListItem,
  SimListItem,
} from "@lcase/types";
import { useGetFlowVersionsQuery } from "@/redux/api/flows-api";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { Row } from "./Row";

export function List({
  flowId,
  selectedRowId,
  onSelectRow,
  onSelectVersion,
  onSelectFlowGraph,
  onSelectJsonDefinition,
  onSelectRun,
  onSelectSim,
  onSelectArtifact,
}: {
  flowId: string;
  selectedRowId: string | null;
  onSelectRow: (rowId: string) => void;
  onSelectVersion: (versionId: string) => void;
  onSelectFlowGraph: (version: FlowVersionRecord) => void;
  onSelectJsonDefinition: (version: FlowVersionRecord) => void;
  onSelectRun: (version: FlowVersionRecord, run: RunListItem) => void;
  onSelectSim: (version: FlowVersionRecord, sim: SimListItem["sim"]) => void;
  onSelectArtifact: (item: ArtifactListItem, versionId: string) => void;
}) {
  const { data, error, isLoading } = useGetFlowVersionsQuery(flowId);
  const showLoading = useDelayedLoading(isLoading);
  const [expandedVersionIds, setExpandedVersionIds] = useState<Set<string>>(
    new Set(),
  );

  if (isLoading)
    return showLoading ? (
      <div className="pl-10 py-1 text-sm text-muted-foreground">
        Loading versions...
      </div>
    ) : null;
  if (data?.ok === false)
    return (
      <div className="pl-10 py-1 text-sm text-destructive">
        Error loading versions: {data.error}
      </div>
    );
  if (error || !data)
    return (
      <div className="pl-10 py-1 text-sm text-destructive">
        Error loading versions
      </div>
    );

  const toggleExpanded = (versionId: string) => {
    setExpandedVersionIds((prev) => {
      const next = new Set(prev);
      if (next.has(versionId)) next.delete(versionId);
      else next.add(versionId);
      return next;
    });
  };

  return (
    <>
      {data.value.map((version) => (
        <Row
          key={version.id}
          version={version}
          isExpanded={expandedVersionIds.has(version.id)}
          onToggleExpanded={() => toggleExpanded(version.id)}
          selectedRowId={selectedRowId}
          onSelectRow={onSelectRow}
          onSelectVersion={() => onSelectVersion(version.id)}
          onSelectFlowGraph={() => onSelectFlowGraph(version)}
          onSelectJsonDefinition={() => onSelectJsonDefinition(version)}
          onSelectRun={(run) => onSelectRun(version, run)}
          onSelectSim={(sim) => onSelectSim(version, sim)}
          onSelectArtifact={onSelectArtifact}
        />
      ))}
    </>
  );
}
