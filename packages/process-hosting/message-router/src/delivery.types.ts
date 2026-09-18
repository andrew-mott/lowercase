import type { EventType } from "@lcase/types";
import type { MessageOf } from "@lcase/ports";

/** One delivered Message, in the erased form a router moves internally. */
export type DeliveredMessage = MessageOf<EventType>;

/**
 * What a failed delivery reports. Deliberately identity only -- a Message's
 * `data` can carry request bodies, headers, and other caller-supplied input,
 * so it must not be written to a log by default.
 */
export type DeliveryFailure = {
  subscriptionId: string;
  messageId: string;
  messageType: EventType;
  source: string;
  error: unknown;
};

export type ReportDeliveryFailure = (failure: DeliveryFailure) => void;

// Shared by every carrier rather than owned by the in-process one: a
// log-backed router reports the same failures about the same subscriptions,
// and an operator reading them should not be able to tell which carrier
// produced one.
export function defaultReportFailure(failure: DeliveryFailure): void {
  console.error(
    `[message-router] subscription '${failure.subscriptionId}' failed to handle ${failure.messageType} (id ${failure.messageId}, source ${failure.source})`,
    failure.error,
  );
}
