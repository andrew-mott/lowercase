import { useContext, useEffect, useState } from "react";
import { useController } from "../../context/ControllerContext.js";
import { useObsEvent } from "../../hooks/obsEvent.js";
import type { AnyEvent } from "@lcase/types";
import { ObsEventBar } from "./ObsEventBar.js";
import { ObsControls } from "./ObsControls.js";
import { AppContext } from "../../context/AppContext.js";

const eventIds = new Set<string>();
export function ObsPanel() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    console.error("[obs-panel] no app context");
    return;
  }
  const [events, setEvents] = useState<AnyEvent[]>([]);
  const event = useObsEvent("observability:event");

  useEffect(() => {
    eventIds.clear();
    setEvents([]);
    ctx.setTotalEvents(0);
  }, [ctx.clearEventsSignal]);

  useEffect(() => {
    if (event && !eventIds.has(event.id)) {
      console.log(event.id);
      eventIds.add(event.id);
      setEvents([...events, event]);
      ctx.setTotalEvents(events.length + 1);
    }
  }, [event]);

  return (
    <>
      <div>
        <ObsControls />
      </div>
      <div className="obs-container">
        <div className="event-list flex flex-col mt-5">
          {events.map((e: AnyEvent, i) => (
            <ObsEventBar key={e.traceparent + e.time + i} event={e} />
          ))}
        </div>
      </div>
    </>
  );
}
