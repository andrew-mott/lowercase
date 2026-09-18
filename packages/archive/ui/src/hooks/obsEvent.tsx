import { useState, useEffect } from "react";
import type { AnyEvent } from "@lcase/types";
import { useController } from "../context/ControllerContext.js";

const delayIncrementMs = 20;
let currentDelayMs = 0;
let totalEventsInFlight = 0;
export function useObsEvent(channel: string): AnyEvent | null {
  const [message, setMessage] = useState<AnyEvent | null>(null);

  const controller = useController();

  useEffect(() => {
    controller.subscribeToChannel<AnyEvent>(
      "observability:event",
      (event: AnyEvent) => {
        totalEventsInFlight++;
        currentDelayMs = delayIncrementMs * totalEventsInFlight;
        setTimeout(() => {
          totalEventsInFlight--;
          setMessage(event);
          console.log(`ms:${currentDelayMs} total: ${totalEventsInFlight}`);
        }, currentDelayMs);
      },
    );
  }, [channel]);

  return message;
}
