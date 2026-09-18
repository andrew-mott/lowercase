import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Props = {
  label: string;
  value?: string[];
  ordered?: boolean;
};

export function InputListField({ label, value, ordered = true }: Props) {
  if (!value || value.length === 0) return null;

  return (
    <Field orientation="vertical" className="items-start">
      <FieldLabel className="shrink-0 text-xs">{label}</FieldLabel>
      <div className="flex-1 flex flex-col gap-2 mr-3">
        {value.map((item, index) => (
          <div key={index} className="flex flex-row items-center gap-2">
            {ordered && (
              <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">
                {index + 1}.
              </span>
            )}
            <Input
              value={item}
              readOnly
              className="flex-1 h-6 pl-2 md:text-xs border-0"
            />
          </div>
        ))}
      </div>
    </Field>
  );
}
