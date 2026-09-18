import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileInputIcon,
  PlayIcon,
  PauseIcon,
  XIcon,
  ChevronUpIcon,
  TerminalIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  LayoutDirection,
  ReplayState,
  ReplaySpeed,
} from "@/redux/slices/flow-graph-panels-slice";
import { GraphViewControls } from "@/components/workbench/shared/flow-graph/GraphViewControls";

import {
  EVENT_GRAPH_ICON,
  EVENT_GRAPH_ICON_CLASS,
  SIM_ICON,
  SIM_ICON_CLASS,
} from "@/components/workbench/shared/tab-icons";

type Props = {
  hasParams: boolean;
  paramsHasUnsetRequired: boolean;
  showSimulate: boolean;
  runDisabled: boolean;
  onOpenParams: () => void;
  onOpenSim: () => void;
  onOpenEventGraph: () => void;
  onRun: () => void;
  isRerun?: boolean;
  layoutDirection: LayoutDirection;
  onSetLayoutDirection: (direction: LayoutDirection) => void;
  replayAvailable: boolean;
  replay: ReplayState | null;
  replaySpeed: ReplaySpeed;
  onTogglePlayPause: () => void;
  onCancelReplay: () => void;
  onSetReplaySpeed: (speed: ReplaySpeed) => void;
};

const REPLAY_SPEEDS: ReplaySpeed[] = [0.25, 0.5, 1, 2];

// bottom-center floating toolbar over the graph canvas (via FlowGraph's
// `toolbar` prop / react-flow's own `Panel`) -- Params keeps a reserved slot
// so Run's position never moves regardless of flow content; Simulate is
// removed outright (no reserved slot) instead, when hidden -- unlike
// Params, whose absence is just "this flow has none", Simulate being
// hidden means "viewing a sim directly, nothing to do here but look, which
// the rail's own Simulate tab already covers" -- a different enough case
// not to reuse the same placeholder treatment.
export function RunToolbar({
  hasParams,
  paramsHasUnsetRequired,
  showSimulate,
  runDisabled,
  onOpenParams,
  onOpenSim,
  onOpenEventGraph,
  onRun,
  isRerun,
  layoutDirection,
  onSetLayoutDirection,
  replayAvailable,
  replay,
  replaySpeed,
  onTogglePlayPause,
  onCancelReplay,
  onSetReplaySpeed,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      <GraphViewControls
        layoutDirection={layoutDirection}
        onSetLayoutDirection={onSetLayoutDirection}
      />
      <div className="flex items-center gap-1 rounded-lg  bg-background/50 dark:bg-neutral-800 p-1 shadow-md backdrop-blur">
        {/* Fused "split button": Play/Pause plus an adjoining speed sliver,
            so a speed can be picked *before* pressing Play, not only
            adjusted mid-playback -- fast flows otherwise leave no time to
            react once started. The sliver stays visible/enabled the same
            as Play itself (not gated on replay being active), and always
            shows the currently-chosen speed as its own label. */}
        <div className="flex items-center overflow-hidden rounded-md">
          <Button
            variant="ghost"
            size="xs"
            className="cursor-pointer rounded-r-none text-xs w-7 text-muted-foreground"
            onClick={onTogglePlayPause}
            disabled={!replayAvailable}
            title={
              replay?.status === "playing" ? "Pause replay" : "Replay this run"
            }
          >
            {replay?.status === "playing" ? (
              <PauseIcon className="size-4" />
            ) : (
              <PlayIcon className="size-4" />
              // lucide has no "play in a circle" icon -- composited from
              // two: RotateCcwIcon as the ring, a shrunk PlayIcon
              // absolutely centered inside its empty middle. Distinguishes
              // this button from the plain PlayIcon the Run/Rerun button
              // already uses elsewhere in this toolbar.
              // <span className="relative inline-flex size-4 items-center justify-center">

              //   <CassetteTapeIcon className="absolute left-2.5 top-1.75 size-3 bg-neutral-800" />
              // </span>
            )}
          </Button>
          <div className="h-4 w-px bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                className="w-14 shrink-0 cursor-pointer justify-center gap-0.5 rounded-l-none px-1.5 text-xs text-muted-foreground"
                disabled={!replayAvailable}
                title="Choose replay speed"
              >
                {replaySpeed}x
                <ChevronUpIcon className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="center">
              <DropdownMenuRadioGroup
                value={String(replaySpeed)}
                onValueChange={(value) =>
                  onSetReplaySpeed(Number(value) as ReplaySpeed)
                }
              >
                {REPLAY_SPEEDS.map((speed) => (
                  <DropdownMenuRadioItem key={speed} value={String(speed)}>
                    {speed}x
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {replay && (
          <Button
            variant="ghost"
            size="xs"
            className="cursor-pointer text-xs text-muted-foreground"
            onClick={onCancelReplay}
            title="Cancel replay"
          >
            <XIcon className="size-4" />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-1 rounded-lg  bg-background/50 dark:bg-neutral-800 p-1 shadow-md backdrop-blur">
        {showSimulate && (
          <Button
            variant="ghost"
            size="xs"
            className="cursor-pointer text-xs text-muted-foreground "
            onClick={onOpenSim}
            title="Simulate"
          >
            <SIM_ICON className={cn(SIM_ICON_CLASS, "size-4")} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="xs"
          className="cursor-pointer text-xs text-muted-foreground "
          onClick={onOpenEventGraph}
          title="Open event graph"
        >
          <EVENT_GRAPH_ICON className={cn(EVENT_GRAPH_ICON_CLASS, "size-4")} />
        </Button>
        {hasParams && (
          <Button
            variant="ghost"
            size="xs"
            className={cn(
              "cursor-pointer text-xs text-amber-700 dark:text-amber-400 dark:hover:text-amber-400 hover:text-amber-700",
              paramsHasUnsetRequired &&
                "bg-amber-200  dark:bg-amber-900 dark:hover:bg-amber-800  hover:bg-amber-100",
            )}
            onClick={onOpenParams}
            title="Set params"
          >
            <FileInputIcon className="size-4" />
          </Button>
        )}
        <Button
          variant="outline"
          size="xs"
          className="cursor-pointer bg-green-300/80 dark:bg-green-900 hover:bg-green-200 hover:dark:bg-green-800"

          onClick={onRun}
          disabled={runDisabled}
        >
          <TerminalIcon className="size-4" />
          {isRerun ? "Rerun" : "Run"}
        </Button>
      </div>
    </div>
  );
}
