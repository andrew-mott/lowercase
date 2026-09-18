import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useGetFlowsQuery } from "@/redux/api/flows-api";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { useAppDispatch } from "@/redux/typed-hooks";
import { runSelected } from "@/redux/slices/flow-graph-panels-slice";
import { useDockviewApi } from "@/components/workbench/dock/dock-context";
import {
  dockPanelId,
  openOrFocusPanel,
} from "@/components/workbench/dock/dock-panels";
import { titleFor } from "@/components/workbench/shared/artifact-title";
import { Row } from "./Row";
import { CreateFlowDialog } from "./CreateFlowDialog";
import { cn } from "@/lib/utils";
import { FLOW_AUTHORING_ICON_CLASS } from "../shared/tab-icons";

export function FlowExplorer() {
  const api = useDockviewApi();
  const dispatch = useAppDispatch();
  const { data, error, isLoading } = useGetFlowsQuery();
  const showLoading = useDelayedLoading(isLoading);
  const [expandedFlowIds, setExpandedFlowIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (isLoading) return showLoading ? <div>Loading flows...</div> : null;
  if (data?.ok === false) return <div>Error loading flows: {data.error}</div>;
  if (error || !data) return <div>Error loading flows</div>;

  const toggleExpanded = (flowId: string) => {
    setExpandedFlowIds((prev) => {
      const next = new Set(prev);
      if (next.has(flowId)) next.delete(flowId);
      else next.add(flowId);
      return next;
    });
  };

  return (
    <div className="flex flex-col">
      <div
        onClick={() => setDialogOpen(true)}
        className="flex items-center gap-2 px-2 py-1.5 mt-1 text-xs cursor-pointer hover:bg-accent/40"
      >
        <PlusIcon
          className={cn("size-3.5 shrink-0", FLOW_AUTHORING_ICON_CLASS)}
        />
        <span>New Flow</span>
      </div>
      <CreateFlowDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      {data.value.map(({ flow }) => (
        <Row
          key={flow.id}
          flow={flow}
          isExpanded={expandedFlowIds.has(flow.id)}
          onToggleExpanded={() => toggleExpanded(flow.id)}
          selectedRowId={selectedRowId}
          onSelectRow={setSelectedRowId}
          onSelectFlow={() => {
            setSelectedRowId(`flow:${flow.id}`);
          }}
          onSelectFlowSettings={() => {
            setSelectedRowId(`flow-settings:${flow.id}`);
            if (!api) return;
            openOrFocusPanel(api, {
              kind: "flow-settings",
              label: `${flow.name} Settings`,
              flowId: flow.id,
            });
          }}
          onSelectVersion={(versionId) => {
            setSelectedRowId(`version:${versionId}`);
          }}
          onSelectFlowGraph={(version) => {
            setSelectedRowId(`flow-graph:${version.id}`);
            if (!api) return;
            openOrFocusPanel(api, {
              kind: "flow-graph",
              label: `${version.versionLabel ?? `Version ${version.sequence}`} Graph`,
              versionId: version.id,
              openedAs: { type: "plain" },
            });
          }}
          onSelectJsonDefinition={(version) => {
            setSelectedRowId(`json-definition:${version.id}`);
            if (!api) return;
            openOrFocusPanel(api, {
              kind: "json-definition",
              label: `${version.versionLabel ?? `Version ${version.sequence}`} JSON`,
              versionId: version.id,
            });
          }}
          onSelectRun={(version, run) => {
            setSelectedRowId(`run:${run.runId}`);
            const label = `${version.versionLabel ?? `Version ${version.sequence}`} — ${
              run.startTime
                ? new Date(run.startTime).toLocaleString(undefined, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                : run.runId
            }`;
            const req = {
              kind: "flow-graph" as const,
              label,
              versionId: version.id,
              openedAs: { type: "run" as const, runId: run.runId },
            };
            dispatch(
              runSelected({ panelId: dockPanelId(req), runId: run.runId }),
            );
            if (api) openOrFocusPanel(api, req);
          }}
          onSelectSim={(version, sim) => {
            setSelectedRowId(`sim:${sim.id}`);
            if (!api) return;
            openOrFocusPanel(api, {
              kind: "flow-graph",
              label: `${version.versionLabel ?? `Version ${version.sequence}`} — ${sim.name}`,
              versionId: version.id,
              openedAs: { type: "sim", simId: sim.id },
            });
          }}
          onSelectArtifact={(item, versionId) => {
            setSelectedRowId(`artifact:${item.artifact.hash}`);
            if (!api) return;
            openOrFocusPanel(api, {
              kind: "artifact",
              label: titleFor(item),
              hash: item.artifact.hash,
              versionId,
            });
          }}
        />
      ))}
    </div>
  );
}
