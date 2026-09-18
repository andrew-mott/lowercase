import type {
  ArtifactListItem,
  FlowRecord,
  FlowVersionRecord,
  RunListItem,
  SimListItem,
} from "@lcase/types";
import {
  ChevronDownIcon,
  FolderIcon,
  FolderOpenIcon,
  SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { List } from "./version/List";

export function Row({
  flow,
  isExpanded,
  onToggleExpanded,
  selectedRowId,
  onSelectRow,
  onSelectFlow,
  onSelectFlowSettings,
  onSelectVersion,
  onSelectFlowGraph,
  onSelectJsonDefinition,
  onSelectRun,
  onSelectSim,
  onSelectArtifact,
}: {
  flow: FlowRecord;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  selectedRowId: string | null;
  onSelectRow: (rowId: string) => void;
  onSelectFlow: () => void;
  onSelectFlowSettings: () => void;
  onSelectVersion: (versionId: string) => void;
  onSelectFlowGraph: (version: FlowVersionRecord) => void;
  onSelectJsonDefinition: (version: FlowVersionRecord) => void;
  onSelectRun: (version: FlowVersionRecord, run: RunListItem) => void;
  onSelectSim: (version: FlowVersionRecord, sim: SimListItem["sim"]) => void;
  onSelectArtifact: (item: ArtifactListItem, versionId: string) => void;
}) {
  const isSelected = selectedRowId === `flow:${flow.id}`;
  const isSettingsSelected = selectedRowId === `flow-settings:${flow.id}`;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggleExpanded}>
      <div
        onClick={() => {
          onToggleExpanded();
          onSelectFlow();
        }}
        className={cn(
          "flex items-center gap-2 px-2 py-0.5 text-xs cursor-pointer",
          isSelected ? "bg-explorer-selected" : "hover:bg-explorer-hover",
        )}
      >
        <div className="flex items-center gap-0.5">
          <CollapsibleTrigger
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
          >
            <ChevronDownIcon
              className={cn(
                "size-4 text-muted-foreground transition-transform duration-200",
                !isExpanded && "-rotate-90",
              )}
            />
          </CollapsibleTrigger>
          {isExpanded ? (
            <FolderOpenIcon className="size-3.5 shrink-0" />
          ) : (
            <FolderIcon className="size-3.5 shrink-0" />
          )}
        </div>
        <span className="truncate">{flow.name}</span>
        {flow.kind === "eval" ? (
          <span className="text-[9.5px] font-normal rounded px-1.5 py-0.5 bg-sky-200/70 dark:bg-sky-900 shrink-0">
            eval
          </span>
        ) : null}
      </div>
      <CollapsibleContent>
        {isExpanded ? (
          <>
            <div
              onClick={onSelectFlowSettings}
              className={cn(
                "flex items-center gap-2 pl-8 pr-2 py-0.5 text-xs italic text-muted-foreground cursor-pointer",
                isSettingsSelected
                  ? "bg-explorer-selected"
                  : "hover:bg-explorer-hover",
              )}
            >
              <SettingsIcon className="size-3.5 shrink-0" />
              <span className="truncate">Settings</span>
            </div>
            <List
              flowId={flow.id}
              selectedRowId={selectedRowId}
              onSelectRow={onSelectRow}
              onSelectVersion={onSelectVersion}
              onSelectFlowGraph={onSelectFlowGraph}
              onSelectJsonDefinition={onSelectJsonDefinition}
              onSelectRun={onSelectRun}
              onSelectSim={onSelectSim}
              onSelectArtifact={onSelectArtifact}
            />
          </>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
