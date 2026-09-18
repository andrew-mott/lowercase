import { useReactFlow } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import {
  MaximizeIcon,
  NetworkIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FIT_VIEW_OPTIONS,
  type LayoutDirection,
} from "@/lib/flow-graph-layout";

type Props = {
  layoutDirection: LayoutDirection;
  onSetLayoutDirection: (direction: LayoutDirection) => void;
};

// Zoom in/out, fit view, and layout orientation -- must be rendered inside
// react-flow's own tree (useReactFlow requires a ReactFlowProvider
// ancestor), same as RunToolbar itself already is, via FlowGraph's
// `toolbar` prop. Extracted out of RunToolbar so the flow-authoring preview
// panel (no run/replay/params machinery, just a graph to look at) can reuse
// exactly this group on its own.
export function GraphViewControls({
  layoutDirection,
  onSetLayoutDirection,
}: Props) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="flex items-center gap-1 rounded-lg  bg-background/50 dark:bg-neutral-800 p-1 shadow-md backdrop-blur">
      <Button
        variant="ghost"
        size="xs"
        className="cursor-pointer text-xs text-muted-foreground"
        onClick={() => zoomIn()}
        title="Zoom in"
      >
        <ZoomInIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="xs"
        className="cursor-pointer text-xs text-muted-foreground"
        onClick={() => zoomOut()}
        title="Zoom out"
      >
        <ZoomOutIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="xs"
        className="cursor-pointer text-xs text-muted-foreground"
        onClick={() => fitView(FIT_VIEW_OPTIONS)}
        title="Fit view"
      >
        <MaximizeIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="xs"
        className={cn(
          "cursor-pointer text-xs",
          layoutDirection === "TB"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground",
        )}
        onClick={() => onSetLayoutDirection("TB")}
        title="Vertical layout"
      >
        <NetworkIcon className="size-4" />
      </Button>

      <Button
        variant="ghost"
        size="xs"
        className={cn(
          "cursor-pointer text-xs",
          layoutDirection === "LR"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground",
        )}
        onClick={() => onSetLayoutDirection("LR")}
        title="Horizontal layout"
      >
        <NetworkIcon className="size-4 rotate-270" />
      </Button>
    </div>
  );
}
