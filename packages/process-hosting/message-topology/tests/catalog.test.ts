import { describe, expect, it } from "vitest";
import type { Subscription } from "@lcase/ports";
import { assertCatalog } from "../src/catalog.js";
import { defineSubscription } from "../src/define-topic.js";
import {
  syntheticCatalog,
  requests,
  outcomes,
  engineRequests,
} from "./helpers/synthetic-deployment.js";

// These checks used to run inside each carrier, on whatever topology it was
// handed. They belong to the declarations themselves, so they run once here and
// reach a carrier through `resolveHostPlan`.
describe("assertCatalog", () => {
  it("accepts a catalog whose subscriptions select declared topics", () => {
    expect(() => assertCatalog(syntheticCatalog)).not.toThrow();
  });

  it("rejects duplicate topic ids", () => {
    expect(() =>
      assertCatalog({
        topics: [requests, { ...requests }],
        subscriptions: [engineRequests],
      }),
    ).toThrow(/duplicate topic id 'synthetic-requests.v1'/);
  });

  it("rejects a subscription selecting a topic the catalog never declared", () => {
    expect(() =>
      assertCatalog({
        topics: [requests],
        subscriptions: [
          defineSubscription({
            id: "synthetic-stray.v1",
            topics: [outcomes],
          }),
        ],
      }),
    ).toThrow(/references undeclared topic 'synthetic-outcomes.v1'/);
  });

  // Both of these survive the type system only through the erased
  // `readonly Subscription[]` form a catalog reaches its consumers in, which is
  // why they are checked at all.
  it("rejects a subscription selecting no topics", () => {
    expect(() =>
      assertCatalog({
        topics: [requests],
        subscriptions: [
          { id: "synthetic-empty.v1", topics: [] } as unknown as Subscription,
        ],
      }),
    ).toThrow(/subscription 'synthetic-empty.v1' selects no topics/);
  });

  it("rejects a subscription selecting the same topic twice", () => {
    expect(() =>
      assertCatalog({
        topics: [requests],
        subscriptions: [
          {
            id: "synthetic-dup.v1",
            topics: [requests, requests],
          } as unknown as Subscription,
        ],
      }),
    ).toThrow(
      /subscription 'synthetic-dup.v1' selects topic 'synthetic-requests.v1' more than once/,
    );
  });
});
