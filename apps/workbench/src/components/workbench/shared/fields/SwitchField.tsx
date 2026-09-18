import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

type Props = {
  label: string;
  value?: boolean;
  onChange?: (checked: boolean) => void;
  description?: string;
};

export function SwitchField({ label, value, onChange, description }: Props) {
  if (value === undefined) return null;
  return (
    <Field
      orientation="horizontal"
      className="[&>[data-slot=field-label]]:flex-none"
    >
      <FieldLabel htmlFor={label} className="w-15 shrink-0 text-xs">
        {label}
      </FieldLabel>
      {description && <FieldDescription>{description}</FieldDescription>}
      <Switch
        id={label}
        checked={value}
        onCheckedChange={onChange}
        disabled={!onChange}
        size="default"
        className="data-[state=checked]:bg-sky-600 dark:data-[state=checked]:bg-sky-300"
      />
    </Field>
  );
}
