import { useState } from "react";
import {
  BotIcon,
  CircleAlertIcon,
  FileInputIcon,
  Footprints,
  SettingsIcon,
  SlidersHorizontalIcon,
  TerminalSquareIcon,
  VariableIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SidePanelTab } from "./SidePanel";

export type RailItem = {
  tab: SidePanelTab;
  label: string;
  icon: typeof SlidersHorizontalIcon;
};

type Props = {
  activeTab: SidePanelTab | null;
  onSelectTab: (tab: SidePanelTab) => void;
  problemsCount?: number;
  // Defaults to the same color the real Flow Graph panel's Problems badge
  // always used -- that panel's problemsCount only ever comes from
  // analyzeFlow, with no more-severe "doesn't even parse" tier to
  // distinguish. The flow-authoring panels pass "error" when the count
  // includes a parse/save failure, not just analyzeFlow problems.
  problemsBadgeVariant?: "default" | "error";
  // Defaults to every tab the real Flow Graph panel offers -- callers with
  // fewer applicable tabs (e.g. the flow-authoring preview panel, which has
  // no run/persisted-version-backed tabs to show) pass a reduced list
  // instead of a whole separate rail component.
  items?: RailItem[];
};

const RAIL_ITEMS: RailItem[] = [
  { tab: "settings", label: "Settings", icon: SettingsIcon },
  { tab: "stepdetails", label: "Step Details", icon: Footprints },
  { tab: "parameters", label: "Parameters", icon: VariableIcon },
  { tab: "runinput", label: "Run Input", icon: FileInputIcon },
  { tab: "sim", label: "Simulate", icon: BotIcon },
  { tab: "stepresults", label: "Step Results", icon: TerminalSquareIcon },
  { tab: "problems", label: "Problems", icon: CircleAlertIcon },
];

// Always-visible, fixed-width vertical rail between the graph and the
// (optional) content pane. Icons always *select* a tab, never toggle it
// closed on re-click -- matches RunToolbar's onOpenParams/onOpenSim.
export function Rail({
  activeTab,
  onSelectTab,
  problemsCount,
  problemsBadgeVariant = "default",
  items = RAIL_ITEMS,
}: Props) {
  // Mirrors each tooltip's own open state so TooltipContent can be
  // unmounted outright on close, instead of going through Radix's
  // animated-exit path -- that path's reliance on a CSS animationend
  // event was producing an inconsistent stutter on close.
  const [openTab, setOpenTab] = useState<SidePanelTab | null>(null);

  return (
    <div className="flex h-full w-12 shrink-0 flex-col items-center gap-1 py-2 bg-panel-hidden-background">
      {items.map(({ tab, label, icon: Icon }) => (
        <Tooltip
          key={tab}
          delayDuration={700}
          onOpenChange={(isOpen) => setOpenTab(isOpen ? tab : null)}
        >
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "relative cursor-pointer",
                activeTab === tab && "bg-accent text-accent-foreground",
              )}
              onClick={() => onSelectTab(tab)}
            >
              <Icon className="size-4" />
              {tab === "problems" && problemsCount ? (
                <span
                  className={cn(
                    "absolute -right-1 -top-1 rounded px-1 text-xs pointer-events-none",
                    problemsBadgeVariant === "error"
                      ? "bg-rose-200 dark:bg-rose-800"
                      : "bg-sky-200 dark:bg-sky-800",
                  )}
                >
                  {problemsCount}
                </span>
              ) : null}
            </Button>
          </TooltipTrigger>
          {openTab === tab && (
            <TooltipContent side="left">{label}</TooltipContent>
          )}
        </Tooltip>
      ))}
    </div>
  );
}
