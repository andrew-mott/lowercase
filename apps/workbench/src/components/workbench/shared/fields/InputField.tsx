import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Props = {
  label: string;
  value?: string;
  error?: string;
  description?: string;
  onChange?: (value: string) => void;
};

export function InputField({
  label,
  value,
  description,
  error,
  onChange,
}: Props) {
  if (value === undefined) return null;
  return (
    <Field
      orientation="vertical"
      className="gap-1 "
      // className="[&>[data-slot=field-label]]:flex-none"
    >
      <FieldLabel htmlFor={label} className="shrink-0 text-neutral-400 text-xs">
        {label}
      </FieldLabel>
      {description && <FieldDescription>{description}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
      <Input
        id={label}
        type="text"
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        readOnly={!onChange}
        className="flex-1 md:text-xs py-1 px-2 border-0 truncate bg-neutral-100"
      />
    </Field>
  );
}
