import { useState } from "react";
import { InfoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ArtifactSidePanelTab } from "@/redux/slices/artifact-panels-slice";

type Props = {
  activeTab: ArtifactSidePanelTab | null;
  onSelectTab: (tab: ArtifactSidePanelTab) => void;
};

const RAIL_ITEMS: {
  tab: ArtifactSidePanelTab;
  label: string;
  icon: typeof InfoIcon;
}[] = [{ tab: "metadata", label: "Metadata", icon: InfoIcon }];

// Same shape as flow-graph-panel/Rail.tsx -- one item today, but a real
// Rail rather than a bare toggle button, so a second tab is additive later.
export function Rail({ activeTab, onSelectTab }: Props) {
  const [openTab, setOpenTab] = useState<ArtifactSidePanelTab | null>(null);

  return (
    <div className="flex h-full w-12 shrink-0 flex-col items-center gap-1 py-2">
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
