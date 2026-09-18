import { describe, expect, it, vi } from "vitest";
import { SimService } from "../src/sim.service.js";
import type {
  ArtifactReadWritePort,
  EmitterFactoryPort,
  FlowRepositoryPort,
  RunQueryPort,
  SimRepositoryPort,
} from "@lcase/ports";
import type { SimListItem } from "@lcase/types";

describe("SimService", () => {
  it("getSimsByFlowVersionId passes through to simRepository.listSimsByFlowVersionId", async () => {
    const simListItem = { sim: { id: "sim-1" } } as unknown as SimListItem;
    const simRepository = {
      listSimsByFlowVersionId: vi.fn().mockResolvedValue([simListItem]),
    } as unknown as SimRepositoryPort;

    const service = new SimService(
      {} as ArtifactReadWritePort,
      {} as EmitterFactoryPort,
      {} as RunQueryPort,
      simRepository,
      {} as FlowRepositoryPort,
    );

    const result = await service.getSimsByFlowVersionId("flow-version-1");

    expect(simRepository.listSimsByFlowVersionId).toHaveBeenCalledWith(
      "flow-version-1",
    );
    expect(result).toEqual([simListItem]);
  });
});
