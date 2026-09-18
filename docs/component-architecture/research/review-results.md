## Findings

1. **High: queued admission has no complete local/remote protocol.** The README models `WorkAdmission.acquire()` as a unary request/result and treats a non-grant as terminal ([README.md:337](../../docs/component-architecture/model.md:337), [README.md:368](../../docs/component-architecture/model.md:368)). But the limiter actually queues denied requests and grants them later ([concurrency-limiter.ts:81](../../packages/components/limiter/src/concurrency-limiter.ts:81)). The sketch recognizes this by returning decisions for unrelated requests during `releasePermit()` ([limiter.next.temp.ts:325](../../packages/components/limiter/src/limiter.next.temp.ts:325)), but it leaves the releasing adapter responsible for routing those decisions. That fails when different workers have separate local adapters. Choose either immediate `tryAcquire()` with no limiter-owned queue, or an explicit two-phase protocol: submission acknowledgment followed by an asynchronous terminal decision through a limiter outbound `PermitDecisionSink`. Given the existing queue, I recommend the latter.

2. **High: retries can corrupt limiter state.** `requestPermit()` mutates the policy before recording events ([limiter.next.temp.ts:305](../../packages/components/limiter/src/limiter.next.temp.ts:305)). If event recording or reply delivery fails, a remote caller can retry and acquire or enqueue twice. `releasePermit()` also always returns `released: true` ([limiter.next.temp.ts:325](../../packages/components/limiter/src/limiter.next.temp.ts:325)); `requestId` and `grantId` exist but do not enforce idempotency. Commands must be deduplicated by `requestId`, grants tracked by `grantId`, and release made idempotent. If lifecycle recording is correctness-critical, state transition and event append need one transaction/outbox boundary. If it is diagnostic only, failure must not fail an already-applied admission operation.

3. **High: grant/denial is still both lifecycle and protocol output.** The sketch declares `limiter.slot.granted/denied` as durable lifecycle events ([limiter.next.temp.ts:191](../../packages/components/limiter/src/limiter.next.temp.ts:191)) and also tells adapters to publish those names as replies ([limiter.next.temp.ts:424](../../packages/components/limiter/src/limiter.next.temp.ts:424)). That preserves the old conflation. Worse, current “denied” means “queued for a later grant,” while the worker ignores denial and listens only for grant ([worker.ts:158](../../packages/components/worker/src/worker.ts:158)).

   Treat the existing topics as compatibility reply-events. The target protocol should use `PermitQueued`, `PermitGranted`, `PermitRejected`, and possibly `PermitCancelled/Expired`. Separately emit `permit.queued`, `permit.granted`, `permit.released`, etc. as limiter lifecycle facts only if limiter recovery/history needs them. Worker progress must depend on the reply path, never the lifecycle stream.

4. **Medium: `EventSink` promises durability without defining its guarantees.** The README calls it a durable fact sink ([README.md:688](../../docs/component-architecture/model.md:688)), but does not define ordering, atomicity, retries, or whether one failed console/UI sink may fail component work. Use a critical `LifecycleEventRecorder` for the authoritative append, then relay to logs, projections, and live UI. Optional observers should not sit synchronously in the component’s correctness path.

5. **Medium: the proposed package tier adds avoidable dependency risk.** The combined `worker-limiter` integration package contains local client, remote client, and server handler ([README.md:260](../../docs/component-architecture/model.md:260)). A worker service importing that package could gain a package-level dependency on limiter core even if bundling removes its runtime code. It also conflicts with the accepted rule that runtime is the only composition root importing both sides ([ADR-0005:14](../../docs/adr/0005-package-tier-taxonomy.md:14)). Initially, keep `LocalWorkAdmission` in runtime/host wiring. Put the remote client and server handler on their respective sides, depending on a small wire-contract package rather than either core. Add an integrations tier only after repeated bridges justify it.

6. **Medium: `PermitPolicy` is over-abstracted and still contains envelope concerns.** It is an internal mutable queue/counter engine, not external IO, so it does not need to be an architectural port merely to support adapters ([limiter.next.temp.ts:83](../../packages/components/limiter/src/limiter.next.temp.ts:83)). It also receives `traceId` and must produce timestamps despite not receiving the injected clock. Make it a concrete pure domain object, perhaps `PermitScheduler` or `PermitLedger`, with no trace metadata. The limiter application layer should add correlation, IDs, timestamps, and lifecycle facts. The current `ConcurrencyLimiter` can also lose its unused bus/emitter dependencies ([concurrency-limiter.ts:38](../../packages/components/limiter/src/concurrency-limiter.ts:38)).

7. **Medium: `start/stop` still conflates host lifecycle with remote control.** The sketch exposes them through `LimiterControl` ([limiter.next.temp.ts:61](../../packages/components/limiter/src/limiter.next.temp.ts:61)), despite the existing control-plane research distinguishing shutdown from quiescing ([control-plane.md:20](../../docs/initiatives/architecture-boundaries/research/control-plane.md:20)). Let the host own construction/start/shutdown. Expose `drain`, `resume`, `pause`, and health remotely. A supervisor can spawn or terminate a process externally; a component that has stopped its transport cannot reliably receive a command to start itself.

## Worth It?

A trimmed version is worth it because optional process boundaries are an explicit project goal. The current bus-first model is sufficient for a modular monolith, but not for reliable deployment parity: the current in-memory bus returns before handlers execute and does not propagate asynchronous handler failures ([inmemory.event-bus.ts:27](../../packages/adapters/src/event-bus/inmemory.event-bus.ts:27)), while its port has no request/reply contract.

The proposed direction buys transport-independent core logic, explicit failure/result semantics, easier unit testing, cleaner replay history, and local calls that do not pretend to be remote. Ports alone do not buy reliable distribution; idempotency, asynchronous result routing, timeout/cancellation, serialization, and event durability are the essential additional costs.

The five-category taxonomy is useful as vocabulary, but should not become five infrastructure pipelines. Commands, results, lifecycle facts, and observability records are enough initially. “Operational” can be an owner/category within lifecycle or observability.

## Recommended Shape

```text
Worker core
  -> WorkAdmission.acquire(): Promise<PermitGrant>
  -> WorkerLifecycleRecorder

Limiter core
  <- PermitRequests.submit()/release()
  -> PermitDecisionSink
  -> LimiterLifecycleRecorder        only if durable limiter history is needed
  -> concrete PermitScheduler

Monolith host
  -> LocalWorkAdmission
  -> LocalDecisionRouter
  -> direct limiter inbound calls

Worker service
  -> RemoteWorkAdmission
  -> command + correlated decision transport

Limiter service
  -> command handler
  -> limiter inbound calls
  -> bus-backed PermitDecisionSink
```

The local direct-call rule is correct. “Direct” should mean calling the inbound API, not necessarily executing all work on the caller’s stack. For engine-to-worker dispatch, the inbound method should acknowledge submission into a worker-owned inbox so local and remote modes preserve the same backpressure and completion semantics.

## Migration Advice

1. Define executable admission contract tests first: immediate grant, queued grant, rejection, cancellation, duplicate request, duplicate release, timeout, and grant delivery to another worker.
2. Give the rewritten worker its own `WorkAdmission` port. Implement a compatibility adapter over the existing slot topics.
3. Refactor limiter handling behind inbound methods and a decision sink while old topics remain entirely in bus adapters.
4. Run the same behavioral suite against local and bus adapters.
5. Move engine dispatch only after this boundary works. Delay supervisor infrastructure and broad package moves.
6. Write an ADR explicitly superseding ADR-0005’s “components are self-driven bus subscribers” definition after the vertical slice proves the replacement.

## Open Questions

- Must the limiter own the wait queue, or would worker retry/backoff permit a much simpler unary API?
- Are permit facts needed to restore limiter state, or only for debugging?
- Does failure to record lifecycle history fail the command?
- What are the cancellation and lease-expiration rules when a worker disappears?
- Is remote delivery expected to be at-most-once or at-least-once?

Overall: `limiter.next.temp.ts` matches the intended dependency direction, but not yet the required asynchronous and failure semantics. Those are the parts to settle before starting the larger refactor.
