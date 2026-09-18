import type { OtelAttributesMap } from "@lcase/types";
import {
  stepOtelAttributes,
  flowOtelAttributes,
  engineOtelAttributesMap,
  runOtelAttributesMap,
  jobOtelAttributesMap,
  toolOtelAttributesMap,
  workerOtelAttributesMap,
  systemOtelAttributesMap,
} from "../otel-attributes.js";
import { limiterOtelAttributesMap } from "./limiter/otel.map.js";
import { schedulerOtelAttributesMap } from "./scheduler/otel.map.js";
import { replayOtelAttributesMap } from "./replay/replay.otel.js";

/**
 * Combined EventType -> {domain, action, entity?} lookup for the new event-emission
 * core, merging the eleven existing per-domain maps verbatim -- no new derivation
 * logic. `satisfies OtelAttributesMap` requires every EventType key to be present, so
 * this also functions as a free cross-domain exhaustiveness check.
 *
 * Likely a provisional stitch-together, not a long-term fixture: it exists to give
 * emit() one lookup to read from now, without touching the eleven files it merges.
 * Once the schema-generation question (packages/events' hand-rolled Zod schemas, or a
 * real replacement for the hand-typed otel-attributes.ts maps themselves) is
 * resolved, this file is a likely casualty/superseded artifact, not something to
 * build further on top of.
 */
export const otelAttributesRegistry = {
  ...stepOtelAttributes,
  ...flowOtelAttributes,
  ...engineOtelAttributesMap,
  ...runOtelAttributesMap,
  ...jobOtelAttributesMap,
  ...toolOtelAttributesMap,
  ...workerOtelAttributesMap,
  ...systemOtelAttributesMap,
  ...limiterOtelAttributesMap,
  ...schedulerOtelAttributesMap,
  ...replayOtelAttributesMap,
} satisfies OtelAttributesMap;
