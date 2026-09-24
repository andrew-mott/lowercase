// Generated from packages/specs/src/schemas/join.step.schema.json.
// Do not edit. Change the schema, then run `pnpm -F @lcase/specs gen`.

export type StepJoin = {
  type: "join";
  steps: string[];
  next: string;
};
