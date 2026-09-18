import type { SimListItem } from "@lcase/types";
import { useListAllSimsQuery } from "@/redux/api/sims-api";
import { cn } from "@/lib/utils";
import {
  SIM_ICON,
  SIM_ICON_CLASS,
} from "@/components/workbench/shared/tab-icons";

// Scoped to one flow version's sims -- a possible future "all sims across
// every version of a flow" list would be a different component, not this
// one widened.
export function SimList({
  versionId,
  selectedRowId,
  onSelectSim,
}: {
  versionId: string;
  selectedRowId: string | null;
  onSelectSim: (sim: SimListItem["sim"]) => void;
}) {
  const { data, isLoading } = useListAllSimsQuery({ flowVersionId: versionId });

  if (isLoading)
    return (
      <div className="pl-20 py-0.5 text-xs text-muted-foreground">
        Loading sims...
      </div>
    );
  if (!data?.ok)
    return (
      <div className="pl-20 py-0.5 text-xs text-destructive">
        Error loading sims
      </div>
    );
  if (data.value.length === 0)
    return (
      <div className="pl-20 py-0.5 text-xs text-muted-foreground">
        No sims yet.
      </div>
    );

  const sims = [...data.value].sort(
    (a, b) =>
      new Date(b.sim.createdAt).getTime() - new Date(a.sim.createdAt).getTime(),
  );

  return (
    <>
      {sims.map(({ sim }) => (
        <div
          key={sim.id}
          onClick={() => onSelectSim(sim)}
          className={cn(
            "flex items-center gap-2 pl-20 pr-2 py-0.5 text-xs cursor-pointer",
            selectedRowId === `sim:${sim.id}`
              ? "bg-explorer-selected"
              : "hover:bg-explorer-hover",
          )}
        >
          <SIM_ICON className={cn("size-3.5 shrink-0", SIM_ICON_CLASS)} />
          <span className="truncate">{sim.name}</span>
        </div>
      ))}
    </>
  );
}
