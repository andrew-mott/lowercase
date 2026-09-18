import { createAction } from "@reduxjs/toolkit";

// dispatched once from pages/Explorer.tsx's onDidRemovePanel listener,
// consumed by every keyed-by-panelId slice via extraReducers -- a no-op for
// whichever slice's key never existed for that panel.
export const panelRemoved = createAction<{ panelId: string }>(
  "panels/panelRemoved",
);
