import {
  BotIcon,
  ChartNoAxesGanttIcon,
  CurlyBracesIcon,
  FilePlusIcon,
  FileTextIcon,
  HistoryIcon,
  SettingsIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";
import type { OpenPanelRequest } from "@/components/workbench/dock/dock-panels";

// Shared by both the tree rows (which import these directly, since each row
// already knows statically which one it is) and getTabIcon below
// (the only place that needs to derive one dynamically, since one tab
// component is registered for every panel).
export const FLOW_GRAPH_ICON = WorkflowIcon;
export const FLOW_GRAPH_ICON_CLASS = "text-blue-600 dark:text-blue-400";
export const JSON_DEFINITION_ICON = CurlyBracesIcon;
export const JSON_DEFINITION_ICON_CLASS =
  "text-yellow-600 dark:text-yellow-400";
export const RUN_ICON = HistoryIcon;
export const RUN_ICON_CLASS = "text-rose-600 dark:text-rose-400";
export const SIM_ICON = BotIcon;
export const SIM_ICON_CLASS = "text-violet-600 dark:text-violet-400";
// matches RunToolbar.tsx's own "Events" button icon
export const EVENT_GRAPH_ICON = ChartNoAxesGanttIcon;
export const EVENT_GRAPH_ICON_CLASS = "text-teal-600 dark:text-teal-400";
// matches this app's established artifact icon (AppShell.tsx, FlowVersionModeNav.tsx)
export const ARTIFACT_ICON = FileTextIcon;
export const ARTIFACT_ICON_CLASS = "text-orange-600 dark:text-orange-400";
export const ARTIFACT_AUTHORING_ICON = FilePlusIcon;
export const ARTIFACT_AUTHORING_ICON_CLASS = "text-lime-600 dark:text-lime-400";
// JSON content like json-definition, but a distinct color -- this is a raw
// event's own payload, not a flow version's definition.
export const EVENT_PAYLOAD_ICON = CurlyBracesIcon;
export const EVENT_PAYLOAD_ICON_CLASS = "text-cyan-600 dark:text-cyan-400";
// JSON-first, like json-definition/event-payload, but its own color -- an
// unsaved flow draft, not a persisted flow version's definition.
export const FLOW_AUTHORING_ICON = CurlyBracesIcon;
export const FLOW_AUTHORING_ICON_CLASS = "text-lime-600 dark:text-lime-400";
// It is a flow graph, so reuses FLOW_GRAPH_ICON's shape -- a distinct color
// marks it as the draft preview, not a real saved flow-graph panel.
export const FLOW_AUTHORING_PREVIEW_ICON = WorkflowIcon;
export const FLOW_AUTHORING_PREVIEW_ICON_CLASS =
  "text-lime-600 dark:text-lime-400";

export function getTabIcon(
  params: OpenPanelRequest,
): { Icon: LucideIcon; className?: string } | null {
  switch (params.kind) {
    case "flow-settings":
      return { Icon: SettingsIcon };
    case "json-definition":
      return {
        Icon: JSON_DEFINITION_ICON,
        className: JSON_DEFINITION_ICON_CLASS,
      };
    case "flow-graph": {
      const { openedAs } = params;
      if (openedAs.type === "run")
        return { Icon: RUN_ICON, className: RUN_ICON_CLASS };
      if (openedAs.type === "sim")
        return { Icon: SIM_ICON, className: SIM_ICON_CLASS };
      return { Icon: FLOW_GRAPH_ICON, className: FLOW_GRAPH_ICON_CLASS };
    }
    // no tree-row analog (opened from a Flow Graph panel's own toolbar, not
    // the tree) -- future may add tree context menu to open or key shortcut
    case "event-graph":
      return { Icon: EVENT_GRAPH_ICON, className: EVENT_GRAPH_ICON_CLASS };
    case "artifact":
      return { Icon: ARTIFACT_ICON, className: ARTIFACT_ICON_CLASS };
    case "artifact-authoring":
      return {
        Icon: ARTIFACT_AUTHORING_ICON,
        className: ARTIFACT_AUTHORING_ICON_CLASS,
      };
    // no tree-row analog (opened from inside the Event Graph panel's own
    // content, not the tree) -- same reasoning as event-graph above.
    case "event-payload":
      return { Icon: EVENT_PAYLOAD_ICON, className: EVENT_PAYLOAD_ICON_CLASS };
    case "flow-authoring":
      return {
        Icon: FLOW_AUTHORING_ICON,
        className: FLOW_AUTHORING_ICON_CLASS,
      };
    case "flow-authoring-preview":
      return {
        Icon: FLOW_AUTHORING_PREVIEW_ICON,
        className: FLOW_AUTHORING_PREVIEW_ICON_CLASS,
      };
  }
}
