import type { ExportRef } from "@lcase/types";
import { describe, expect, it, vi } from "vitest";
import { storeCompletedOutputs } from "../src/execution-output-storage.js";
import { createFakeArtifactWriterPort } from "./helpers/fake-artifact-writer.js";

function makeExport(overrides: Partial<ExportRef> = {}): ExportRef {
  return {
    exportName: "result",
    valuePath: ["output", "result"],
    scope: "output",
    string: "steps.x.exports.result",
    type: "application/json",
    ...overrides,
  };
}

describe("storeCompletedOutputs", () => {
  it("parses a JSON string before storing an application/json export", async () => {
    const { writer, store } = createFakeArtifactWriterPort();

    const result = await storeCompletedOutputs(
      writer,
      { result: '{"answer":42}' },
      undefined,
      { result: makeExport() },
    );

    if (!result.ok) throw new Error(result.error.message);
    expect(store.get(result.outputs.output.hash)).toEqual({
      contentType: "application/json",
      content: { result: '{"answer":42}' },
    });
    expect(store.get(result.outputs.exports!.result!.hash)).toEqual({
      contentType: "application/json",
      content: { answer: 42 },
    });
  });

  it("classifies malformed JSON as an export-resolution failure", async () => {
    const { writer } = createFakeArtifactWriterPort();

    const result = await storeCompletedOutputs(
      writer,
      { result: "not-json" },
      undefined,
      { result: makeExport() },
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "EXPORT_RESOLUTION_FAILED",
        message: expect.stringContaining(
          'Export "result" could not be parsed as JSON',
        ),
        retryable: false,
      },
      output: { hash: "fake-hash-1" },
    });
  });

  it("retains the primary output when an export path cannot be resolved", async () => {
    const { writer, store } = createFakeArtifactWriterPort();

    const result = await storeCompletedOutputs(
      writer,
      { other: "value" },
      undefined,
      { result: makeExport() },
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "EXPORT_RESOLUTION_FAILED",
        retryable: false,
      },
      output: { hash: "fake-hash-1" },
    });
    expect(store.get("fake-hash-1")).toEqual({
      contentType: "application/json",
      content: { other: "value" },
    });
  });

  it("rejects a non-string text export after storing the primary output", async () => {
    const { writer } = createFakeArtifactWriterPort();

    const result = await storeCompletedOutputs(
      writer,
      { result: { answer: 42 } },
      undefined,
      {
        result: makeExport({
          type: "text/plain",
        }),
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "EXPORT_RESOLUTION_FAILED",
        message:
          'Export "result" declared text/plain but resolved value is not a string',
        retryable: false,
      },
      output: { hash: "fake-hash-1" },
    });
  });

  it("retains the primary output when storing an export fails", async () => {
    const { writer } = createFakeArtifactWriterPort();
    vi.spyOn(writer, "save").mockImplementation((async (
      content: unknown,
      contentType: string,
    ) => {
      if (contentType === "text/plain") {
        return {
          status: "failed" as const,
          error: { code: "STORE_PUT_FAILED", message: "export disk full" },
        };
      }
      return { status: "saved" as const, hash: "fake-hash-1" };
    }) as typeof writer.save);

    const result = await storeCompletedOutputs(
      writer,
      { result: "hello" },
      undefined,
      {
        result: makeExport({
          type: "text/plain",
        }),
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "EXPORT_STORE_FAILED",
        message: "export disk full",
        retryable: false,
      },
      output: { hash: "fake-hash-1" },
    });
  });
});

describe("storeCompletedOutputs content-type dispatch", () => {
  it("stores a text response tagged with its real content type", async () => {
    const { writer, store } = createFakeArtifactWriterPort();

    const result = await storeCompletedOutputs(writer, "hello", "text/plain");

    if (!result.ok) throw new Error(result.error.message);
    expect(store.get(result.outputs.output.hash)).toEqual({
      contentType: "text/plain",
      content: "hello",
    });
  });

  it("stores a binary response tagged with its real content type", async () => {
    const { writer, store } = createFakeArtifactWriterPort();
    const bytes = new Uint8Array([1, 2, 3]);

    const result = await storeCompletedOutputs(writer, bytes, "audio/wav");

    if (!result.ok) throw new Error(result.error.message);
    expect(store.get(result.outputs.output.hash)).toEqual({
      contentType: "audio/wav",
      content: bytes,
    });
  });

  it("falls back to text/plain for a string payload with no known content type", async () => {
    const { writer, store } = createFakeArtifactWriterPort();

    const result = await storeCompletedOutputs(writer, "hello", undefined);

    if (!result.ok) throw new Error(result.error.message);
    expect(store.get(result.outputs.output.hash)).toEqual({
      contentType: "text/plain",
      content: "hello",
    });
  });

  it("falls back to application/octet-stream for a binary payload with no known content type", async () => {
    const { writer, store } = createFakeArtifactWriterPort();
    const bytes = new Uint8Array([1, 2, 3]);

    const result = await storeCompletedOutputs(writer, bytes, undefined);

    if (!result.ok) throw new Error(result.error.message);
    expect(store.get(result.outputs.output.hash)).toEqual({
      contentType: "application/octet-stream",
      content: bytes,
    });
  });

  it("still tags a bare JSON object application/json with no known content type", async () => {
    const { writer, store } = createFakeArtifactWriterPort();

    const result = await storeCompletedOutputs(
      writer,
      { foo: "bar" },
      undefined,
    );

    if (!result.ok) throw new Error(result.error.message);
    expect(store.get(result.outputs.output.hash)).toEqual({
      contentType: "application/json",
      content: { foo: "bar" },
    });
  });

  it("fails declared exports against a binary response, retaining the stored primary output", async () => {
    const { writer, store } = createFakeArtifactWriterPort();
    const bytes = new Uint8Array([1, 2, 3]);

    const result = await storeCompletedOutputs(writer, bytes, "audio/wav", {
      result: makeExport(),
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "EXPORT_RESOLUTION_FAILED",
        message: expect.stringContaining("audio/wav"),
        retryable: false,
      },
      output: { hash: "fake-hash-1" },
    });
    expect(store.get("fake-hash-1")).toEqual({
      contentType: "audio/wav",
      content: bytes,
    });
  });

  it("stores a binary output with no declared exports without error", async () => {
    const { writer, store } = createFakeArtifactWriterPort();
    const bytes = new Uint8Array([1, 2, 3]);

    const result = await storeCompletedOutputs(writer, bytes, "audio/wav");

    if (!result.ok) throw new Error(result.error.message);
    expect(result.outputs.exports).toBeUndefined();
    expect(store.get(result.outputs.output.hash)?.contentType).toBe(
      "audio/wav",
    );
  });
});
