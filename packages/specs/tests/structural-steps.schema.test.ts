import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import branchStepSchema from "../src/schemas/branch.step.schema.json" with { type: "json" };
import joinStepSchema from "../src/schemas/join.step.schema.json" with { type: "json" };
import parallelStepSchema from "../src/schemas/parallel.step.schema.json" with { type: "json" };

const validate = (schema: object, value: unknown) =>
  new Ajv2020().compile(schema)(value);

describe("structural step schemas", () => {
  it("matches branch steps", () => {
    expect(
      validate(branchStepSchema, {
        type: "branch",
        value: "{{params.route}}",
        cases: { paid: "invoice" },
        default: "support",
      }),
    ).toBe(true);
    expect(
      validate(branchStepSchema, {
        type: "branch",
        value: "{{params.route}}",
        cases: {},
      }),
    ).toBe(false);
    expect(
      validate(branchStepSchema, {
        type: "branch",
        value: "{{params.route}}",
        cases: { paid: 1 },
        default: "support",
      }),
    ).toBe(false);
  });

  it("matches join steps", () => {
    expect(
      validate(joinStepSchema, { type: "join", steps: [], next: "" }),
    ).toBe(true);
    expect(
      validate(joinStepSchema, { type: "join", steps: ["a", 2], next: "done" }),
    ).toBe(false);
    expect(
      validate(joinStepSchema, {
        type: "join",
        steps: ["a"],
        next: "done",
        extra: true,
      }),
    ).toBe(false);
  });

  it("matches parallel steps", () => {
    expect(validate(parallelStepSchema, { type: "parallel", steps: [] })).toBe(
      true,
    );
    expect(validate(parallelStepSchema, { type: "join", steps: [] })).toBe(
      false,
    );
    expect(
      validate(parallelStepSchema, {
        type: "parallel",
        steps: ["a"],
        extra: true,
      }),
    ).toBe(false);
  });
});
