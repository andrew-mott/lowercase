import { createContext, useState } from "react";

export type AppContextObject = {
  isRuntimeRunning: boolean;
  setIsRuntimeRunning: (value: boolean) => void;
  clearEvents: () => void;
  totalEvents: number;
  setTotalEvents: (number: number) => void;
  clearEventsSignal: boolean;
};

export const AppContext = createContext<AppContextObject | null>(null);

export function AppContextProvider(props: { children: React.ReactNode }) {
  const [isRuntimeRunning, setIsRuntimeRunning] = useState<boolean>(false);
  const [clearEventsSignal, setClearEventsSignal] = useState<boolean>(false);
  const [totalEvents, setTotalEvents] = useState<number>(0);

  const clearEvents = () => {
    if (clearEventsSignal) setClearEventsSignal(false);
    else setClearEventsSignal(true);
  };

  return (
    <AppContext.Provider
      value={{
        isRuntimeRunning,
        setIsRuntimeRunning,
        clearEvents,
        totalEvents,
        setTotalEvents,
        clearEventsSignal,
      }}
    >
      {props.children}
    </AppContext.Provider>
  );
}
