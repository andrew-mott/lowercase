import { describe, expect, it, vi } from "vitest";
import {
  DOCK_TAB_COMPONENT,
  dockPanelId,
  openOrFocusPanel,
  type OpenPanelRequest,
} from "@/components/workbench/dock/dock-panels";

function fakePanel(params: OpenPanelRequest, title: string) {
  return {
    params,
    title,
    api: {
      setActive: vi.fn(),
      updateParameters: vi.fn(),
      setTitle: vi.fn(),
    },
  };
}

function fakeApi(existing?: ReturnType<typeof fakePanel>) {
  return {
    getPanel: vi.fn().mockReturnValue(existing),
    addPanel: vi.fn(),
  };
}

describe("dockPanelId", () => {
  it("derives a stable id from kind + content id, per kind", () => {
    expect(
      dockPanelId({ kind: "flow-settings", label: "x", flowId: "f1" }),
    ).toBe("flow-settings-f1");
    expect(
      dockPanelId({ kind: "json-definition", label: "x", versionId: "v1" }),
    ).toBe("json-definition-v1");
    expect(
      dockPanelId({
        kind: "flow-graph",
        label: "x",
        versionId: "v1",
        openedAs: { type: "plain" },
      }),
    ).toBe("flow-graph-v1");
  });

  it("gives two different versions of the same kind distinct ids", () => {
    const a = dockPanelId({
      kind: "flow-graph",
      label: "x",
      versionId: "v1",
      openedAs: { type: "plain" },
    });
    const b = dockPanelId({
      kind: "flow-graph",
      label: "x",
      versionId: "v2",
      openedAs: { type: "plain" },
    });
    expect(a).not.toBe(b);
  });

  it("gives a run-specific flow-graph request a distinct id from the plain version request", () => {
    const plain = dockPanelId({
      kind: "flow-graph",
      label: "x",
      versionId: "v1",
      openedAs: { type: "plain" },
    });
    const runSpecific = dockPanelId({
      kind: "flow-graph",
      label: "x",
      versionId: "v1",
      openedAs: { type: "run", runId: "r1" },
    });
    expect(runSpecific).not.toBe(plain);
  });

  it("gives two different runs of the same version distinct ids", () => {
    const a = dockPanelId({
      kind: "flow-graph",
      label: "x",
      versionId: "v1",
      openedAs: { type: "run", runId: "r1" },
    });
    const b = dockPanelId({
      kind: "flow-graph",
      label: "x",
      versionId: "v1",
      openedAs: { type: "run", runId: "r2" },
    });
    expect(a).not.toBe(b);
  });

  it("gives a sim-specific flow-graph request a distinct id from the plain and run-specific requests", () => {
    const plain = dockPanelId({
      kind: "flow-graph",
      label: "x",
      versionId: "v1",
      openedAs: { type: "plain" },
    });
    const runSpecific = dockPanelId({
      kind: "flow-graph",
      label: "x",
      versionId: "v1",
      openedAs: { type: "run", runId: "r1" },
    });
    const simSpecific = dockPanelId({
      kind: "flow-graph",
      label: "x",
      versionId: "v1",
      openedAs: { type: "sim", simId: "s1" },
    });
    expect(simSpecific).not.toBe(plain);
    expect(simSpecific).not.toBe(runSpecific);
  });

  it("gives two different sims of the same version distinct ids", () => {
    const a = dockPanelId({
      kind: "flow-graph",
      label: "x",
      versionId: "v1",
      openedAs: { type: "sim", simId: "s1" },
    });
    const b = dockPanelId({
      kind: "flow-graph",
      label: "x",
      versionId: "v1",
      openedAs: { type: "sim", simId: "s2" },
    });
    expect(a).not.toBe(b);
  });

  it("gives every event-graph request the same id regardless of label -- it's a singleton", () => {
    const a = dockPanelId({ kind: "event-graph", label: "Event Graph" });
    const b = dockPanelId({ kind: "event-graph", label: "Something else" });
    expect(a).toBe(b);
    expect(a).toBe("event-graph-singleton");
  });

  it("gives every flow-authoring request the same id regardless of label -- it's a singleton, no real id exists for an unsaved draft", () => {
    const a = dockPanelId({ kind: "flow-authoring", label: "New Flow" });
    const b = dockPanelId({
      kind: "flow-authoring",
      label: "Something else",
    });
    expect(a).toBe(b);
    expect(a).toBe("flow-authoring-singleton");
  });

  it("gives every flow-authoring-preview request the same id regardless of label -- a second singleton, 1:1 with flow-authoring", () => {
    const a = dockPanelId({
      kind: "flow-authoring-preview",
      label: "Preview",
    });
    const b = dockPanelId({
      kind: "flow-authoring-preview",
      label: "Something else",
    });
    expect(a).toBe(b);
    expect(a).toBe("flow-authoring-preview-singleton");
  });

  it("derives an artifact request's id from its hash", () => {
    expect(
      dockPanelId({
        kind: "artifact",
        label: "x",
        hash: "h1",
        versionId: "v1",
      }),
    ).toBe("artifact-h1");
  });

  it("gives every artifact-authoring request for the same version the same id -- one draft per version", () => {
    const a = dockPanelId({
      kind: "artifact-authoring",
      label: "New Artifact",
      versionId: "v1",
    });
    const b = dockPanelId({
      kind: "artifact-authoring",
      label: "New Artifact",
      versionId: "v1",
    });
    expect(a).toBe(b);
    expect(a).toBe("artifact-authoring-v1");
  });

  it("gives different versions' artifact-authoring requests different ids", () => {
    const a = dockPanelId({
      kind: "artifact-authoring",
      label: "New Artifact",
      versionId: "v1",
    });
    const b = dockPanelId({
      kind: "artifact-authoring",
      label: "New Artifact",
      versionId: "v2",
    });
    expect(a).not.toBe(b);
  });

  it("derives an event-payload request's id from runId + eventId together", () => {
    expect(
      dockPanelId({
        kind: "event-payload",
        label: "x",
        runId: "r1",
        eventId: "e1",
      }),
    ).toBe("event-payload-r1-e1");
  });

  it("gives event-payload requests distinct ids when either runId or eventId differs", () => {
    const base = dockPanelId({
      kind: "event-payload",
      label: "x",
      runId: "r1",
      eventId: "e1",
    });
    const differentRun = dockPanelId({
      kind: "event-payload",
      label: "x",
      runId: "r2",
      eventId: "e1",
    });
    const differentEvent = dockPanelId({
      kind: "event-payload",
      label: "x",
      runId: "r1",
      eventId: "e2",
    });
    expect(base).not.toBe(differentRun);
    expect(base).not.toBe(differentEvent);
  });
});

describe("openOrFocusPanel", () => {
  it("adds a new panel with the derived id/component/title/params when none exists", () => {
    const api = fakeApi(undefined);
    const req: OpenPanelRequest = {
      kind: "flow-graph",
      label: "Version 1 Graph",
      versionId: "v1",
      openedAs: { type: "plain" },
    };

    openOrFocusPanel(api as never, req);

    expect(api.addPanel).toHaveBeenCalledWith({
      id: "flow-graph-v1",
      component: DOCK_TAB_COMPONENT,
      title: "Version 1 Graph",
      params: req,
    });
  });

  it("focuses an existing panel instead of adding a duplicate", () => {
    const req: OpenPanelRequest = {
      kind: "flow-graph",
      label: "Version 1 Graph",
      versionId: "v1",
      openedAs: { type: "plain" },
    };
    const existing = fakePanel(req, "Version 1 Graph");
    const api = fakeApi(existing);

    openOrFocusPanel(api as never, req);

    expect(api.addPanel).not.toHaveBeenCalled();
    expect(existing.api.setActive).toHaveBeenCalledOnce();
  });

  it("does not re-write params/title on an unchanged refocus", () => {
    const req: OpenPanelRequest = {
      kind: "flow-graph",
      label: "Version 1 Graph",
      versionId: "v1",
      openedAs: { type: "plain" },
    };
    const existing = fakePanel(req, "Version 1 Graph");
    const api = fakeApi(existing);

    openOrFocusPanel(api as never, req);

    expect(existing.api.updateParameters).not.toHaveBeenCalled();
    expect(existing.api.setTitle).not.toHaveBeenCalled();
    expect(existing.api.setActive).toHaveBeenCalledOnce();
  });

  it("refreshes params/title when content changed since it was opened", () => {
    const oldReq: OpenPanelRequest = {
      kind: "flow-settings",
      label: "Flow A",
      flowId: "f1",
    };
    const existing = fakePanel(oldReq, "Flow A");
    const api = fakeApi(existing);

    const newReq: OpenPanelRequest = {
      kind: "flow-settings",
      label: "Flow A (renamed)",
      flowId: "f1",
    };
    openOrFocusPanel(api as never, newReq);

    expect(existing.api.updateParameters).toHaveBeenCalledWith(newReq);
    expect(existing.api.setTitle).toHaveBeenCalledWith("Flow A (renamed)");
    expect(existing.api.setActive).toHaveBeenCalledOnce();
  });

  it("re-triggers a refocus even when revealPath is the exact same array reference, since revealAt alone is what defeats shallowEqual -- otherwise a second click to the same spot could silently no-op", () => {
    // shallowEqual compares nested values by reference, not deep equality --
    // sharing one revealPath array reference across both requests isolates
    // that revealAt (not just "any new array literal") is what guarantees
    // this keeps working regardless of how a caller constructs revealPath.
    const sharedRevealPath = ["steps", "s1", "body"];
    const oldReq: OpenPanelRequest = {
      kind: "json-definition",
      label: "Version 1 JSON",
      versionId: "v1",
      revealPath: sharedRevealPath,
      revealAt: 1000,
    };
    const existing = fakePanel(oldReq, "Version 1 JSON");
    const api = fakeApi(existing);

    const newReq: OpenPanelRequest = {
      kind: "json-definition",
      label: "Version 1 JSON",
      versionId: "v1",
      revealPath: sharedRevealPath,
      revealAt: 2000,
    };
    openOrFocusPanel(api as never, newReq);

    expect(existing.api.updateParameters).toHaveBeenCalledWith(newReq);
  });

  it("passes position through to addPanel when creating a brand-new panel", () => {
    const api = fakeApi(undefined);
    const req: OpenPanelRequest = { kind: "event-graph", label: "Event Graph" };

    openOrFocusPanel(api as never, req, {
      position: { direction: "right", referencePanel: "flow-graph-v1" },
    });

    expect(api.addPanel).toHaveBeenCalledWith({
      id: "event-graph-singleton",
      component: DOCK_TAB_COMPONENT,
      title: "Event Graph",
      params: req,
      position: { direction: "right", referencePanel: "flow-graph-v1" },
      floating: false,
    });
  });

  it("passes initialTrackedPanelId through as part of params, as a one-shot bootstrap hint", () => {
    const api = fakeApi(undefined);
    const req: OpenPanelRequest = {
      kind: "event-graph",
      label: "Event Graph",
      initialTrackedPanelId: "flow-graph-v1",
    };

    openOrFocusPanel(api as never, req);

    expect(api.addPanel).toHaveBeenCalledWith({
      id: "event-graph-singleton",
      component: DOCK_TAB_COMPONENT,
      title: "Event Graph",
      params: req,
    });
  });

  it("ignores position when refocusing an already-open panel", () => {
    const req: OpenPanelRequest = { kind: "event-graph", label: "Event Graph" };
    const existing = fakePanel(req, "Event Graph");
    const api = fakeApi(existing);

    openOrFocusPanel(api as never, req, {
      position: { direction: "right", referencePanel: "flow-graph-v1" },
    });

    expect(api.addPanel).not.toHaveBeenCalled();
    expect(existing.api.setActive).toHaveBeenCalledOnce();
  });

  it("adds a new artifact panel with the derived id/component/title/params", () => {
    const api = fakeApi(undefined);
    const req: OpenPanelRequest = {
      kind: "artifact",
      label: "notes.md",
      hash: "h1",
      versionId: "v1",
    };

    openOrFocusPanel(api as never, req);

    expect(api.addPanel).toHaveBeenCalledWith({
      id: "artifact-h1",
      component: DOCK_TAB_COMPONENT,
      title: "notes.md",
      params: req,
    });
  });

  it("adds a new artifact-authoring panel with the derived id/component/title/params", () => {
    const api = fakeApi(undefined);
    const req: OpenPanelRequest = {
      kind: "artifact-authoring",
      label: "New Artifact",
      versionId: "v1",
    };

    openOrFocusPanel(api as never, req);

    expect(api.addPanel).toHaveBeenCalledWith({
      id: "artifact-authoring-v1",
      component: DOCK_TAB_COMPONENT,
      title: "New Artifact",
      params: req,
    });
  });

  it("refocuses an existing artifact-authoring panel for the same version instead of opening a second draft", () => {
    const req: OpenPanelRequest = {
      kind: "artifact-authoring",
      label: "New Artifact",
      versionId: "v1",
    };
    const existing = fakePanel(req, "New Artifact");
    const api = fakeApi(existing);

    openOrFocusPanel(api as never, req);

    expect(api.addPanel).not.toHaveBeenCalled();
    expect(existing.api.setActive).toHaveBeenCalledOnce();
  });
});
