import type { RunListItem } from "@lcase/types";
import { useListAllRunsQuery } from "@/redux/api/runs-api";
import { cn } from "@/lib/utils";
import {
  RUN_ICON,
  RUN_ICON_CLASS,
} from "@/components/workbench/shared/tab-icons";

// Scoped to one flow version's runs -- a possible future "all runs across
// every version of a flow" list would be a different component, not this
// one widened.
export function RunList({
  versionId,
  selectedRowId,
  onSelectRun,
}: {
  versionId: string;
  selectedRowId: string | null;
  onSelectRun: (run: RunListItem) => void;
}) {
  const { data, isLoading } = useListAllRunsQuery({ flowVersionId: versionId });

  if (isLoading)
    return (
      <div className="pl-20 py-0.5 text-xs text-muted-foreground">
        Loading runs...
      </div>
    );
  if (!data?.ok)
    return (
      <div className="pl-20 py-0.5 text-xs text-destructive">
        Error loading runs
      </div>
    );
  if (data.runList.length === 0)
    return (
      <div className="pl-20 py-0.5 text-xs text-muted-foreground">
        No runs yet.
      </div>
    );

  const runs = [...data.runList].sort(
    (a, b) =>
      new Date(b.startTime ?? 0).getTime() -
      new Date(a.startTime ?? 0).getTime(),
  );

  return (
    <>
      {runs.map((run) => (
        <div
          key={run.runId}
          onClick={() => onSelectRun(run)}
          className={cn(
            "flex items-center gap-2 pl-20 pr-2 py-0.5 text-xs cursor-pointer",
            selectedRowId === `run:${run.runId}`
              ? "bg-explorer-selected"
              : "hover:bg-explorer-hover",
          )}
        >
          <RUN_ICON className={cn("size-3.5 shrink-0", RUN_ICON_CLASS)} />
          <span className="truncate">
            {run.startTime
              ? new Date(run.startTime).toLocaleString(undefined, {
                  dateStyle: "short",
                  timeStyle: "short",
                })
              : "no start time"}
          </span>
        </div>
      ))}
    </>
  );
}
