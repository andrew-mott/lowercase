import { describe, expect, it } from "vitest";
import {
  getTabIcon,
  FLOW_GRAPH_ICON,
  FLOW_GRAPH_ICON_CLASS,
  JSON_DEFINITION_ICON,
  JSON_DEFINITION_ICON_CLASS,
  RUN_ICON,
  RUN_ICON_CLASS,
  SIM_ICON,
  SIM_ICON_CLASS,
  EVENT_GRAPH_ICON,
  EVENT_GRAPH_ICON_CLASS,
  ARTIFACT_ICON,
  ARTIFACT_ICON_CLASS,
  ARTIFACT_AUTHORING_ICON,
  ARTIFACT_AUTHORING_ICON_CLASS,
  EVENT_PAYLOAD_ICON,
  EVENT_PAYLOAD_ICON_CLASS,
  FLOW_AUTHORING_ICON,
  FLOW_AUTHORING_ICON_CLASS,
  FLOW_AUTHORING_PREVIEW_ICON,
  FLOW_AUTHORING_PREVIEW_ICON_CLASS,
} from "@/components/workbench/shared/tab-icons";

describe("getTabIcon", () => {
  it("returns the settings icon, uncolored, for flow-settings", () => {
    const icon = getTabIcon({
      kind: "flow-settings",
      label: "x",
      flowId: "f1",
    });
    expect(icon?.className).toBeUndefined();
  });

  it("returns the json-definition icon+color for json-definition", () => {
    const icon = getTabIcon({
      kind: "json-definition",
      label: "x",
      versionId: "v1",
    });
    expect(icon?.Icon).toBe(JSON_DEFINITION_ICON);
    expect(icon?.className).toBe(JSON_DEFINITION_ICON_CLASS);
  });

  it("returns the flow-graph icon+color for a plain flow-graph panel", () => {
    const icon = getTabIcon({
      kind: "flow-graph",
      label: "x",
      versionId: "v1",
      openedAs: { type: "plain" },
    });
    expect(icon?.Icon).toBe(FLOW_GRAPH_ICON);
    expect(icon?.className).toBe(FLOW_GRAPH_ICON_CLASS);
  });

  it("returns the run icon+color for a run-opened flow-graph panel", () => {
    const icon = getTabIcon({
      kind: "flow-graph",
      label: "x",
      versionId: "v1",
      openedAs: { type: "run", runId: "r1" },
    });
    expect(icon?.Icon).toBe(RUN_ICON);
    expect(icon?.className).toBe(RUN_ICON_CLASS);
  });

  it("returns the sim icon+color for a sim-opened flow-graph panel", () => {
    const icon = getTabIcon({
      kind: "flow-graph",
      label: "x",
      versionId: "v1",
      openedAs: { type: "sim", simId: "s1" },
    });
    expect(icon?.Icon).toBe(SIM_ICON);
    expect(icon?.className).toBe(SIM_ICON_CLASS);
  });

  it("returns the event-graph icon+color, mirroring its toolbar button", () => {
    const icon = getTabIcon({ kind: "event-graph", label: "x" });
    expect(icon?.Icon).toBe(EVENT_GRAPH_ICON);
    expect(icon?.className).toBe(EVENT_GRAPH_ICON_CLASS);
  });

  it("returns the artifact icon+color for artifact", () => {
    const icon = getTabIcon({
      kind: "artifact",
      label: "x",
      hash: "h1",
      versionId: "v1",
    });
    expect(icon?.Icon).toBe(ARTIFACT_ICON);
    expect(icon?.className).toBe(ARTIFACT_ICON_CLASS);
  });

  it("returns the artifact-authoring icon+color for artifact-authoring", () => {
    const icon = getTabIcon({
      kind: "artifact-authoring",
      label: "New Artifact",
      versionId: "v1",
    });
    expect(icon?.Icon).toBe(ARTIFACT_AUTHORING_ICON);
    expect(icon?.className).toBe(ARTIFACT_AUTHORING_ICON_CLASS);
  });

  it("returns the event-payload icon+color for event-payload", () => {
    const icon = getTabIcon({
      kind: "event-payload",
      label: "x",
      runId: "r1",
      eventId: "e1",
    });
    expect(icon?.Icon).toBe(EVENT_PAYLOAD_ICON);
    expect(icon?.className).toBe(EVENT_PAYLOAD_ICON_CLASS);
  });

  it("returns the flow-authoring icon+color for flow-authoring", () => {
    const icon = getTabIcon({
      kind: "flow-authoring",
      label: "New Flow",
    });
    expect(icon?.Icon).toBe(FLOW_AUTHORING_ICON);
    expect(icon?.className).toBe(FLOW_AUTHORING_ICON_CLASS);
  });

  it("returns the flow-authoring-preview icon+color for flow-authoring-preview", () => {
    const icon = getTabIcon({
      kind: "flow-authoring-preview",
      label: "Preview",
    });
    expect(icon?.Icon).toBe(FLOW_AUTHORING_PREVIEW_ICON);
    expect(icon?.className).toBe(FLOW_AUTHORING_PREVIEW_ICON_CLASS);
  });
});
