import type { ExportDeclaration } from "@lcase/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { InputField } from "./InputField";
import { CodeEditorField } from "./CodeEditorField";
import { EvalContextField } from "./EvalContextField";
import type { OpenInMainPanel } from "@/components/workbench/shared/MainPanelTypes";

type Props = {
  label: string;
  stepId: string;
  value?: Record<string, ExportDeclaration>;
  onOpenInMainPanel: OpenInMainPanel;
  onNavigateToDefinition?: (path: string[]) => void;
};

export function ExportsField({
  label,
  stepId,
  value,
  onOpenInMainPanel,
  onNavigateToDefinition,
}: Props) {
  const entries = value ? Object.entries(value) : [];
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 mt-2">
      <h4 className="text-xs font-bold">{label}</h4>
      <Accordion
        type="multiple"
        className="rounded-md border-0 px-3 bg-neutral-100/40 dark:bg-neutral-750"
      >
        {entries.map(([name, exportDecl]) => (
          <AccordionItem key={name} value={name}>
            <AccordionTrigger>
              <span className="flex items-center gap-1">
                {name}
                <span className="rounded bg-muted px-1.5 text-xs font-normal text-muted-foreground">
                  {exportDecl.type}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3">
              <InputField label="Ref" value={exportDecl.ref} />
              <InputField label="Type" value={exportDecl.type} />
              <CodeEditorField
                label="Schema"
                value={exportDecl.schema}
                onOpen={(displayValue) =>
                  onOpenInMainPanel(
                    `Step "${stepId}" - export "${name}" - schema`,
                    displayValue,
                    "json",
                  )
                }
                onNavigate={
                  onNavigateToDefinition
                    ? () =>
                        onNavigateToDefinition([
                          "steps",
                          stepId,
                          "exports",
                          name,
                          "schema",
                        ])
                    : undefined
                }
              />
              <EvalContextField
                label="Eval Context"
                value={exportDecl.evalContext}
              />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
