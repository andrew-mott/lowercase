import type { FlowDefinition } from "../../generated/flow-definition.gen.js";
import type { CreateFlowRecordResult } from "../../db-sql/flow-record.js";
import type { Result } from "../../result.type.js";

export type PostFlowReq = {
  body: FlowDefinition;
};

export type PostFlowRes = Result<CreateFlowRecordResult, string>;
