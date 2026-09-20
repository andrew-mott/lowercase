import type {
  AutoGetResult,
  ArtifactMetadataInput,
  ArtifactRepositoryPort,
  ArtifactReadWritePort,
  ArtifactServicePort,
  FlowRepositoryPort,
} from "@lcase/ports";
import type {
  ArtifactIndex,
  ArtifactListFilter,
  ArtifactListItem,
  ArtifactPutInput,
  ArtifactUpdateMetadata,
  FlowDefinition,
  JsonValue,
  Result,
} from "@lcase/types";
import {
  defaultContentTypeForFormat,
  inferFormatFromContentType,
  isArtifactCompatible,
} from "@lcase/flow-analysis";

export class ArtifactService implements ArtifactServicePort {
  constructor(
    private readonly artifacts: ArtifactReadWritePort,
    private readonly artifactRepository: ArtifactRepositoryPort,
    private readonly flowRepository: FlowRepositoryPort,
  ) {}

  async getArtifact(hash: string): Promise<AutoGetResult> {
    const result = await this.artifacts.load(hash);
    if (!result.ok) return result;

    const format = inferFormatFromContentType(result.contentType);
    switch (format) {
      case "json":
        return { ok: true, format, value: result.value as JsonValue };
      case "text":
      case "markdown":
        return { ok: true, format, value: result.value as string };
      case "bytes":
        return { ok: true, format, value: result.value as Uint8Array };
    }
  }

  async listArtifacts(
    filter?: ArtifactListFilter,
  ): Promise<ArtifactListItem[]> {
    const artifacts = await this.artifactRepository.listArtifacts(filter);
    return artifacts.sort((a, b) =>
      b.artifact.time.localeCompare(a.artifact.time),
    );
  }

  async createArtifact(
    input: ArtifactPutInput,
    metadata?: ArtifactUpdateMetadata,
  ): Promise<Result<ArtifactIndex, string>> {
    if (input.value === undefined) return { ok: false, error: "undefined" };
    const contentType =
      input.index?.contentType ?? defaultContentTypeForFormat(input.format);

    if (metadata?.paramCurations) {
      const versionResult = await this.flowRepository.getFlowVersion(
        metadata.flowVersionId,
      );
      if (!versionResult.ok) return versionResult;

      const definitionResult = await this.artifacts.load(
        versionResult.value.definitionHash,
        "application/json",
      );
      if (!definitionResult.ok) {
        return { ok: false, error: definitionResult.error.message };
      }
      const definition = definitionResult.value as FlowDefinition;

      for (const paramName of metadata.paramCurations) {
        const paramDef = definition.params?.[paramName];
        if (!paramDef) {
          return { ok: false, error: `Undeclared param: ${paramName}` };
        }
        // isArtifactCompatible only ever needs contentType -- validating
        // against the not-yet-written input is equivalent to validating the
        // persisted artifact after the fact, and lets creation reject an
        // incompatible param before writing anything, unlike the edit path
        // (which validates an artifact that already exists)
        if (!isArtifactCompatible(contentType, paramDef.type)) {
          return {
            ok: false,
            error: `Artifact incompatible with param: ${paramName}`,
          };
        }
      }
    }

    // curated must come last -- metadata arrives over the wire as parsed
    // JSON, untyped at runtime, so a client could send its own `curated`
    // key despite ArtifactUpdateMetadata never declaring one; spreading
    // metadata first means this always wins over anything it might contain
    const writeMetadata: ArtifactMetadataInput = {
      ...(metadata ?? {}),
      filename: input.index?.filename,
      curated: true,
    };

    const result =
      input.format === "json"
        ? await this.artifacts.save(
            input.value,
            "application/json",
            writeMetadata,
          )
        : input.format === "bytes"
          ? await this.artifacts.save(input.value, contentType, writeMetadata)
          : await this.artifacts.save(
              input.value,
              contentType as `text/${string}`,
              writeMetadata,
            );

    if (result.status === "failed" || result.status === "content-only") {
      return { ok: false, error: result.error.message };
    }

    const index = await this.artifactRepository.getArtifact(result.hash);
    if (!index) {
      return {
        ok: false,
        error: `Artifact not found after save: ${result.hash}`,
      };
    }
    return { ok: true, value: index };
  }

  async updateArtifactMetadata(
    hash: string,
    metadata: ArtifactUpdateMetadata,
  ): Promise<Result<ArtifactIndex, string>> {
    if (metadata.paramCurations) {
      const versionResult = await this.flowRepository.getFlowVersion(
        metadata.flowVersionId,
      );
      if (!versionResult.ok) return versionResult;

      const definitionResult = await this.artifacts.load(
        versionResult.value.definitionHash,
        "application/json",
      );
      if (!definitionResult.ok) {
        return { ok: false, error: definitionResult.error.message };
      }
      const definition = definitionResult.value as FlowDefinition;

      const artifact = await this.artifactRepository.getArtifact(hash);
      if (!artifact) return { ok: false, error: `Artifact not found: ${hash}` };

      for (const paramName of metadata.paramCurations) {
        const paramDef = definition.params?.[paramName];
        if (!paramDef) {
          return { ok: false, error: `Undeclared param: ${paramName}` };
        }
        if (!isArtifactCompatible(artifact.contentType, paramDef.type)) {
          return {
            ok: false,
            error: `Artifact incompatible with param: ${paramName}`,
          };
        }
      }
    }

    return this.artifactRepository.updateMetadata(hash, metadata);
  }

  async listCuratedArtifacts(
    flowVersionId: string,
    paramName: string,
  ): Promise<ArtifactIndex[]> {
    return this.artifactRepository.listCuratedArtifacts(
      flowVersionId,
      paramName,
    );
  }
}
