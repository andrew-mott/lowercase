import type { SqlClient } from "@lcase/db-prisma";
import type {
  CreateSimRecordInput,
  FlowRecord,
  FlowVersionRecord,
  Result,
  SimListItem,
  SimRecord,
} from "@lcase/types";
import type { SimRepositoryPort } from "@lcase/ports";

export type PrismaSimRepositoryDb = {
  sim: Pick<SqlClient["sim"], "create" | "findUnique" | "findMany">;
  flowVersion: Pick<SqlClient["flowVersion"], "findUnique">;
};

function toSimRecord(sim: {
  id: string;
  name: string;
  description: string | null;
  flowId: string;
  flowVersionId: string;
  forkSpecHash: string;
  createdAt: Date;
  updatedAt: Date;
}): SimRecord {
  return {
    id: sim.id,
    name: sim.name,
    description: sim.description ?? undefined,
    flowId: sim.flowId,
    flowVersionId: sim.flowVersionId,
    forkSpecHash: sim.forkSpecHash,
    createdAt: sim.createdAt.toISOString(),
    updatedAt: sim.updatedAt.toISOString(),
  };
}

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

export class PrismaSimRepository implements SimRepositoryPort {
  constructor(private readonly db: PrismaSimRepositoryDb) {}

  async createSim(
    input: CreateSimRecordInput,
  ): Promise<Result<SimRecord, string>> {
    try {
      const flowVersion = await this.db.flowVersion.findUnique({
        where: { id: input.flowVersionId },
        select: { flowId: true },
      });
      if (!flowVersion) {
        return {
          ok: false,
          error: `Flow version not found: ${input.flowVersionId}`,
        };
      }
      if (flowVersion.flowId !== input.flowId) {
        return {
          ok: false,
          error: "Flow version does not belong to the supplied flow",
        };
      }

      const created = await this.db.sim.create({
        data: {
          name: input.name,
          description: input.description,
          flowId: input.flowId,
          flowVersionId: input.flowVersionId,
          forkSpecHash: input.forkSpecHash,
        },
      });

      return { ok: true, value: toSimRecord(created) };
    } catch (error) {
      return {
        ok: false,
        error: `Unable to create sim record: ${String(error)}`,
      };
    }
  }

  async getSim(simId: string): Promise<Result<SimRecord, string>> {
    try {
      const sim = await this.db.sim.findUnique({ where: { id: simId } });
      if (!sim) return { ok: false, error: `Sim not found: ${simId}` };
      return { ok: true, value: toSimRecord(sim) };
    } catch (error) {
      return {
        ok: false,
        error: `Unable to read sim record: ${String(error)}`,
      };
    }
  }

  async listSims(): Promise<SimRecord[]> {
    const sims = await this.db.sim.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return sims.map(toSimRecord);
  }

  async listSimsWithFlowVersion(): Promise<SimListItem[]> {
    return this.#listWithWhere({});
  }

  async listSimsByFlowVersionId(flowVersionId: string): Promise<SimListItem[]> {
    return this.#listWithWhere({ flowVersionId });
  }

  async #listWithWhere(
    where: NonNullable<
      Parameters<PrismaSimRepositoryDb["sim"]["findMany"]>[0]
    >["where"],
  ): Promise<SimListItem[]> {
    const sims = await this.db.sim.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        flow: true,
        flowVersion: true,
      },
    });

    return sims.map((sim) => ({
      sim: toSimRecord(sim),
      flow: toFlowRecord(sim.flow),
      flowVersion: toFlowVersionRecord(sim.flowVersion),
    }));
  }

  async getSimForkSpecHash(simId: string): Promise<Result<string, string>> {
    try {
      const sim = await this.db.sim.findUnique({
        where: { id: simId },
        select: { forkSpecHash: true },
      });
      if (!sim) return { ok: false, error: `Sim not found: ${simId}` };
      return { ok: true, value: sim.forkSpecHash };
    } catch (error) {
      return {
        ok: false,
        error: `Unable to read sim fork spec hash: ${String(error)}`,
      };
    }
  }
}
