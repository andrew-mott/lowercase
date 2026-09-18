import { useContext } from "react";
import { AppContext } from "../../context/AppContext.js";

export function ObsControls() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    console.error("[obs-controls] no app context");
    return;
  }

  return (
    <div className="obs-controls">
      <button onClick={ctx.clearEvents}>Clear</button>
      Events: {ctx.totalEvents}
    </div>
  );
}
