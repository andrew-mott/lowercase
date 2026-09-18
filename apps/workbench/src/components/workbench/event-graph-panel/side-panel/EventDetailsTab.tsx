import type { AnyEvent } from "@lcase/types";
import { EventDetails } from "@/components/workbench/event-graph-panel/EventDetails";

// onOpenInMainPanel stays a stubbed no-op -- EventDetails only uses it as a
// fallback when onOpenEventPayload isn't passed (old-mode's own case), and
// this dockview tab always passes onOpenEventPayload. See docs/todo.md.
export function EventDetailsTab({
  event,
  index,
  onOpenEventPayload,
}: {
  event: AnyEvent | null;
  index?: string;
  onOpenEventPayload: (eventId: string, label: string) => void;
}) {
  return (
    <EventDetails
      event={event}
      index={index}
      onOpenInMainPanel={() => {}}
      onOpenEventPayload={onOpenEventPayload}
    />
  );
}
