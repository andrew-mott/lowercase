import type { EvalContextSource } from "@lcase/types";
import { InputField } from "./InputField";

export function EvalContextSourceFields({
  source,
}: {
  source: EvalContextSource;
}) {
  switch (source.source) {
    case "param":
      return (
        <>
          <InputField label="Source" value={source.source} />
          <InputField label="Name" value={source.name} />
        </>
      );
    case "export":
      return (
        <>
          <InputField label="Source" value={source.source} />
          <InputField label="Step Id" value={source.stepId} />
          <InputField label="Name" value={source.name} />
        </>
      );
    case "output":
      return (
        <>
          <InputField label="Source" value={source.source} />
          <InputField label="Step Id" value={source.stepId} />
        </>
      );
  }
}
