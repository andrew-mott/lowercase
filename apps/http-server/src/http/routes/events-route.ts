import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import type { EventSink } from "@lcase/ports";
import type { AnyEvent } from "@lcase/types";

const HEARTBEAT_INTERVAL_MS = 20_000;

export const eventsRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get("/events", (req, reply) => {
    // @fastify/cors sets Access-Control-Allow-Origin via reply.header() in
    // an onRequest hook, which has already run by this point -- captured
    // here because hijack() bypasses Fastify's own send path entirely, so
    // anything set only on `reply` would otherwise be silently dropped once
    // we start writing to the raw response ourselves.
    const allowOrigin = reply.getHeader("access-control-allow-origin");

    reply.hijack();

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...(typeof allowOrigin === "string"
        ? { "Access-Control-Allow-Origin": allowOrigin }
        : {}),
    });
    // writeHead alone doesn't flush to the socket -- Node buffers headers
    // until the first body write, which for SSE could be up to
    // HEARTBEAT_INTERVAL_MS away. Force it immediately so the client sees
    // the connection open right away.
    reply.raw.flushHeaders();

    const sink: EventSink = {
      id: randomUUID(),
      async start() {},
      async stop() {
        reply.raw.end();
      },
      handle(event: AnyEvent) {
        try {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch (err) {
          console.error(
            `[events-route] failed to write to connection ${sink.id}: ${err}`,
          );
        }
      },
    };

    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(": ping\n\n");
      } catch (err) {
        console.error(
          `[events-route] heartbeat failed for connection ${sink.id}: ${err}`,
        );
      }
    }, HEARTBEAT_INTERVAL_MS);

    app.tap.attachSink(sink);
    void sink.start();

    req.raw.on("close", () => {
      clearInterval(heartbeat);
      void sink.stop();
      app.tap.detachSink(sink);
    });
  });
};
