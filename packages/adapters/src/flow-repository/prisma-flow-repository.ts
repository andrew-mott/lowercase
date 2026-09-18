import type { SqlClient } from "@lcase/db-prisma";
import type {
  FlowLatestVersionSummary,
  FlowListItem,
  CreateFlowRecordInput,
  CreateFlowRecordResult,
  FlowRecord,
  FlowVersionRecord,
  Result,
} from "@lcase/types";
import type { FlowRepositoryPort } from "@lcase/ports";

export type PrismaFlowRepositoryDb = {
  flow: Pick<SqlClient["flow"], "create" | "findUnique" | "findMany">;
  flowVersion: Pick<SqlClient["flowVersion"], "findUnique" | "findMany">;
};

function toFlowRecord(flow: {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  createdAt: Date;
  updatedAt: Date;
}): FlowRecord {
  return {
    id: flow.id,
    name: flow.name,
    description: flow.description ?? undefined,
    kind: flow.kind === "eval" ? "eval" : "business",
    createdAt: flow.createdAt.toISOString(),
    updatedAt: flow.updatedAt.toISOString(),
  };
}

function toFlowVersionRecord(version: {
  id: string;
  flowId: string;
  sequence: number;
  definitionHash: string;
  versionLabel: string | null;
  description: string | null;
  createdAt: Date;
}): FlowVersionRecord {
  return {
    id: version.id,
    flowId: version.flowId,
    sequence: version.sequence,
    definitionHash: version.definitionHash,
    versionLabel: version.versionLabel ?? undefined,
    description: version.description ?? undefined,
    createdAt: version.createdAt.toISOString(),
  };
}

function toLatestVersionSummary(version: {
  id: string;
  flowId: string;
  sequence: number;
  definitionHash: string;
  versionLabel: string | null;
  description: string | null;
  createdAt: Date;
}): FlowLatestVersionSummary {
  return {
    id: version.id,
    flowId: version.flowId,
    sequence: version.sequence,
    definitionHash: version.definitionHash,
    versionLabel: version.versionLabel ?? undefined,
    description: version.description ?? undefined,
    createdAt: version.createdAt.toISOString(),
  };
}

export class PrismaFlowRepository implements FlowRepositoryPort {
  constructor(private readonly db: PrismaFlowRepositoryDb) {}

  async createFlow(
    input: CreateFlowRecordInput,
  ): Promise<Result<CreateFlowRecordResult, string>> {
    try {
      const createdAt = new Date();
      const created = await this.db.flow.create({
        data: {
          name: input.name,
          description: input.description,
          kind: input.kind ?? "business",
          createdAt,
          updatedAt: createdAt,
          versions: {
            create: {
              sequence: 1,
              definitionHash: input.definitionHash,
              versionLabel: input.versionLabel,
              description: input.versionDescription,
              createdAt,
            },
          },
        },
        include: {
          versions: {
            orderBy: { sequence: "asc" },
            take: 1,
          },
        },
      });

      const version = created.versions[0];
      if (!version) {
        return { ok: false, error: "Flow version was not created" };
      }

      return {
        ok: true,
        value: {
          flow: toFlowRecord(created),
          version: toFlowVersionRecord(version),
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: `Unable to create flow record: ${String(error)}`,
      };
    }
  }

  async getFlow(flowId: string): Promise<Result<FlowRecord, string>> {
    try {
      const flow = await this.db.flow.findUnique({ where: { id: flowId } });
      if (!flow) return { ok: false, error: `Flow not found: ${flowId}` };
      return { ok: true, value: toFlowRecord(flow) };
    } catch (error) {
      return {
        ok: false,
        error: `Unable to read flow record: ${String(error)}`,
      };
    }
  }

  async listFlows(): Promise<FlowRecord[]> {
    const flows = await this.db.flow.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return flows.map(toFlowRecord);
  }

  async listFlowsWithLatestVersion(): Promise<FlowListItem[]> {
    const flows = await this.db.flow.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        versions: {
          orderBy: [{ sequence: "desc" }],
          take: 1,
        },
      },
    });

    return flows.flatMap((flow) => {
      const latestVersion = flow.versions[0];
      if (!latestVersion) return [];
      return [
        {
          flow: toFlowRecord(flow),
          latestVersion: toLatestVersionSummary(latestVersion),
        },
      ];
    });
  }

  async listFlowVersions(flowId: string): Promise<FlowVersionRecord[]> {
    const versions = await this.db.flowVersion.findMany({
      where: { flowId },
      orderBy: { sequence: "asc" },
    });
    return versions.map(toFlowVersionRecord);
  }

  async getFlowVersion(
    flowVersionId: string,
  ): Promise<Result<FlowVersionRecord, string>> {
    try {
      const version = await this.db.flowVersion.findUnique({
        where: { id: flowVersionId },
      });
      if (!version) {
        return {
          ok: false,
          error: `Flow version not found: ${flowVersionId}`,
        };
      }

      return { ok: true, value: toFlowVersionRecord(version) };
    } catch (error) {
      return {
        ok: false,
        error: `Unable to read flow version: ${String(error)}`,
      };
    }
  }

  async getFlowVersionDefinitionHash(
    flowVersionId: string,
  ): Promise<Result<string, string>> {
    try {
      const version = await this.db.flowVersion.findUnique({
        where: { id: flowVersionId },
        select: { definitionHash: true },
      });
      if (!version) {
        return {
          ok: false,
          error: `Flow version not found: ${flowVersionId}`,
        };
      }
      return { ok: true, value: version.definitionHash };
    } catch (error) {
      return {
        ok: false,
        error: `Unable to read flow version hash: ${String(error)}`,
      };
    }
  }
}
