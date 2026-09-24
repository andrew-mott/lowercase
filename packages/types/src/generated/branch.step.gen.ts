// Generated from packages/specs/src/schemas/branch.step.schema.json.
// Do not edit. Change the schema, then run `pnpm -F @lcase/specs gen`.

export type StepBranch = {
  type: "branch";
  value: string;
  cases: {
    [k: string]: string;
  };
  default: string;
};
