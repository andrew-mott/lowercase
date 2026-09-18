import { appendFileSync } from "fs";
import type {
  EffectHandler,
  EffectHandlerDeps,
  WriteContextToDiskFx,
} from "../engine.types.js";
import path from "path";

export const writeContextToDiskFx: EffectHandler<"WriteContextToDisk"> = (
  effect: WriteContextToDiskFx,
  _deps: EffectHandlerDeps,
) => {
  const filename = `${effect.runId.slice(0, 8)}-original.temp.jsonl`;
  const fullFilePath = path.join(process.cwd(), filename);
  appendFileSync(fullFilePath, JSON.stringify(effect.context) + "\n", {
    encoding: "utf8",
  });
};
