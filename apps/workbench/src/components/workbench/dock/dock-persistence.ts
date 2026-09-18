import type { SerializedDockview } from "dockview-react";
import type { FlowGraphPanelsState } from "@/redux/slices/flow-graph-panels-slice";
import type { EventGraphPanelsState } from "@/redux/slices/event-graph-panels-slice";
import type { ArtifactPanelsState } from "@/redux/slices/artifact-panels-slice";
import type { ArtifactAuthoringPanelsState } from "@/redux/slices/artifact-authoring-panels-slice";
import type { FlowAuthoringPanelsState } from "@/redux/slices/flow-authoring-panels-slice";

// workspace id hardcoded for now -- see docs/initiatives/ui-workspace/research/state-management.md's
// workspace-switching notes for why this is still the right seam to leave in
// place even with only one implicit workspace today
const STORAGE_KEY = "dock-workspace:default";
const CURRENT_VERSION = 1;

// injectable rather than a bare `localStorage`/`sessionStorage` reference --
// this repo's vitest runs in Node, not jsdom, so there's no real global to
// reach for in tests, and it happens to be the same seam a future
// async/database-backed swap would use
type DockStorage = Pick<Storage, "getItem" | "setItem">;
type DockStorages = { session: DockStorage; local: DockStorage };

type LoadedDockState = {
  dockview: SerializedDockview | null;
  flowGraphPanels: FlowGraphPanelsState | null;
  eventGraphPanels: EventGraphPanelsState | null;
  artifactPanels: ArtifactPanelsState | null;
  artifactAuthoringPanels: ArtifactAuthoringPanelsState | null;
  flowAuthoringPanels: FlowAuthoringPanelsState | null;
};

const EMPTY_LOADED_STATE: LoadedDockState = {
  dockview: null,
  flowGraphPanels: null,
  eventGraphPanels: null,
  artifactPanels: null,
  artifactAuthoringPanels: null,
  flowAuthoringPanels: null,
};

// Shared shape for every keyed-panel-state field (flowGraphPanels,
// eventGraphPanels, ...): only trusted if dockview also restored -- a panel
// manually recreated by clicking the tree into an empty dockview host
// should never silently resurrect old business state it wasn't really
// reopened with (a "fresh" panel that secretly isn't one). This isn't
// symmetric on purpose: dockview restoring is never conditioned on any of
// these the other way, since a restored panel's own identity lives entirely
// in dockview's own params, independent of any of these slices -- that
// direction is already harmless and stays independent. Same shallow
// validation (typeof checks, not a schema validator) as the rest of this
// file -- proportionate for low-stakes local UI state, trusting the cast
// rather than verifying it.
function readGatedPanelState<T>(
  dockview: SerializedDockview | null,
  value: unknown,
): T | null {
  return dockview !== null && typeof value === "object" && value !== null
    ? (value as T)
    : null;
}

// null means this storage has nothing *usable at the envelope level*
// (missing, corrupt, or wrong version) -- distinct from a valid envelope
// whose individual fields might still be independently null, which is a
// real LoadedDockState, not a signal to fall back to the next source.
// Deliberately shallow validation (typeof checks, not a schema validator) --
// proportionate for low-stakes local UI state. dockview's own tree shape is
// not validated at all here; see docs/initiatives/ui-workspace/INITIATIVE.md's the related change entry for
// why that's deferred.
function readSnapshot(storage: DockStorage): LoadedDockState | null {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage inaccessible (privacy mode, etc.)
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== CURRENT_VERSION
  ) {
    // wrong/missing version -- discard the whole thing, don't guess at an
    // older shape
    return null;
  }

  const p = parsed as Record<string, unknown>;

  const dockview =
    typeof p.dockview === "object" && p.dockview !== null
      ? (p.dockview as SerializedDockview)
      : null;

  const panelState = p.panelState as
    | {
        flowGraphPanels?: unknown;
        eventGraphPanels?: unknown;
        artifactPanels?: unknown;
        artifactAuthoringPanels?: unknown;
        flowAuthoringPanels?: unknown;
      }
    | undefined;
  const flowGraphPanels = readGatedPanelState<FlowGraphPanelsState>(
    dockview,
    panelState?.flowGraphPanels,
  );
  const eventGraphPanels = readGatedPanelState<EventGraphPanelsState>(
    dockview,
    panelState?.eventGraphPanels,
  );
  const artifactPanels = readGatedPanelState<ArtifactPanelsState>(
    dockview,
    panelState?.artifactPanels,
  );
  const artifactAuthoringPanels =
    readGatedPanelState<ArtifactAuthoringPanelsState>(
      dockview,
      panelState?.artifactAuthoringPanels,
    );
  const flowAuthoringPanels = readGatedPanelState<FlowAuthoringPanelsState>(
    dockview,
    panelState?.flowAuthoringPanels,
  );

  return {
    dockview,
    flowGraphPanels,
    eventGraphPanels,
    artifactPanels,
    artifactAuthoringPanels,
    flowAuthoringPanels,
  };
}

// tab-local sessionStorage wins first -- same-tab continuity across both
// in-app navigation (Workbench unmount/remount) and a real reload, neither of
// which should be able to pick up a *different* tab's edits. Only a
// genuinely new tab (empty or unusable sessionStorage) falls back to the
// cross-tab-shared localStorage "last known good" snapshot. The choice
// happens at the whole-envelope level, never per field -- a valid
// sessionStorage envelope is used entirely on its own terms (including
// whatever per-field nulls it has), never patched with fields pulled from a
// different tab's localStorage data.
export function loadPersistedDockState(
  storages: DockStorages = {
    session: window.sessionStorage,
    local: window.localStorage,
  },
): LoadedDockState {
  return (
    readSnapshot(storages.session) ??
    readSnapshot(storages.local) ??
    EMPTY_LOADED_STATE
  );
}

// written to both on every save -- session for this tab's own isolated
// continuity, local to keep the cross-tab "seed a new tab" fallback fresh.
// Each write is independent/best-effort; one storage being unavailable
// doesn't block the other.
export function savePersistedDockState(
  snapshot: {
    dockview: SerializedDockview;
    flowGraphPanels: FlowGraphPanelsState;
    eventGraphPanels: EventGraphPanelsState;
    artifactPanels: ArtifactPanelsState;
    artifactAuthoringPanels: ArtifactAuthoringPanelsState;
    flowAuthoringPanels: FlowAuthoringPanelsState;
  },
  storages: DockStorages = {
    session: window.sessionStorage,
    local: window.localStorage,
  },
): void {
  const payload = JSON.stringify({
    version: CURRENT_VERSION,
    dockview: snapshot.dockview,
    panelState: {
      flowGraphPanels: snapshot.flowGraphPanels,
      eventGraphPanels: snapshot.eventGraphPanels,
      artifactPanels: snapshot.artifactPanels,
      artifactAuthoringPanels: snapshot.artifactAuthoringPanels,
      flowAuthoringPanels: snapshot.flowAuthoringPanels,
    },
  });
  try {
    storages.session.setItem(STORAGE_KEY, payload);
  } catch {
    // storage full/unavailable -- best-effort only, nothing to recover into
  }
  try {
    storages.local.setItem(STORAGE_KEY, payload);
  } catch {
    // storage full/unavailable -- best-effort only, nothing to recover into
  }
}
