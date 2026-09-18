import { useState } from "react";
import { FileTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EventGraphSidePanelTab } from "./SidePanel";

type Props = {
  activeTab: EventGraphSidePanelTab | null;
  onSelectTab: (tab: EventGraphSidePanelTab) => void;
};

const RAIL_ITEMS: {
  tab: EventGraphSidePanelTab;
  label: string;
  icon: typeof FileTextIcon;
}[] = [{ tab: "eventdetails", label: "Event Details", icon: FileTextIcon }];

// Same rail pattern as flow-graph-panel/Rail.tsx, trimmed to one item --
// icons always select a tab, never toggle it closed on re-click; closing is
// only the SidePanel's own X button.
export function Rail({ activeTab, onSelectTab }: Props) {
  const [openTab, setOpenTab] = useState<EventGraphSidePanelTab | null>(null);

  return (
    <div className="flex h-full w-12 shrink-0 flex-col items-center gap-1 py-2 bg-secondary-panel">
      {RAIL_ITEMS.map(({ tab, label, icon: Icon }) => (
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
                "cursor-pointer",
                activeTab === tab && "bg-accent text-accent-foreground",
              )}
              onClick={() => onSelectTab(tab)}
            >
              <Icon className="size-4" />
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
