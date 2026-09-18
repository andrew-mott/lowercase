import type { AddPanelPositionOptions, DockviewApi } from "dockview-react";
import { shallowEqual } from "react-redux";

export const DOCK_TAB_COMPONENT = "dock-tab";

// Flow and Version rows themselves never open a tab (click always toggles
// expand) -- only their fixed leaf children do.
export type OpenPanelRequest =
  | { kind: "flow-settings"; label: string; flowId: string }
  | {
      kind: "json-definition";
      label: string;
      versionId: string;
      // one-shot navigate command, not part of this panel's identity --
      // revealAt (a fresh Date.now() per click) rides along on refocus via
      // updateParameters below, same as artifact-authoring's returnTo, but
      // also has to guarantee two clicks are never shallowEqual-identical
      // even when they target the same path, or the second click's refocus
      // would silently no-op. See the related change in docs/initiatives/ui-workspace/INITIATIVE.md.
      revealPath?: string[];
      revealAt?: number;
    }
  | {
      kind: "flow-graph";
      label: string;
      versionId: string;
      // fixed at open time, never re-derived from live state -- see
      // the related change in docs/initiatives/ui-workspace/INITIATIVE.md for why this is a real
      // discriminated union rather than optional runId?/simId? fields.
      openedAs:
        | { type: "plain" }
        | { type: "run"; runId: string }
        | { type: "sim"; simId: string };
    }
  // opened by a Flow Graph panel's own toolbar, not the tree -- but a
  // singleton, not per-source-panel: it follows whichever Flow Graph panel
  // currently has dockview focus (see use-tracked-flow-graph-panel.ts), so
  // it has no target-specific identity of its own to carry here.
  // `initialTrackedPanelId` is a one-shot bootstrap hint, not identity --
  // used once on first mount, never read again (see that file for why).
  | { kind: "event-graph"; label: string; initialTrackedPanelId?: string }
  // versionId is a query-scoping field only (metadata's only fetch path is
  // scoped by flowVersionId), not part of this panel's identity -- the same
  // artifact opened from anywhere still resolves to one panel, see
  // contentId() below.
  | { kind: "artifact"; label: string; hash: string; versionId: string }
  // one panel per version -- contentId returning versionId alone gives this
  // for free via the same mechanism json-definition/flow-graph's plain
  // variant already use, no new dedup logic needed.
  | {
      kind: "artifact-authoring";
      label: string;
      versionId: string;
      // set only by the Run Input picker's create-shortcut (the related change) -- rides
      // along on refocus via updateParameters below, doesn't affect this
      // panel's identity (contentId still keys on versionId alone), so a
      // second create-shortcut click for the same version just retargets
      // the existing singleton panel rather than opening a new one.
      returnTo?: { panelId: string; paramName: string };
    }
  // runId is part of identity, not just a query scope -- lets the panel
  // re-fetch this run's events itself (see use-run-events-with-status.ts's
  // pattern) so it survives a reload instead of depending on whatever's
  // already buffered in the events slice.
  | { kind: "event-payload"; label: string; runId: string; eventId: string }
  // singletons, same shape as event-graph above -- a not-yet-created flow
  // draft has no real id to key on at all (no versionId, no flowId), unlike
  // every other kind here. Only ever one draft at a time; re-triggering
  // "+ New Flow" refocuses (or overwrites, for the upload path) the
  // existing one rather than opening a second.
  | { kind: "flow-authoring"; label: string }
  | { kind: "flow-authoring-preview"; label: string };

function contentId(req: OpenPanelRequest): string {
  switch (req.kind) {
    case "flow-settings":
      return req.flowId;
    case "json-definition":
      return req.versionId;
    case "flow-graph": {
      const { openedAs } = req;
      if (openedAs.type === "sim")
        return `${req.versionId}-sim-${openedAs.simId}`;
      if (openedAs.type === "run") return `${req.versionId}-${openedAs.runId}`;
      return req.versionId;
    }
    // "singleton" here, not something more decorated -- dockPanelId()
    // already prefixes every id with the kind, so this alone resolves to
    // "event-graph-singleton", unambiguous even if some other panel kind
    // later also wants a singleton and reuses this same literal.
    case "event-graph":
      return "singleton";
    case "artifact":
      return req.hash;
    case "artifact-authoring":
      return req.versionId;
    case "event-payload":
      return `${req.runId}-${req.eventId}`;
    case "flow-authoring":
    case "flow-authoring-preview":
      return "singleton";
  }
}
// distinct per kind+content, unlike the old slice's kind-only id -- lets two
// different versions' flow-graphs coexist as separate panels, while a plain
// click on the same content still resolves to the same id and gets deduped.
export function dockPanelId(req: OpenPanelRequest): string {
  return `${req.kind}-${contentId(req)}`;
}

export const EVENT_GRAPH_SINGLETON_ID = dockPanelId({
  kind: "event-graph",
  label: "",
});

export const FLOW_AUTHORING_ID = dockPanelId({
  kind: "flow-authoring",
  label: "",
});

export const FLOW_AUTHORING_PREVIEW_ID = dockPanelId({
  kind: "flow-authoring-preview",
  label: "",
});

export function openOrFocusPanel(
  api: DockviewApi,
  req: OpenPanelRequest,
  // only consulted when creating a brand-new panel -- an already-open one
  // just gets refocused wherever it already lives.
  options?: { position?: AddPanelPositionOptions },
): void {
  const id = dockPanelId(req);
  const existing = api.getPanel(id);
  if (existing) {
    // updateParameters/setTitle have no internal diffing -- dockview-react's
    // bridge unconditionally re-renders on every call (deliberately, to
    // defeat React's setState bailout). Guarding here avoids a pointless
    // re-render when refocusing already-open, unchanged content.
    if (!shallowEqual(existing.params, req)) {
      existing.api.updateParameters(req);
    }
    if (existing.title !== req.label) {
      existing.api.setTitle(req.label);
    }
    existing.api.setActive();
    return;
  }
  api.addPanel<OpenPanelRequest>({
    id,
    component: DOCK_TAB_COMPONENT,
    title: req.label,
    params: req,
    ...(options?.position
      ? { position: options.position, floating: false }
      : {}),
  });
}
