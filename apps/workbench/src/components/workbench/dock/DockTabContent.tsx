import type { IDockviewPanelProps } from "dockview-react";
import type { OpenPanelRequest } from "./dock-panels";
import { Content as FlowSettingsPanelContent } from "@/components/workbench/flow-settings-panel/Content";
import { Content as JsonDefinitionPanelContent } from "@/components/workbench/json-definition-panel/Content";
import { Content as FlowGraphPanelContent } from "@/components/workbench/flow-graph-panel/Content";
import { Content as EventGraphPanelContent } from "@/components/workbench/event-graph-panel/Content";
import { Content as ArtifactPanelContent } from "@/components/workbench/artifact-panel/Content";
import { Content as ArtifactAuthoringPanelContent } from "@/components/workbench/artifact-authoring-panel/Content";
import { Content as EventPayloadPanelContent } from "@/components/workbench/event-payload-panel/Content";
import { Content as FlowAuthoringPanelContent } from "@/components/workbench/flow-authoring-panel/Content";
import { Content as FlowAuthoringPreviewPanelContent } from "@/components/workbench/flow-authoring-preview-panel/Content";

// registered as dockview's "dock-tab" component (see dock-panels.ts)
// -- each panel gets its own distinct id per kind+content now, so a panel is
// never reused for different content the way the old singleton tab was.
export function DockTabContent({
  params,
  api,
}: IDockviewPanelProps<OpenPanelRequest>) {
  switch (params.kind) {
    case "flow-settings":
      return <FlowSettingsPanelContent flowId={params.flowId} />;
    case "json-definition":
      return (
        <JsonDefinitionPanelContent
          versionId={params.versionId}
          revealPath={params.revealPath}
          revealAt={params.revealAt}
        />
      );
    case "flow-graph":
      return (
        <FlowGraphPanelContent
          versionId={params.versionId}
          panelId={api.id}
          simId={
            params.openedAs.type === "sim" ? params.openedAs.simId : undefined
          }
          runOpened={params.openedAs.type === "run"}
        />
      );
    case "event-graph":
      return (
        <EventGraphPanelContent
          initialTrackedPanelId={params.initialTrackedPanelId}
        />
      );
    case "artifact":
      return (
        <ArtifactPanelContent
          hash={params.hash}
          versionId={params.versionId}
          panelId={api.id}
        />
      );
    case "artifact-authoring":
      return (
        <ArtifactAuthoringPanelContent
          versionId={params.versionId}
          panelId={api.id}
          onClose={() => api.close()}
          returnTo={params.returnTo}
        />
      );
    case "event-payload":
      return (
        <EventPayloadPanelContent
          runId={params.runId}
          eventId={params.eventId}
        />
      );
    case "flow-authoring":
      return (
        <FlowAuthoringPanelContent
          panelId={api.id}
          onClose={() => api.close()}
        />
      );
    case "flow-authoring-preview":
      return <FlowAuthoringPreviewPanelContent />;
    default: {
      const _exhaustive: never = params;
      return _exhaustive;
    }
  }
}
