// import type { StreamRegistryPort } from "@lcase/ports";
// import { RunContext } from "@lcase/types";
// import { randomUUID } from "crypto";

// export type ResolvedPipes = {
//   from?: {
//     id: string;
//     buffer?: number;
//   };
//   to?: {
//     id: string;
//     payload: string;
//   };
// };

// export class PipeResolver {
//   constructor(private readonly streamRegistry: StreamRegistryPort) {}

//   resolve(ctx: RunContext, stepId: string): ResolvedPipes {
//     const step = ctx.definition.steps[stepId];
//     if (!step) {
//       throw new Error(`[pipe-resolver] no step with name ${stepId}`);
//     }

//     const pipes: ResolvedPipes = {};

//     if (step.type === "parallel") return {};
//     if (step.type === "join") return {};

//     if (step.pipe?.to) {
//       const { id } = this.streamRegistry.createStream(randomUUID());
//       pipes.to = {
//         id,
//         payload: step.pipe.to.payload,
//       };
//       if (
//         ctx.definition.steps[stepId].type !== "parallel" &&
//         ctx.definition.steps[stepId].type !== "join" &&
//         ctx.definition.steps[stepId]?.pipe?.to
//       ) {
//         if (ctx.steps[stepId]?.pipe?.to) {
//           ctx.steps[stepId].pipe.to = pipes.to;
//         }
//       }
//     }
//     if (step.pipe?.from) {
//       const fromStep = step.pipe.from.step;
//       const id = ctx.steps[fromStep]?.pipe?.to?.id;
//       if (id === undefined) {
//         throw new Error(`[pipe-resolver] cannot setup stream - no from id;`);
//       }
//       console.log(`[pipe-resolver] stepName ${stepId}; id${id}`);
//       pipes.from = {
//         id,
//         buffer: step.pipe.from.buffer,
//       };
//       if (ctx.steps[stepId]?.pipe?.from) {
//         ctx.steps[stepId].pipe.from = pipes.from;
//       }
//       console.log(
//         `[pipe-resolver] pipes.from ${JSON.stringify(pipes.from, null, 2)}`
//       );
//     }
//     return pipes;
//   }
// }
