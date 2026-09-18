import { useEffect } from "react";
import { useAppDispatch } from "@/redux/typed-hooks";
import { sseConnect, sseDisconnect } from "@/redux/middleware/sse";
import { SERVER_URL } from "@/lib/server-url";

export function SseBootstrap() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(
      sseConnect({
        url: `${SERVER_URL}/events`,
      }),
    );
    return () => {
      dispatch(sseDisconnect());
    };
  }, [dispatch]);

  return null;
}
