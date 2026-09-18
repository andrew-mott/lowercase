import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  label: string;
  value?: string;
  options: { value: string; label: string }[];
  onChange?: (value: string) => void;
};

export function SelectField({ label, value, options, onChange }: Props) {
  if (value === undefined) return null;
  return (
    <Field
      orientation="horizontal"
      className="[&>[data-slot=field-label]]:flex-none"
    >
      <FieldLabel className="w-20 shrink-0">{label}</FieldLabel>
      <Select value={value} onValueChange={onChange} disabled={!onChange}>
        <SelectTrigger className="flex-1 mr-3">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
