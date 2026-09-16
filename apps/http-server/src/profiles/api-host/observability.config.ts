export type SinkId =
  "console-log-sink" | "websocket-sink" | "replay-jsonl-sink";

export type ObservabilityConfig = {
  sinks?: SinkId[];
  webSocketPort?: number;
};
