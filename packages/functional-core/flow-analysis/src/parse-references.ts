import type {
  ExportDeclaration,
  ExportRef,
  FlowProblem,
  Path,
  Ref,
  StepHttpJson,
  StepDefinition,
} from "@lcase/types";
import { traverse } from "./traverse.js";

export function parseStepRefs<D extends StepDefinition>(
  step: D,
  stepId: string,
): {
  refs: Ref[];
  exportRefs: Record<string, ExportRef>;
  problems: FlowProblem[];
} {
  const refs: Ref[] = [];
  const exportRefs: Record<string, ExportRef> = {};
  const problems: FlowProblem[] = [];

  for (const key in step) {
    const k = key as keyof D;
    // ignore fields which impact control flow in engine
    if (k === "type" || k === "on" || k === "next" || k === "exports") continue;
    traverse(
      step[k],
      (value, path) => parseRef(value, path, stepId, refs, problems),
      [String(k)],
    );
  }

  if (step.type === "httpjson") {
    const httpStep = step as StepHttpJson;
    if (!httpStep.exports) return { refs, exportRefs, problems };

    for (const [exportName, declaration] of Object.entries(httpStep.exports)) {
      const ref = parseExportRef(declaration, stepId, exportName, problems);
      if (!ref) continue;
      exportRefs[exportName] = ref;
    }
  }

  return { refs, exportRefs, problems };
}

export function parseRef(
  value: unknown,
  bindPath: Path,
  stepId: string,
  refs: Ref[],
  problems: FlowProblem[],
): void {
  if (typeof value !== "string") return;
  const matches = getRefStrings(value);

  for (let i = 0; i < matches.length; i++) {
    const matchedString = matches[i][1];
    const matchedScope = matches[i][2];
    const matchedTransform = matches[i][3];

    const path = makePath(matchedString);

    const ref: Ref = {
      valuePath: path,
      scope: "steps",
      stepId,
      bindPath,
      string: matchedString,
      interpolated: isInterpolated(matches.length, value),
      hash: null,
      ...(matchedTransform ? { json: true } : {}),
    };
    if (matchedScope === "steps") {
      refs.push(ref);
    } else if (matchedScope === "params") {
      ref.scope = "params";
      refs.push(ref);
    } else if (matchedScope === "input") {
      ref.scope = "input";
      refs.push(ref);
    } else if (matchedScope === "env") {
      ref.scope = "env";
      refs.push(ref);
    } else {
      console.log("ms", matchedScope);
      console.log(matches);
      problems.push({
        type: "InvalidRefScope",
        refString: matchedString,
        stepId,
        bindPath,
      });
    }
  }
}

export function getRefStrings(value: string): RegExpExecArray[] {
  // {{steps.like.this[3][3].ok}}
  const regex =
    /{{((input|steps|env|params)\.[a-zA-Z0-9\-[\]_.]+)(?:\s+\|\s+?(json))?}}/g;
  const matches = [...value.matchAll(regex)];
  return matches;
}

export function parseExportRef(
  declaration: ExportDeclaration,
  stepId: string,
  exportName: string,
  problems: FlowProblem[],
): ExportRef | undefined {
  const match = declaration.ref.match(/^{{((output)\.[a-zA-Z0-9\-[\]_.]+)}}$/);

  if (!match) {
    problems.push({
      type: "InvalidExportRef",
      stepId,
      exportName,
      exportValue: declaration.ref,
    });
    return;
  }

  return {
    exportName,
    valuePath: makePath(match[1]),
    scope: "output",
    string: match[1],
    type: declaration.type,
    ...(declaration.schema ? { schema: declaration.schema } : {}),
  };
}

/**
 * Parses a string and creates a new Path array of strings or numbers
 * to traverse dynamically.
 * @param templateString object/array look up type string
 * @returns Path
 */
export function makePath(templateString: string): Path {
  const path: Path = [];
  const parts = templateString.split(".");
  for (const part of parts) {
    const { key, index } = parseArray(part);
    if (key && index) {
      path.push(key);
      for (const i of index) path.push(Number(i));
    }
  }
  return path;
}

/**
 * Takes an individual section of the template string and returns either
 * the object or array portions.
 * @param part A section of a template string
 * @returns { key?: string; index?: string[] }
 */
export function parseArray(part: string): { key?: string; index?: string[] } {
  // pull out the name and any array index
  // not robust, just simple
  const regex = /([a-zA-Z0-9\-_]+)/gm;
  const match = part.match(regex);
  if (!match) return {};

  return { key: match[0], index: match.slice(1) };
}

export function isInterpolated(matches: number, value: string) {
  if (matches >= 2) return true;
  if (value.startsWith("{{") && value.endsWith("}}")) return false;
  return true;
}
