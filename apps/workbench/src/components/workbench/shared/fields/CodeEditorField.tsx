import { Field, FieldLabel } from "@/components/ui/field";
import { CodeEditor } from "../CodeEditor";
import { Button } from "@/components/ui/button";
import { Maximize2Icon } from "lucide-react";

type Props = {
  label: string;
  value?: unknown;
  language?: "json" | "markdown" | "plaintext";
  onOpen?: (displayValue: string) => void;
  // Preferred over onOpen when present -- navigates to this field's source
  // location in the json-definition panel instead of flattening to inline
  // text. Takes no arguments since the caller's closure already knows the
  // exact path (see HttpJsonDetails/ExportsField).
  onNavigate?: () => void;
};

export function CodeEditorField({
  label,
  value,
  language = "json",
  onOpen,
  onNavigate,
}: Props) {
  if (value === undefined) return null;

  const displayValue =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);

  return (
    <Field orientation="vertical">
      <div className="flex flex-row justify-between">
        <FieldLabel className="w-20 shrink-0 text-xs">{label}</FieldLabel>
        {(onOpen || onNavigate) && (
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 cursor-pointer"
            onClick={() => (onNavigate ? onNavigate() : onOpen?.(displayValue))}
          >
            <Maximize2Icon className="size-3.5" />
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-hidden mr-3">
        <CodeEditor
          value={displayValue}
          language={language}
          fontSize={10}
          lineNumbersMinChars={2}
          folding={false}
          lineHeight={1.2}
          readOnly
        />
      </div>
    </Field>
  );
}
