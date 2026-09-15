import type { EventSink } from "@lcase/ports";
import type { AnyEvent } from "@lcase/types";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";

export class WebSocketServerSink implements EventSink {
  id = "websocket-sink";
  wss: WebSocketServer;
  socket: WebSocket | undefined;
  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
  }
  start(): Promise<void> {
    process.on("SIGINT", () => {
      this.wss.close();
      return;
    });

    return new Promise((resolve) => {
      this.wss.on("connection", (socket) => {
        this.socket = socket;
        this.socket.ping();
        this.socket.on("pong", () => {
          resolve();
        });
      });
    });
  }

  stop(): Promise<void> {
    throw new Error("Method not implemented.");
  }

  handle(event: AnyEvent): void {
    if (this.socket) {
      try {
        this.socket.send(JSON.stringify(event));
      } catch (err) {
        console.error(`Error sending to socket: ${err}`);
      }
    }
  }
}
