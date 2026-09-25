import { expectTypeOf, it } from "vitest";
import type {
  EvalContextSource,
  ExportDeclaration,
  FlowDefinition,
  FlowKind,
  FlowOutputDefinition,
  FlowParamDefinition,
  HttpExportDeclaration,
  HttpJsonEvalContextSource,
  HttpJsonExportDeclaration,
  StepBranch,
  StepCapCommonFields,
  StepDefinition,
  StepHttp,
  StepJoin,
  StepMcp,
  StepOnField,
  StepParallel,
  StepHttpJson,
} from "@lcase/types";

// The http step's schema restates shapes that other steps define in Zod. These
// fail to compile if the generated copies stop fitting the hand-written types
// that flow analysis and the engine read.
it("generated http step shapes fit the shared step types", () => {
  expectTypeOf<NonNullable<StepHttp["on"]>>().toExtend<
    NonNullable<StepOnField["on"]>
  >();
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

it("generated flow roots preserve their public shapes", () => {
  expectTypeOf<FlowDefinition["name"]>().toEqualTypeOf<string>();
  expectTypeOf<FlowDefinition["start"]>().toEqualTypeOf<string>();
  expectTypeOf<FlowDefinition["params"]>().toEqualTypeOf<
    Record<string, FlowParamDefinition> | undefined
  >();
  expectTypeOf<FlowDefinition["outputs"]>().toEqualTypeOf<
    Record<string, FlowOutputDefinition> | undefined
  >();
  expectTypeOf<
    Extract<StepDefinition, { type: "http" }>
  >().toEqualTypeOf<StepHttp>();
  expectTypeOf<
    Extract<StepDefinition, { type: "mcp" }>
  >().toEqualTypeOf<StepMcp>();
  expectTypeOf<
    Extract<StepDefinition, { type: "httpjson" }>
  >().toEqualTypeOf<StepHttpJson>();
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

it("generated httpjson shapes preserve the legacy public names", () => {
  expectTypeOf<HttpJsonEvalContextSource>().toEqualTypeOf<EvalContextSource>();
  expectTypeOf<HttpJsonExportDeclaration>().toEqualTypeOf<ExportDeclaration>();
  expectTypeOf<StepHttpJson["type"]>().toEqualTypeOf<"httpjson">();
  expectTypeOf<StepHttpJson["url"]>().toEqualTypeOf<string>();
  expectTypeOf<StepHttpJson["exports"]>().toEqualTypeOf<
    Record<string, ExportDeclaration> | undefined
  >();
});

it("generated MCP steps preserve their public shape", () => {
  expectTypeOf<StepMcp["type"]>().toEqualTypeOf<"mcp">();
  expectTypeOf<StepMcp["url"]>().toEqualTypeOf<string>();
  expectTypeOf<StepMcp["transport"]>().toEqualTypeOf<
    "sse" | "stdio" | "streamable-http" | "http"
  >();
  expectTypeOf<StepMcp["feature"]>().toEqualTypeOf<{
    primitive:
      "resource" | "prompt" | "tool" | "sampling" | "roots" | "elicitation";
    name: string;
  }>();
});
