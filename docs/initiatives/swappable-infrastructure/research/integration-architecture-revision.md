# Back and forth research with codex on refining the architecture

Summary:

Unhappy with how component inbound/outbound ports/adapters + the integrations folder works in view of the new
runtime and proposed redis implementation, and how observability currently works - and being mid refactor (retiring event bus, moving componets to a core with truly local + remote adapters) - back and forth discussion research yielded some results that may be somewhat relevant for a target shape.

This is Codex' raw output, not reworked, and not actually gospel or a plan, just a reference history for a possible general direction:

# Codex Recommendation

My recommendation is to simplify the local architecture and let the distributed architecture carry the distributed complexity:

- Define one stable `JobExecutionPort`.
- Have the worker provide it.
- Wire it directly into the engine locally.
- Add ingress/egress adapters only when Redis creates a real transport boundary.
- Let runtime profiles select and assemble those bindings.
- Retire `packages/integrations` once its current bridge is gone.

That is still a reasonable hexagonal architecture. It relaxes one overly strict rule: separate caller-owned and provider-owned ports are useful when their semantics genuinely differ—not merely because two components are involved.

## The central model

The worker should not receive a job-execution adapter. Job execution is what the worker provides:

```ts
const worker = createWorker({
  artifacts,
  permits,
  protocol,
  lifecycle,
});

const jobExecution =
  config.bindings.jobExecution.kind === "direct"
    ? worker
    : createMessageLogJobExecutionClient(messageLog);

const engine = createEngine({
  jobExecution,
  // ...
});
```

The worker receives only capabilities it needs to send work toward:

- artifact access
- resource permits
- protocol execution
- lifecycle-event recording

Locally, `worker` itself satisfies `JobExecutionPort`. There is no local inbound adapter because no external boundary is being adapted.

Remotely, a worker host surrounds that same port:

```text
command ingress
    ↓
worker.execute(command)
    ↓
result egress
```

That host is the small bridge you anticipated. It belongs at the Redis/process boundary, not inside worker core and not on the local path.

## Why I would change the current design

The existing design is architecturally defensible:

```text
Engine JobExecutorPort
    → LocalWorkerJobExecutor
    → Worker JobExecutionPort
```

But in practice, the bridge mostly rearranges the same job information and then rearranges the result back. It also currently has a knowingly temporary identity mapping, `executionId = jobId`, in [mapper.ts](/Users/andrew/dev/lowercase/platform/packages/integrations/src/engine-worker/mapper.ts:14). The two interfaces can be compared in [job-executor.port.ts](/Users/andrew/dev/lowercase/platform/packages/ports/src/engine/job-executor.port.ts:3) and [job-execution.port.ts](/Users/andrew/dev/lowercase/platform/packages/components/worker/src/ports/inbound/job-execution.port.ts:7).

That translation is not buying enough isolation to justify making every future local relationship repeat the pattern. Your concern about eventually acquiring `worker-observability`, `worker-limiter`, and similar bridges is valid.

I would replace the blanket rule in [model.md](/Users/andrew/dev/lowercase/platform/docs/component-architecture/model.md:66) with:

> Use a shared capability contract when caller and provider agree on the operation. Introduce separate ports and an integration adapter only when there is a real semantic or policy translation.

For this monorepo, under one owner, that is the better tradeoff. The Redis wire schema should still be separate and versioned; sharing an application port does not mean serializing TypeScript objects blindly or leaking retry/ack metadata into worker core.

## Suggested structure

```text
packages/
  ports/
    src/
      job-execution/
        job-execution.port.ts
        job-execution.contracts.ts
      observability/
        lifecycle-event-ingress.port.ts
      resource-permit/
        resource-permit.port.ts

  types/
    src/
      messages/
        job-execution/
          v1.ts                       # Redis wire contract only

  components/
    worker/
      src/
        core/
          worker.ts
          worker-capacity.ts
          execution-output-storage.ts
        events/
          worker-lifecycle.events.ts
        ports/
          outbound/
            worker-lifecycle-event-sink.port.ts
            resource-permit.port.ts
        protocol/
          protocol-executor.ts
          http-json/
        adapters/
          message-log/
            job-command.ingress.ts
            job-result.egress.ts
            message-log-worker.host.ts
          lifecycle/
            encode-worker-lifecycle-event.ts
            direct-worker-lifecycle.sink.ts
            message-log-worker-lifecycle.egress.ts

    engine/
      src/
        core/
        adapters/
          message-log/
            job-command.egress.ts
            job-result.ingress.ts
            pending-job-results.ts
            message-log-job-execution.client.ts

    observability/
      src/
        core/
          lifecycle-event-ingress.ts
        adapters/
          inbound/
            legacy-event-bus.ingress.ts
            message-log-lifecycle.ingress.ts

  adapters/
    src/
      message-log/
        redis-message-log.ts          # generic Redis mechanics

  runtime/
    src/
      bindings/
        job-execution.binding.ts
        lifecycle-events.binding.ts
        resource-permits.binding.ts
      profiles/
        local-system/
        engine-process/
        worker-process/

apps/
  worker/
    src/
      main.ts
```

The component-adjacent message-log adapters should depend on `MessageLogPort`, not directly on the Redis client. Concrete Redis mechanics remain in the infrastructure adapter package.

I would adjust the worker architecture test accordingly: protect `core`, domain events, and ports from transport types, while permitting the explicitly named `adapters/message-log` directory to know about message envelopes.

## Terminology

Keep both vocabularies, because they answer different questions:

- **Inbound/outbound port:** direction of dependency relative to a component.
- **Ingress/egress:** literal receipt or transmission across a process/transport boundary.

Therefore:

- `JobExecutionPort` is the worker’s inbound capability.
- `WorkerLifecycleEventSink` is worker outbound.
- `job-command.ingress.ts` literally receives Redis commands.
- `job-result.egress.ts` literally transmits Redis results.
- The host coordinates ingress → worker → egress.

Do not split the worker core into command and result ports merely to resemble Redis. `execute(command): Promise<JobResult>` is the right application API. A strict one-way core would force pending-call correlation into the local path for no benefit.

## Observability

I would also change the currently planned C9 direction before implementing it.

Do not build Redis → old EventBus as the main path. Build the real `LifecycleEventIngress` already anticipated in [the worker initiative](/Users/andrew/dev/lowercase/platform/docs/initiatives/worker-tools-artifacts/INITIATIVE.md:62):

```text
Local:
worker lifecycle fact
    → direct lifecycle sink
    → Observability LifecycleEventIngress

Remote:
worker lifecycle fact
    → message-log lifecycle egress
    → Redis
    → message-log lifecycle ingress
    → the same Observability LifecycleEventIngress
```

The worker forms each fact once. Both delivery paths use the same encoder. That gives local and remote the same event substance.

Keep `JobResult` separate from lifecycle events. It is a correlated control-flow reply that advances the engine; lifecycle facts are durable observations. Give remote results their own correlated result channel rather than settling an engine call from the lifecycle stream.

For ordering, promise deterministic causal order per execution—not identical wall-clock arrival across processes:

```text
job submitted
→ execution started
→ execution terminal
→ result delivered
→ engine step terminal
```

Carry stable event IDs, execution IDs, causation IDs, and a phase/sequence. The current in-memory bus does not actually await subscribers anyway, so it does not guarantee completed sink writes in publication order ([inmemory.event-bus.ts](/Users/andrew/dev/lowercase/platform/packages/adapters/src/event-bus/inmemory.event-bus.ts:27)).

## Implementation order

I would proceed in these increments:

1. Consolidate onto `JobExecutionPort`; preserve C7’s identity fix; directly wire worker into engine; remove `JobExecutorPort`, `LocalWorkerJobExecutor`, its mapper, and then `packages/integrations`.
2. Build bus-independent `LifecycleEventIngress` and wire worker lifecycle locally.
3. Add the remote command-ingress/result-egress host and engine-side correlated client.
4. Add Redis lifecycle delivery to the same observability ingress.
5. Leave the EventBus as a temporary adapter for legacy engine producers, then retire it producer by producer.

That gives you the organizational shape you were reaching for without making the local deployment impersonate a distributed system. I only inspected the repository for this recommendation; I did not modify anything.
