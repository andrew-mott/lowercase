import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePostSimsMutation } from "@/redux/api/sims-api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flowId: string;
  flowVersionId: string;
  parentRunId: string;
  reuse: string[];
  onSaved: () => void;
};

// This dialog's own Cancel only closes the dialog -- it does not end
// authoring. Only the caller's authoring bar's Cancel does that; onSaved
// (which does end it) is only ever called after a real, successful save.
export function SaveSimDialog({
  open,
  onOpenChange,
  flowId,
  flowVersionId,
  parentRunId,
  reuse,
  onSaved,
}: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [postSim, postState] = usePostSimsMutation();

  const handleSave = async () => {
    if (!name.trim()) return;
    const result = await postSim({
      flowId,
      flowVersionId,
      parentRunId,
      reuse,
      name,
      ...(description.trim() ? { description: description.trim() } : {}),
    });
    if (result.data?.ok) {
      toast.success(`Saved sim "${name}"`);
      onOpenChange(false);
      onSaved();
      return;
    }
    // Two distinct failure shapes here, per this app's {ok,value}/{ok,error}
    // envelope convention -- a transport-level failure never reaches
    // result.data at all (that's postState.error, a plain RTK Query
    // error), while result.data?.ok === false is a real HTTP response
    // carrying a logical failure the server reported on purpose.
    const message =
      result.data?.ok === false ? result.data.error : "Couldn't save the sim.";
    toast.error(message);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-0 dark:bg-neutral-875">
        <DialogHeader>
          <DialogTitle>Save sim</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sim-name">
              Name{" "}
              <span className="text-muted-foreground text-xs">required</span>
            </Label>
            <Input
              id="sim-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sim-description">Description</Label>
            <Textarea
              id="sim-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {postState.error && (
            <p className="text-sm text-destructive">Couldn't save the sim.</p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            className="cursor-pointer"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="cursor-pointer"
            onClick={handleSave}
            disabled={!name.trim() || postState.isLoading}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
