import type { FlowDefinition } from "../../generated/flow-definition.gen.js";
import type {
  FlowRecord,
  FlowVersionRecord,
} from "../../db-sql/flow-record.js";
import type { Result } from "../../result.type.js";

export type FlowLatestVersionSummary = {
  id: string;
  flowId: string;
  sequence: number;
  definitionHash: string;
  versionLabel?: string;
  description?: string;
  createdAt: string;
};

export type FlowListItem = {
  flow: FlowRecord;
  latestVersion: FlowLatestVersionSummary;
};

// http response shapes
export type GetFlowsRes = Result<FlowListItem[], string>;

export type GetFlowVersionsRes = Result<FlowVersionRecord[], string>;

export type FlowVersionDefinition = {
  version: FlowVersionRecord;
  definition: FlowDefinition;
};

export type GetFlowVersionRes = Result<FlowVersionDefinition, string>;
