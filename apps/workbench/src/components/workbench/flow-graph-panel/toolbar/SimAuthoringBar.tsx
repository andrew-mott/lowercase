import { Button } from "@/components/ui/button";

type Props = {
  reuseCount: number;
  onSave: () => void;
  onCancel: () => void;
};

// Persistent authoring anchor -- rendered via FlowGraph's own top-center
// `Panel`, independent of the bottom-center RunToolbar and of the rail/side
// panel, so it stays visible while inspecting different steps mid-authoring.
export function SimAuthoringBar({ reuseCount, onSave, onCancel }: Props) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-violet-300 dark:bg-violet-900 px-2 py-1 shadow-md backdrop-blur text-xs">
      {/* two atomic phrases, each whitespace-nowrap, inside a flex-wrap row
          -- since there are exactly two, wrapping can only ever produce one
          row (side by side) or two (stacked), never a mid-phrase break */}
      <div className="flex flex-wrap items-baseline gap-x-1.5 dark:text-muted-foreground min-w-0">
        <span className="whitespace-nowrap">New sim</span>
        <span className="whitespace-nowrap">{reuseCount} reused</span>
      </div>
      <Button
        variant="ghost"
        size="xs"
        className="cursor-pointer"
        onClick={onCancel}
      >
        Cancel
      </Button>
      <Button
        variant="outline"
        size="xs"
        className="cursor-pointer"
        onClick={onSave}
        disabled={reuseCount === 0}
      >
        Save
      </Button>
    </div>
  );
}
