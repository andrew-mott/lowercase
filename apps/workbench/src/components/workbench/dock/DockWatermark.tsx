// Same background dockview itself paints for this area
// (--dv-group-view-background-color in dock-theme.css) -- mixing toward
// --foreground rather than a hardcoded second color keeps this correct in
// both themes automatically, and keeps the wordmark deliberately quiet
// (background texture, not something meant to compete for attention).
const WORDMARK_COLOR =
  "color-mix(in oklch, var(--dock-tab-background) 85%, var(--foreground) 15%)";

export function DockWatermark() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2">
      <span
        className="text-6xl font-semibold tracking-tight select-none"
        style={{ color: WORDMARK_COLOR }}
      >
        lowercase
      </span>
      <span className="text-sm text-muted-foreground select-none">
        Open an item from the tree to begin.
      </span>
    </div>
  );
}
