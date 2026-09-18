import type { AnyEvent } from "@lcase/types";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import { EventDetailsTab } from "./side-panel/EventDetailsTab";

export type EventGraphSidePanelTab = "eventdetails";

const TAB_LABELS: Record<EventGraphSidePanelTab, string> = {
  eventdetails: "Event Details",
};

type Props = {
  activeTab: EventGraphSidePanelTab;
  onClose: () => void;
  event: AnyEvent | null;
  eventIndex?: string;
  onOpenEventPayload: (eventId: string, label: string) => void;
};

export function SidePanel({
  activeTab,
  onClose,
  event,
  eventIndex,
  onOpenEventPayload,
}: Props) {
  function renderTab() {
    switch (activeTab) {
      case "eventdetails":
        return (
          <EventDetailsTab
            event={event}
            index={eventIndex}
            onOpenEventPayload={onOpenEventPayload}
          />
        );
      default: {
        const _exhaustive: never = activeTab;
        return _exhaustive;
      }
    }
  }

  return (
    <div className="flex h-full flex-col bg-secondary-panel">
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
      <div className="flex-1 min-h-0 overflow-auto p-3">{renderTab()}</div>
    </div>
  );
}
