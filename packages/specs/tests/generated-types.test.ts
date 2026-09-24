import { expectTypeOf, it } from "vitest";
import type {
  ExportDeclaration,
  FlowKind,
  FlowOutputDefinition,
  FlowParamDefinition,
  HttpExportDeclaration,
  HttpStepOn,
  StepBranch,
  StepCapCommonFields,
  StepJoin,
  StepOnField,
  StepParallel,
} from "@lcase/types";

// The http step's schema restates shapes that other steps define in Zod. These
// fail to compile if the generated copies stop fitting the hand-written types
// that flow analysis and the engine read.
it("generated http step shapes fit the shared step types", () => {
  expectTypeOf<HttpStepOn>().toExtend<NonNullable<StepOnField["on"]>>();
  expectTypeOf<HttpExportDeclaration>().toExtend<ExportDeclaration>();
});

it("generated flow foundations preserve their public shapes", () => {
  expectTypeOf<FlowKind>().toEqualTypeOf<"business" | "eval">();
  expectTypeOf<FlowParamDefinition["type"]>().toEqualTypeOf<string>();
  expectTypeOf<FlowParamDefinition["optional"]>().toEqualTypeOf<
    true | undefined
  >();
  expectTypeOf<FlowOutputDefinition["payload"]>().toEqualTypeOf<string>();
});

it("generated structural steps preserve their public shapes", () => {
  expectTypeOf<StepBranch["type"]>().toEqualTypeOf<"branch">();
  expectTypeOf<StepBranch["value"]>().toEqualTypeOf<string>();
  expectTypeOf<StepBranch["cases"]>().toEqualTypeOf<Record<string, string>>();
  expectTypeOf<StepBranch["default"]>().toEqualTypeOf<string>();
  expectTypeOf<StepJoin["type"]>().toEqualTypeOf<"join">();
  expectTypeOf<StepJoin["steps"]>().toEqualTypeOf<string[]>();
  expectTypeOf<StepJoin["next"]>().toEqualTypeOf<string>();
  expectTypeOf<StepParallel["type"]>().toEqualTypeOf<"parallel">();
  expectTypeOf<StepParallel["steps"]>().toEqualTypeOf<string[]>();
});

it("generated shared capability fields preserve their public shapes", () => {
  expectTypeOf<StepCapCommonFields["args"]>().toEqualTypeOf<
    Record<string, unknown> | undefined
  >();
  expectTypeOf<StepCapCommonFields["tool"]>().toEqualTypeOf<
    string | undefined
  >();
  expectTypeOf<StepOnField["on"]>().toEqualTypeOf<
    { success?: string; failure?: string } | undefined
  >();
});
