import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

export type SidePanelTab =
  | "runinput"
  | "sim"
  | "problems"
  | "parameters"
  | "stepdetails"
  | "stepresults"
  | "settings";

const TAB_LABELS: Record<SidePanelTab, string> = {
  runinput: "Run Input",
  sim: "Simulate",
  problems: "Problems",
  parameters: "Parameters",
  stepdetails: "Step Details",
  stepresults: "Step Results",
  settings: "Settings",
};

type Props = {
  activeTab: SidePanelTab;
  onClose: () => void;
  children: ReactNode;
};

// Pure chrome -- header (label + close) and the scroll container. Which
// tab is active only matters here for the label; deciding *what* to render
// for it is the caller's job (Content.tsx, which already computes
// everything any tab could need), passed down as children -- keeps this
// component's own prop surface from having to grow every time a tab needs
// new data. Used to hold a renderTab() switch + every tab's own props
// directly; moved here once that union got too large to keep justifying
// living in this file instead of Content.tsx.
export function SidePanel({ activeTab, onClose, children }: Props) {
  return (
    <div className="flex h-full flex-col bg-dock-tab-background">
      <div className="flex items-center justify-between  py-1.5">
        <span className="text-sm font-medium">{TAB_LABELS[activeTab]}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 cursor-pointer"
          onClick={onClose}
          title="Close panel"
        >
          <XIcon className="size-4" />
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-1 pr-2 ">{children}</div>
    </div>
  );
}
