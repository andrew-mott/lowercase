import { useState } from "react";
import type {
  ArtifactListItem,
  FlowVersionRecord,
  RunListItem,
  SimListItem,
} from "@lcase/types";
import { ChevronDownIcon, FolderIcon, FolderOpenIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  FLOW_GRAPH_ICON,
  FLOW_GRAPH_ICON_CLASS,
  JSON_DEFINITION_ICON,
  JSON_DEFINITION_ICON_CLASS,
} from "@/components/workbench/shared/tab-icons";
import { RunList } from "./RunList";
import { SimList } from "./SimList";
import { ArtifactList } from "./ArtifactList";

export function Row({
  version,
  isExpanded,
  onToggleExpanded,
  selectedRowId,
  onSelectRow,
  onSelectVersion,
  onSelectFlowGraph,
  onSelectJsonDefinition,
  onSelectRun,
  onSelectSim,
  onSelectArtifact,
}: {
  version: FlowVersionRecord;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  selectedRowId: string | null;
  onSelectRow: (rowId: string) => void;
  onSelectVersion: () => void;
  onSelectFlowGraph: () => void;
  onSelectJsonDefinition: () => void;
  onSelectRun: (run: RunListItem) => void;
  onSelectSim: (sim: SimListItem["sim"]) => void;
  onSelectArtifact: (item: ArtifactListItem, versionId: string) => void;
}) {
  const [isRunsExpanded, setIsRunsExpanded] = useState(false);
  const [isSimsExpanded, setIsSimsExpanded] = useState(false);
  const [isArtifactsExpanded, setIsArtifactsExpanded] = useState(false);
  const isSelected = selectedRowId === `version:${version.id}`;
  const isGraphSelected = selectedRowId === `flow-graph:${version.id}`;
  const isJsonSelected = selectedRowId === `json-definition:${version.id}`;
  const isRunsSelected = selectedRowId === `runs:${version.id}`;
  const isSimsSelected = selectedRowId === `sims:${version.id}`;
  const isArtifactsSelected = selectedRowId === `artifacts:${version.id}`;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggleExpanded}>
      <div
        onClick={() => {
          onToggleExpanded();
          onSelectVersion();
        }}
        className={cn(
          "flex items-center gap-2 pl-8 pr-2 py-0.5 text-xs cursor-pointer",
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
        <span className="truncate">
          {version.versionLabel ?? `Version ${version.sequence}`}
        </span>
        <span className="text-xs text-muted-foreground ml-auto shrink-0">
          {new Date(version.createdAt).toLocaleDateString()}
        </span>
      </div>
      <CollapsibleContent>
        {isExpanded ? (
          <>
            {/* flow graph */}
            <div
              onClick={onSelectFlowGraph}
              className={cn(
                "flex items-center gap-2 pl-14 pr-2 py-0.5 text-xs cursor-pointer",
                isGraphSelected
                  ? "bg-explorer-selected"
                  : "hover:bg-explorer-hover",
              )}
            >
              <FLOW_GRAPH_ICON
                className={cn("size-3.5 shrink-0", FLOW_GRAPH_ICON_CLASS)}
              />
              <span className="truncate">Flow Graph</span>
            </div>
            {/* json definition */}
            <div
              onClick={onSelectJsonDefinition}
              className={cn(
                "flex items-center gap-2 pl-14 pr-2 py-0.5 text-xs cursor-pointer",
                isJsonSelected
                  ? "bg-explorer-selected"
                  : "hover:bg-explorer-hover",
              )}
            >
              <JSON_DEFINITION_ICON
                className={cn("size-3.5 shrink-0", JSON_DEFINITION_ICON_CLASS)}
              />
              <span className="truncate">JSON Definition</span>
            </div>
            {/* runs */}
            <div
              onClick={() => {
                setIsRunsExpanded((prev) => !prev);
                onSelectRow(`runs:${version.id}`);
              }}
              className={cn(
                "flex items-center gap-2 pl-14 pr-2 py-0.5 text-xs cursor-pointer",
                isRunsSelected
                  ? "bg-explorer-selected"
                  : "hover:bg-explorer-hover",
              )}
            >
              <div className="flex items-center gap-0.5">
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 text-muted-foreground transition-transform duration-200 shrink-0",
                    !isRunsExpanded && "-rotate-90",
                  )}
                />
                {isRunsExpanded ? (
                  <FolderOpenIcon className="size-3.5 shrink-0" />
                ) : (
                  <FolderIcon className="size-3.5 shrink-0" />
                )}
              </div>
              <span className="truncate">Runs</span>
            </div>
            {isRunsExpanded ? (
              <RunList
                versionId={version.id}
                selectedRowId={selectedRowId}
                onSelectRun={onSelectRun}
              />
            ) : null}

            {/* sims */}
            <div
              onClick={() => {
                setIsSimsExpanded((prev) => !prev);
                onSelectRow(`sims:${version.id}`);
              }}
              className={cn(
                "flex items-center gap-2 pl-14 pr-2 py-0.5 text-xs cursor-pointer",
                isSimsSelected
                  ? "bg-explorer-selected"
                  : "hover:bg-explorer-hover",
              )}
            >
              <div className="flex items-center gap-0.5">
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 text-muted-foreground transition-transform duration-200 shrink-0",
                    !isSimsExpanded && "-rotate-90",
                  )}
                />
                {isSimsExpanded ? (
                  <FolderOpenIcon className="size-3.5 shrink-0" />
                ) : (
                  <FolderIcon className="size-3.5 shrink-0" />
                )}
              </div>
              <span className="truncate">Sims</span>
            </div>
            {isSimsExpanded ? (
              <SimList
                versionId={version.id}
                selectedRowId={selectedRowId}
                onSelectSim={onSelectSim}
              />
            ) : null}
            {/* artifacts */}
            <div
              onClick={() => {
                setIsArtifactsExpanded((prev) => !prev);
                onSelectRow(`artifacts:${version.id}`);
              }}
              className={cn(
                "flex items-center gap-2 pl-14 pr-2 py-0.5 text-xs cursor-pointer",
                isArtifactsSelected
                  ? "bg-explorer-selected"
                  : "hover:bg-explorer-hover",
              )}
            >
              <div className="flex items-center gap-0.5">
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 text-muted-foreground transition-transform duration-200 shrink-0",
                    !isArtifactsExpanded && "-rotate-90",
                  )}
                />
                {isArtifactsExpanded ? (
                  <FolderOpenIcon className="size-3.5 shrink-0" />
                ) : (
                  <FolderIcon className="size-3.5 shrink-0" />
                )}
              </div>
              <span className="truncate">Artifacts</span>
            </div>

            {isArtifactsExpanded ? (
              <ArtifactList
                versionId={version.id}
                selectedRowId={selectedRowId}
                onSelectArtifact={onSelectArtifact}
              />
            ) : null}
          </>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
