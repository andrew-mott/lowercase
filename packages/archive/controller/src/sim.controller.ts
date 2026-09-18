// import type {
//   ServerControllerPort,
//   EventSink,
//   FlowList,
//   RuntimeStatus,
// } from "@lcase/ports";
// import { WorkflowRuntime } from "@lcase/runtime";
// import type { Services } from "@lcase/app-services";
// import { FlowQueuedData } from "@lcase/types";

// export class SimController {
//   constructor(private readonly services: Services) {}

//   async runSim(): Promise<void> {
//     // you are given a run id, overrides, etc
//     // go get the hash for that flow id or something
//     // thats your flow def hash.
//     /**
//      * core business logic (infra free).
//      *
//      * parentFlowMeta = getParentFlowHah
//      *
//      * hash = getParentFlowHash(store, parentId);
//      *
//      *
//      *
//      * getFlowDefJson = sim.getParentJson(parentRunId);
//      * isValid = flow.validateFlow(json);
//      * // engine needs to validate/analyse too... or trust.
//      * flow-analysis package is pure functions
//      * engine invokes it directly (cant test, but can test pure functions)
//      *
//      * flow.validateFlow() => analyzeFlow(json, fa);
//      * if (!isValid) return {}
//      *
//      */
//   }

//   async startRuntime(): Promise<RuntimeStatus> {
//     return await this.runtime.startRuntime();
//   }
//   async stopRuntime(): Promise<RuntimeStatus> {
//     return await this.runtime.stopRuntime();
//   }
//   async listFlows(args: { absoluteDirPath?: string }): Promise<FlowList> {
//     if (args.absoluteDirPath === undefined) {
//       throw new Error("[workflow-controller] listFlows directory undefined");
//     }
//     return await this.runtime.flow.listFlows(args);
//   }
//   attachSink(sink: EventSink) {
//     this.runtime.attachSink(sink);
//   }

//   async replayRun(runId: string) {
//     await this.runtime.replay.replayRun(runId);
//   }
// }
