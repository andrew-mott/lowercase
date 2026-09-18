import type { CloudScope } from "@lcase/types";
import type { BaseEmitterPort, EnvelopeHeader } from "@lcase/ports";
import type { OtelContext } from "../types.js";

/**
 * NOTE: This current design of the emitters has a few loose ends:
 *
 * Context creation is in the process of being unified as more detail
 * about the creation site for these emitters is gathered.  The class is
 * currently in between the process of moving scope from the EmitterFactory
 * to the emitter classes.
 *
 * Questions remain about how flexible emitters should be.
 *
 * OTEL creation is currently too manual and should not be held by
 * EmitterFactory contexts.
 *
 * A separate Otel class or their SDK should be used to create complex
 * nested parent span relationships.
 *
 * Overall the EmitterFactory and BaseEmitter or other emitters need to
 * be refactored for better DX and Otel features.
 *
 */
export class BaseEmitter implements BaseEmitterPort {
  protected otel: OtelContext;
  protected cloudScope: CloudScope;
  constructor(otel: OtelContext, cloudScope: CloudScope) {
    this.otel = { ...otel };
    this.cloudScope = { ...cloudScope };
  }

  protected envelopeHeader(): EnvelopeHeader {
    return {
      id: String(crypto.randomUUID()),
      time: new Date().toISOString(),
      specversion: "1.0",
      traceid: this.otel.traceId,
      spanid: this.otel.spanId,
      traceparent: this.otel.traceParent,
      ...this.cloudScope,
      ...(this.otel.parentSpanId
        ? { parentspanid: this.otel.parentSpanId }
        : {}),
    };
  }
}
