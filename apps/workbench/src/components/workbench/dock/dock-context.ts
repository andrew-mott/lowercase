import { createContext, useContext } from "react";
import type { DockviewApi } from "dockview-react";

// null = provider present, api not ready yet (the expected transient gap
// before DockviewReact's onReady fires); undefined = no provider at all.
const DockviewApiContext = createContext<DockviewApi | null | undefined>(
  undefined,
);

export { DockviewApiContext };

export function useDockviewApi(): DockviewApi | null {
  const api = useContext(DockviewApiContext);

  if (api === undefined)
    throw new Error(
      "useDockviewApi must be used within Workbench's DockviewApiContext.Provider",
    );

  return api;
}
