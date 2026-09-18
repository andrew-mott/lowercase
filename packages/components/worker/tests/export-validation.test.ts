import { describe, expect, it } from "vitest";
import { validateExportSchema } from "../src/export-validation.js";

describe("validateExportSchema()", () => {
  const schema = {
    type: "object",
    properties: { location: { type: "string" } },
    required: ["location"],
  };

  it("passes when the value matches the schema", () => {
    const result = validateExportSchema(schema, { location: "Seattle" });
    expect(result).toEqual({ ok: true });
  });

  it("fails with a descriptive message when the value does not match the schema", () => {
    const result = validateExportSchema(schema, { intent: "weather" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("location");
    }
  });

  it("fails when the value is the wrong type entirely", () => {
    const result = validateExportSchema(schema, "not an object");
    expect(result.ok).toBe(false);
  });
});
