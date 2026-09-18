# Worker Lifecycle and Controlled Ingress: Deferred Scope

## Status and scope

Scoped as the last Change of the [Remote Worker Arc](../arcs/remote-worker.md),
numbered C30 at the time, and moved out of it before starting. That number now
belongs to the Initiative's close-out. The arc's goal -- a real remote Worker,
packaged and deployed -- is met without it, and most of its value depends on
Redis delivery work the arc also defers: a drained stop protects polite
shutdowns, but without reclaim an entry pending on a Worker that stops mid-job
stays stranded either way. It belongs with that work, as part of a later Redis
delivery and lifecycle effort, rather than as the arc's last Change.

What follows is the scope as written when it was still a Change, kept because
its starting position was measured rather than assumed.

## Scope as written

Worker is a long-lived autonomous component with real capacity and execution
state, so the remote process must not manage it through no-op lifecycle hooks.
Give the same Worker used by embedded and remote profiles meaningful `start()`,
`stop()`, and `health()` control. Its lifecycle state should express whether it
is accepting work, draining, or stopped, while preserving the component's
existing capacity and terminal-topic ownership.

This sits after the deployment proof rather than before it. The stop contract is
least legible in the embedded profile, where one router resource serves Worker,
Engine, and Observability at once; in the Worker host it is a process reading one
subscription and publishing one topic, which is where the phases are actually
separable. Design the contract there, then bring it back to the embedded profile
and the companion.

**Starting position, as measured during C25's discussion.**

- Worker is not a managed resource at all today, and has no `start`, `stop`, or
  `health`. `assembleEmbeddedSystem` takes sql, bus, sinks, tap, engine,
  limiter, and router; the profile retains Worker only so its handler can be
  bound. There are no no-op hooks to correct — this is additive.
- The cancellation producer was pre-built for this Change. `executeSubmission`'s
  `callerSignal` is threaded through capacity and permits and has no producer,
  with a comment saying a shutdown source can be added without reopening that
  path. `WorkerCapacity.acquire` already answers what happens to work waiting
  for capacity: it returns cancelled and records no lifecycle facts, because
  execution never reached started.
- A `cancelledResult()` still returns through `handleHttpJsonSubmitted` and
  publishes a terminal. So cancel-on-shutdown currently means emitting a
  terminal, which needs egress alive, and that collides with the retained-entry
  policy this Change wants under Redis. Those are two different answers to the
  same event and the Change has to choose.
- The Redis carrier already settles in-flight handlers — `stop()` clears
  `running`, awaits the read loops, and only then closes connections, while a
  loop awaits handler settlement and acknowledgement through the lane. The
  in-process carrier drains nothing: its hooks are empty by design, and
  `whenIdle()` is explicitly not a drain and is unwired from lifecycle. The gap
  is the opposite way round from the intuition.
- A blocked `XREADGROUP` is not interrupted by clearing `running`, so one final
  batch is admitted and run after stop is requested. Not a leak, but not
  quiescence either.

**The structural obstacle.** The ordered stop policy cannot be expressed by the
current runtime. `stopAll` walks one flat list strictly in reverse of start, and
the router is a single resource owning both ingress and egress, so Worker has no
position in that list that is both after ingress ends and before egress closes.
Placing Worker before the router loses egress while it drains; placing it after
starts the carrier ahead of the component it delivers to. Either the router
resource splits — which is what C22's host-binding split was meant to enable — or
`ManagedRuntime` gains an explicit quiesce phase, which changes a generic
contract four other resources already satisfy.

Worker lifecycle and carrier lifecycle remain separate responsibilities. Worker
owns whether it accepts work and how its active executions settle. The process
host owns whether a subscription is polling or presenting deliveries. Worker
must not learn about Redis, consumer groups, mailboxes, or deployment placement
merely to coordinate those controls.

The ordered host policy is:

1. quiesce that host's Worker-command ingress so it presents no new work;
2. define honestly what happens to work already admitted or waiting for Worker
   capacity;
3. let active work reach its chosen finish-or-cancel boundary while terminal
   topic remains available;
4. stop Worker only after the executions covered by that policy settle; and
5. stop remaining messaging egress and infrastructure dependencies afterward.

Redis entries not yet presented may remain in Redis for a later process; an
in-process carrier has no durable equivalent. This Change must state and test the
minimum common stop guarantee and each carrier's stronger behavior rather than
making the local carrier imitate Redis recovery. A delivery refused because
Worker is no longer accepting must not be silently acknowledged as successful.

Local Worker health reports only the component instance this process owns.
Whether a separately deployed Worker process is reachable or whether enough
Worker instances exist is deployment health, not a fake remote
`ManagedResource<Worker>` inside an Engine or gateway process.

**Completion evidence, as scoped.**

- The retained Worker instance exposes tested accepting, draining/stopping,
  stopped, and health behavior rather than no-op symmetry methods.
- Every profile hosting Worker starts it before its command ingress and stops
  new ingress before Worker settles active work, over both carriers.
- Terminal topic needed by settling work remains available for the duration
  promised by the stop contract.
- Redis work not yet presented follows an explicit retained-entry policy, and
  in-process admitted work follows an explicit ephemeral policy.
- Every profile hosting Worker includes it as a real managed resource, while
  profiles that do not host Worker include no remote placeholder resource.
- Worker remains free of carrier, topology, deployment, and process-supervisor
  dependencies.
- The claims C25 was forbidden from making are now made and tested, in the apps
  that were forbidden from making them.

**Deferred beyond this scope when it was written.**

- General migration of Engine, Limiter, Replay, Observability, and component
  lifecycle event families off `EventBusPort`.
- A cancellation protocol that replaces the in-process `AbortSignal` path.
- Production Redis delivery hardening: retries, reclaim, retention, poison
  handling, idempotency, and duplicate terminal policy.
- Reconciliation, retry, or recovery for a multi-route admission whose outcome
  is ambiguous beyond C23's transaction-backed happy path.
- Dynamic provider plugins and per-job backend selection.
- A general startup-time component-placement compiler. The explicit profiles
  in this Arc remain compatible presets, but the broader configuration and
  validation surface is deliberately distant work; see the
  [deferred design sketch](./configurable-component-placement.md).
- Hot relocation of components after a process has started.
