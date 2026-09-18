import type { EvalContextSource } from "@lcase/types";
import { EvalContextSourceFields } from "./EvalContextSourceFields";

type Props = {
  label: string;
  value?: Record<string, EvalContextSource>;
};

export function EvalContextField({ label, value }: Props) {
  const entries = value ? Object.entries(value) : [];
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mt-1">
      <h5 className="text-xs font-semibold text-muted-foreground">{label}</h5>
      <div className="flex flex-col gap-3 rounded-md border-0 dark:border-neutral-600 dark:bg-neutral-875 py-2 pl-3">
        {entries.map(([name, source]) => (
          <div key={name} className="flex flex-col gap-1">
            <span className="text-xs font-medium">{name}</span>
            <div className="flex flex-col gap-2 pl-2">
              <EvalContextSourceFields source={source} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
