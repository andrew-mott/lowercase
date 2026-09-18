import {
  DockviewDefaultTab,
  type IDockviewPanelHeaderProps,
} from "dockview-react";
import { cn } from "@/lib/utils";
import { getTabIcon } from "@/components/workbench/shared/tab-icons";
import type { OpenPanelRequest } from "./dock-panels";

// registered as dockview's "dock-tab" tabComponent (see
// explorer-panels.ts) -- wraps dockview's own default tab (title text,
// close button, drag handling) rather than reimplementing it, since it
// doesn't expose a slot for injecting an icon of our own.
export function DockTab(props: IDockviewPanelHeaderProps<OpenPanelRequest>) {
  const icon = getTabIcon(props.params);
  return (
    <div className="flex items-center gap-1 min-w-0 h-full pl-2">
      {icon && (
        <icon.Icon className={cn("size-3.5 shrink-0", icon.className)} />
      )}
      <DockviewDefaultTab {...props} />
    </div>
  );
}
