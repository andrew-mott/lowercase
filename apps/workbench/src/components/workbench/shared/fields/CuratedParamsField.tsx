import type { FlowParamDefinition } from "@lcase/types";
import { Field, FieldLabel } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type Props = {
  label: string;
  params?: Record<string, FlowParamDefinition>;
  curatedParamNames: string[];
  onToggleParam?: (paramName: string, checked: boolean) => void;
};

export function CuratedParamsField({
  label,
  params,
  curatedParamNames,
  onToggleParam,
}: Props) {
  const entries = params ? Object.keys(params) : [];
  if (entries.length === 0) return null;

  const curated = new Set(curatedParamNames);

  return (
    <Field
      orientation="horizontal"
      className="[&>[data-slot=field-label]]:flex-none items-start"
    >
      <FieldLabel className="w-15 shrink-0 mt-2 text-xs font-bold">
        {label}
      </FieldLabel>
      <div className="flex-1 flex flex-col gap-2 mr-3">
        {entries.map((paramName) => (
          <div key={paramName} className="flex items-center gap-2">
            <Checkbox
              id={`param-${paramName}`}
              checked={curated.has(paramName)}
              onCheckedChange={
                onToggleParam
                  ? (checked) => onToggleParam(paramName, !!checked)
                  : undefined
              }
              disabled={!onToggleParam}
              className="data-[state=checked]:bg-sky-600 data-[state=checked]:text-neutral-50 dark:data-[state=checked]:bg-sky-700 border-0 checked:neutral-50"
            />
            <Label
              htmlFor={`param-${paramName}`}
              className="text-sm font-normal"
            >
              {paramName}
            </Label>
          </div>
        ))}
      </div>
    </Field>
  );
}
