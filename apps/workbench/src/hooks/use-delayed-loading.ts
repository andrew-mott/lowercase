import { useEffect, useState } from "react";

export function useDelayedLoading(isLoading: boolean, delayMs = 200): boolean {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (!isLoading) return;
    const timeout = setTimeout(() => setShouldShow(true), delayMs);
    return () => {
      clearTimeout(timeout);
      setShouldShow(false);
    };
  }, [isLoading, delayMs]);

  return shouldShow;
}
