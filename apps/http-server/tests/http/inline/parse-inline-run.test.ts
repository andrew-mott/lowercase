import { describe, expect, it } from "vitest";
import { parseInlineRun } from "../../../src/http/routes/runs/inline/parse-inline-run.js";

const valid = { flowId: "f", flowVersionId: "v", flowDefHash: "a".repeat(64) };

describe("parseInlineRun", () => {
  it("returns the flow identifiers", () => {
    expect(parseInlineRun(JSON.stringify(valid))).toEqual({
      ok: true,
      value: valid,
    });
  });

  it("rejects a run part that is not json", () => {
    expect(parseInlineRun("{nope")).toEqual({
      ok: false,
      error: 'Part "run" is not valid JSON',
    });
  });

  it("rejects json that is not an object", () => {
    for (const raw of ["[]", "null", '"text"']) {
      expect(parseInlineRun(raw)).toEqual({
        ok: false,
        error: 'Part "run" must be a JSON object',
      });
    }
  });

  it.each([
    ["flowId", "Invalid flowId"],
    ["flowVersionId", "Invalid flowVersionId"],
    ["flowDefHash", "Invalid flowDefHash"],
  ])("rejects a missing %s", (key, error) => {
    const { [key]: _omitted, ...rest } = valid as Record<string, string>;

    expect(parseInlineRun(JSON.stringify(rest))).toEqual({ ok: false, error });
  });
});
