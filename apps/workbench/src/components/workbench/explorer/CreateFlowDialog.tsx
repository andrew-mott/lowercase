import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/redux/typed-hooks";
import { setFlowAuthoringContent } from "@/redux/slices/flow-authoring-panels-slice";
import { useDockviewApi } from "@/components/workbench/dock/dock-context";
import {
  openOrFocusPanel,
  FLOW_AUTHORING_ID,
} from "@/components/workbench/dock/dock-panels";
import { TextCursorIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// "Upload a file" and "Create new" both land in the same editable
// flow-authoring panel (unlike CreateArtifactDialog's upload path, which
// stays entirely in a modal) -- a flow definition has a structural preview
// (the graph) that a plain artifact upload doesn't, so both paths benefit
// from the same live validation rather than upload being a dead end if the
// file has a fixable problem. See docs/initiatives/ui-workspace/arcs/
// flow-authoring.md's the related change entry for the full discussion.
export function CreateFlowDialog({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<"choose" | "upload">("choose");
  const dispatch = useAppDispatch();
  const dockviewApi = useDockviewApi();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const reset = () => {
    setStep("choose");
    setPickError(null);
  };

  // Same reset-only-on-fresh-open rule as CreateArtifactDialog.tsx --
  // resetting on close would flip content while DialogContent is still
  // fading out.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) reset();
  }

  function openAuthoringPanel() {
    if (!dockviewApi) return;
    openOrFocusPanel(dockviewApi, {
      kind: "flow-authoring",
      label: "New Flow",
    });
  }

  function handleCreateNew() {
    openAuthoringPanel();
    onOpenChange(false);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) return;
    try {
      const text = await picked.text();
      // Singleton panel, so re-triggering upload while a draft is already
      // in progress silently overwrites it -- accepted edge case, no
      // confirm dialog in v1 (see the arc doc).
      dispatch(
        setFlowAuthoringContent({ panelId: FLOW_AUTHORING_ID, content: text }),
      );
      openAuthoringPanel();
      onOpenChange(false);
    } catch {
      const message = "Couldn't read that file. Try a different one.";
      setPickError(message);
      toast.error(message, { position: "top-center" });
    } finally {
      e.target.value = "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-0 dark:bg-neutral-875">
        <DialogHeader>
          <DialogTitle>New flow</DialogTitle>
        </DialogHeader>

        {step === "choose" ? (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer justify-start hover:bg-lime-200"
              onClick={() => setStep("upload")}
            >
              <UploadIcon />
              Upload a file
            </Button>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer justify-start hover:bg-lime-200"
              onClick={handleCreateNew}
            >
              <TextCursorIcon />
              Create new
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer hover:bg-sky-200"
              >
                Browse...
              </Button>
              <p className="text-sm text-muted-foreground">No file selected</p>
            </div>
            {pickError && (
              <p className="text-xs text-destructive">{pickError}</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer hover:bg-rose-200"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
