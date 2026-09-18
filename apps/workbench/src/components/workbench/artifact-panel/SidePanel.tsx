import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import type { ArtifactSidePanelTab } from "@/redux/slices/artifact-panels-slice";

const TAB_LABELS: Record<ArtifactSidePanelTab, string> = {
  metadata: "Metadata",
};

type Props = {
  activeTab: ArtifactSidePanelTab;
  onClose: () => void;
  children: ReactNode;
};

// Pure chrome -- header (label + close) and the scroll container, same shape
// as flow-graph-panel/SidePanel.tsx. Only one tab exists today, but kept as
// a real Rail+SidePanel pair (not a single toggled pane) so a second tab
// later is a Rail item + case, not a restructure.
export function SidePanel({ activeTab, onClose, children }: Props) {
  return (
    <div className="flex h-full flex-col">
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
      <div className="flex-1 min-h-0 overflow-auto p-1">{children}</div>
    </div>
  );
}
