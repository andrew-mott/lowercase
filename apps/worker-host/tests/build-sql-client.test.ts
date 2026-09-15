import { describe, expect, it } from "vitest";
import { buildSqlClient } from "../src/profile/build-sql-client.js";

// Refused fast rather than hung: nothing listens on port 1.
const unreachable = "postgresql://lcase:lcase@127.0.0.1:1/nope";

describe("buildSqlClient", () => {
  // Not the compiler's job, despite appearances. Every field on
  // `LifecycleHooks` is optional, so a builder that returned `hooks: {}` would
  // typecheck perfectly and produce a resource whose start, stop and health all
  // silently do nothing.
  it("returns a client with all three lifecycle hooks", () => {
    const { client, hooks } = buildSqlClient({ kind: "postgres" });

    expect(client.run.findMany).toBeInstanceOf(Function);
    expect(hooks.start).toBeInstanceOf(Function);
    expect(hooks.stop).toBeInstanceOf(Function);
    expect(hooks.health).toBeInstanceOf(Function);
  });

  // The profile builds this synchronously, so connecting here would make an
  // unreachable database throw out of `createWorkerHost` instead of arriving as
  // a start outcome the process can report and roll back from.
  it("does not connect while constructing", () => {
    expect(() =>
      buildSqlClient({ kind: "postgres", url: unreachable }),
    ).not.toThrow();
  });

  // The reason the start hook runs a query instead of only `$connect()`. Under
  // a driver adapter `$connect()` resolves without reaching the server, so a
  // hook that stopped there would report a healthy start against a database
  // that is not there.
  it("fails to start when the server is unreachable", async () => {
    const { client, hooks } = buildSqlClient({
      kind: "postgres",
      url: unreachable,
    });

    await expect(hooks.start?.(client)).rejects.toThrow();
  });
});
