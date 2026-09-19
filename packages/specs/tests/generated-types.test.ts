import { expectTypeOf, it } from "vitest";
import type {
  ExportDeclaration,
  HttpExportDeclaration,
  HttpStepOn,
  StepOnField,
} from "@lcase/types";

// The http step's schema restates shapes that other steps define in Zod. These
// fail to compile if the generated copies stop fitting the hand-written types
// that flow analysis and the engine read.
it("generated http step shapes fit the shared step types", () => {
  expectTypeOf<HttpStepOn>().toExtend<NonNullable<StepOnField["on"]>>();
  expectTypeOf<HttpExportDeclaration>().toExtend<ExportDeclaration>();
});
