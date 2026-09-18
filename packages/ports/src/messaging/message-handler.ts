import type { EventType } from "@lcase/types";
import type { MessageOf } from "./message-publisher.port.js";

/**
 * A component-owned boundary that interprets one accepted Message: translate
 * the envelope into the component's own vocabulary, invoke core behavior, and
 * publish whatever Messages result.
 *
 * The returned Promise is the truth boundary for that delivery. It resolves
 * only once the work this handler claims to perform has finished and every
 * immediate resulting Message has reached its own admission
 * boundary -- it does not wait on those recipients in turn. A handler must not
 * start an authoritative publish as an untracked `void` Promise.
 *
 * Handlers never see a delivery or acknowledgement token; retiring a delivery
 * belongs to whatever carrier invoked the handler.
 */
export type MessageHandler<T extends EventType> = (
  message: MessageOf<T>,
) => Promise<void>;
