import { createContext, useContext } from "react";
import type { ClientControllerPort } from "@lcase/ports";

const ControllerContext = createContext<ClientControllerPort | null>(null);

export function ControllerProvider(props: {
  controller: ClientControllerPort;
  children: React.ReactNode;
}) {
  return (
    <ControllerContext.Provider value={props.controller}>
      {props.children}
    </ControllerContext.Provider>
  );
}

export function useController(): ClientControllerPort {
  const ctx = useContext(ControllerContext);
  if (!ctx) {
    throw new Error("useController must be used within a ControllerProvider");
  }
  return ctx;
}
