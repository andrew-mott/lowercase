import { describe, it, expect } from "vitest";
import { RefSchema } from "../src/schemas/job/job.data.schema.js";

const baseRef = {
  valuePath: ["params", "audio"],
  bindPath: ["body", "artifact"],
  interpolated: false,
  string: "{{params.audio}}",
  stepId: "step-a",
  hash: null,
  scope: "params" as const,
};

describe("RefSchema", () => {
  it("accepts a widened paramType MIME string, not just the three legacy literals", () => {
    const result = RefSchema.safeParse({ ...baseRef, paramType: "audio/wav" });
    expect(result.success).toBe(true);
  });

  it("still rejects a widened exportType -- exports stay text-safe", () => {
    const result = RefSchema.safeParse({ ...baseRef, exportType: "audio/wav" });
    expect(result.success).toBe(false);
  });
});
