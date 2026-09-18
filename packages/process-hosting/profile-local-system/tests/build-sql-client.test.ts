import { describe, expect, it } from "vitest";
import { buildSqlClient } from "../src/build-sql-client.js";

describe("buildSqlClient", () => {
  // Both clients are generated from the same models and satisfy the same
  // narrowed type, so the branch cannot be told apart by shape. What it is told
  // apart by is the thing that actually differs: which provider the driver
  // adapter reaches, which only shows up once something connects.
  it("returns a client and lifecycle hooks for a sqlite config", () => {
    const { client, hooks } = buildSqlClient({ kind: "sqlite" });

    expect(client.run.findMany).toBeInstanceOf(Function);
    expect(hooks.start).toBeInstanceOf(Function);
    expect(hooks.stop).toBeInstanceOf(Function);
    expect(hooks.health).toBeInstanceOf(Function);
  });

  it("returns a client and lifecycle hooks for a postgres config", () => {
    const { client, hooks } = buildSqlClient({
      kind: "postgres",
      url: "postgresql://lcase:lcase@localhost:5432/lcase",
    });

    expect(client.run.findMany).toBeInstanceOf(Function);
    expect(hooks.start).toBeInstanceOf(Function);
    expect(hooks.stop).toBeInstanceOf(Function);
    expect(hooks.health).toBeInstanceOf(Function);
  });

  // Construction must not connect: the profile builds this synchronously, and
  // connecting is start()'s job. Same property build-message-router.test.ts
  // asserts for Redis, and the reason an unreachable database has to fail at
  // startup rather than inside the first request.
  it("does not connect while constructing", () => {
    expect(() =>
      buildSqlClient({
        kind: "postgres",
        url: "postgresql://lcase:lcase@127.0.0.1:1/nope",
      }),
    ).not.toThrow();
  });

  // `$connect()` alone is not enough: under a driver adapter it resolves
  // without reaching the server, so a runtime whose start hook only connected
  // would report a healthy start against a database that is not there.
  it("fails to start rather than reporting success when the server is unreachable", async () => {
    const { client, hooks } = buildSqlClient({
      kind: "postgres",
      url: "postgresql://lcase:lcase@127.0.0.1:1/nope",
    });

    await expect(hooks.start?.(client)).rejects.toThrow();
  });

  it("reports unhealthy rather than throwing when the server is unreachable", async () => {
    const { client, hooks } = buildSqlClient({
      kind: "postgres",
      url: "postgresql://lcase:lcase@127.0.0.1:1/nope",
    });

    await expect(hooks.health?.(client)).resolves.toMatchObject({
      status: "unhealthy",
    });
  });
});
