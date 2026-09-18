import { useContext, useState } from "react";
import { useController } from "../context/ControllerContext.js";
import type { RuntimeStatus } from "@lcase/ports";
import { AppContext } from "../context/AppContext.js";

export function RuntimeControls() {
  const controller = useController();
  const ctx = useContext(AppContext);
  if (!ctx) {
    console.error("[runtime-controls] no app context");
    return;
  }

  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>("stopped");

  const handleRuntimeClick = async () => {
    if (runtimeStatus === "stopped") {
      const result = await controller.startRuntime();
      if (result) setRuntimeStatus(result);
      if (result === "running") {
        ctx.setIsRuntimeRunning(true);
      }
    } else if (runtimeStatus === "running") {
      const result = await controller.stopRuntime();
      if (result) setRuntimeStatus(result);
      if (result === "stopped") ctx.setIsRuntimeRunning(false);
    }
  };

  const runtimeButtonText = runtimeStatus === "stopped" ? "Start" : "Stop";
  const runtimeButtonClass =
    runtimeStatus === "stopped" ? "runtime-stopped" : "runtime-running";

  return (
    <div id="runtime-ctrl">
      <p>
        Runtime: <span className="bold">{runtimeStatus}</span>
      </p>
      <button
        id="runtime-btn"
        className={runtimeButtonClass}
        onClick={handleRuntimeClick}
      >
        {runtimeButtonText}
      </button>
    </div>
  );
}
