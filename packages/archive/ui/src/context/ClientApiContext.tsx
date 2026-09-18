import { createContext, useContext } from "react";
import type { ClientApiPort } from "@lcase/ports";

const ClientApiContext = createContext<ClientApiPort | null>(null);

export function ClientApiProvider(props: {
  api: ClientApiPort;
  children: React.ReactNode;
}) {
  return (
    <ClientApiContext.Provider value={props.api}>
      {props.children}
    </ClientApiContext.Provider>
  );
}

export function useClientApi(): ClientApiPort {
  const ctx = useContext(ClientApiContext);
  if (!ctx) {
    throw new Error("useClientApi must be used within a ClientApiContext");
  }
  return ctx;
}
