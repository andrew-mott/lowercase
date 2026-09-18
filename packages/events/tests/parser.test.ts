import { describe, it, expect } from "vitest";
import type { AnyEvent } from "@lcase/types";
import { EventParser } from "../src/parsers/event-parser.js";
import { eventSchemaRegistry } from "../src/registries/event-schema.registry.js";

describe("parser", () => {
  it("should not throw for parsing valid event payloads", () => {
    const ep = new EventParser(eventSchemaRegistry);
    const testEvent1 = {
      id: "",
      source: "",
      specversion: "1.0",
      time: "",
      type: "job.httpjson.submitted",
      data: {
        url: "",
        refs: [],
        exportRefs: {
          parsed: {
            exportName: "parsed",
            valuePath: ["output", "foo"],
            scope: "output",
            string: "output.foo",
            type: "application/json",
          },
        },
      },
      domain: "job",
      action: "submitted",
      entity: "httpjson",
      traceparent: "",
      traceid: "",
      spanid: "",
      flowid: "",
      flowversionid: "",
      runid: "",
      stepid: "",
      jobid: "",
      capid: "httpjson",
      toolid: "httpjson",
    } satisfies AnyEvent<"job.httpjson.submitted">;

    expect(() => {
      ep.parse(testEvent1, "job.httpjson.submitted");
    }).not.toThrow();
  });
  it("should throw when parsing mismatched event payloads", () => {
    const ep = new EventParser(eventSchemaRegistry);
    const testEvent1 = {
      id: "",
      source: "",
      specversion: "1.0",
      time: "",
      type: "job.httpjson.queued",
      data: {
        url: "",
        refs: [],
        exportRefs: {
          parsed: {
            exportName: "parsed",
            valuePath: ["output", "foo"],
            scope: "output",
            string: "output.foo",
            type: "application/json",
          },
        },
      },
      domain: "job",
      action: "submitted",
      entity: "httpjson",
      traceparent: "",
      traceid: "",
      spanid: "",
      flowid: "",
      flowversionid: "",
      runid: "",
      stepid: "",
      jobid: "",
      capid: "httpjson",
      toolid: "httpjson",
    } as AnyEvent;

    expect(() => {
      ep.parse(testEvent1, "job.httpjson.submitted");
    }).toThrow();
  });
});
