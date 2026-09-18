# ADR-0009: Application-core capability modules

Date: 2026-09-07
Status: Proposed

## Context

ADR-0005 defines several useful package roles, but it leaves a gap between
them:

- an Operation is a small, caller-wired function that uses exactly one port;
- an application service orchestrates one externally initiated use case;
- a component owns autonomous work or state transitions; and
- an adapter translates technology and implements a port.

Some cohesive application behavior is call-scoped yet owns policy across more
than one outbound dependency. It may be shared by application services and
components, so assigning it to either caller duplicates policy or forces the
other caller through the wrong facade. It is not autonomous enough to be a
component and is not technology translation.

Artifact I/O is the first exercised example. Saving an artifact coordinates
content-addressed storage and metadata persistence, defines their ordering,
and reports a meaningful partial outcome when bytes exist but metadata does
not. The current artifact reader and writer expose narrow ports, are composed
by runtime, and can use filesystem or S3 storage without moving that policy
into their consumers.

This ADR gives that shape a name and membership rules. It is retrospective to
the artifact split that already landed, but remains Proposed pending deliberate
review and acceptance.

## Decision

Add **application-core capability module**, shortened to **capability module**,
as a named package role:

> A capability module is a runtime-composed, non-entrypoint module that exposes
> a cohesive, call-scoped application capability through one or more narrow
> ports and owns technology-independent policy for using its outbound
> dependencies.

Policy ownership—not its number of ports, classes, or callers—is the defining
property.

### Membership rules

A capability module:

- owns a consumer-independent responsibility expressed in application
  vocabulary;
- exposes one or more narrow provided ports, so each caller receives only the
  capability it needs;
- contains meaningful policy, ordering, consistency, or failure semantics
  rather than merely delegating calls;
- is constructed by runtime or another host from its outbound ports;
- is depended on through contracts by application services and components,
  not through its concrete implementation;
- starts work through a call and returns a defined outcome; and
- exists because current behavior needs the boundary, not because speculative
  reuse might appear later.

Its implementation may depend on types, ports, and functional-core rules. It
does not depend on an application-service or component implementation.

An autonomous inbox, control loop, state machine, or independent start/stop
ownership makes the unit a component instead. A technology-facing translation
with no application policy is an adapter. A pure rule with no I/O is functional
core. An externally initiated use-case facade remains an application service.

Operations also remain distinct. An Operation is function-scale and invoked
with one port already held by its caller. A capability module has an
independently constructed implementation and is allowed to own durable policy
across several dependency boundaries. Not every multi-port function therefore
deserves a module; it must pass the cohesion and policy tests above.

Local consumers may receive the implementation directly through its port. If
a later deployment places the capability elsewhere, a remote client adapter
may implement the same semantic port. Deployment placement does not reclassify
the application-core policy itself, and local calls do not need Messages merely
to resemble a possible remote transport.

Every capability module must make its failure contract explicit, including:

- what counts as success;
- the order in which effects occur;
- which partial states can remain;
- what a retry may repeat safely;
- which layer owns recovery or reconciliation; and
- how capability outcomes differ from transport or infrastructure failures.

### Artifact evidence

`packages/artifacts` is the validating example, not a universal implementation
template:

- `ArtifactWriterPort` hides content storage and metadata persistence behind
  one semantic save capability.
- `ArtifactWriter` writes bytes before metadata, does not attempt metadata
  after storage failure, and preserves the content hash in a typed
  `content-only` result if metadata fails.
- `ArtifactReaderPort` gives read-only consumers decoding and error semantics
  without requiring SQL access.
- `ArtifactReadWritePort` is a flat composition of the two narrow contracts and
  adds no second policy-owning implementation or class.
- Runtime constructs the implementation and supplies only the required view to
  each consumer.
- Filesystem and S3 adapters independently satisfy the lower artifact-store
  port.

The module may contain multiple interfaces and implementation objects; this
decision does not prescribe one broad class. Physical packages remain named for
their domain, such as `packages/artifacts`. Do not introduce a
`packages/capabilities/` container unless several real modules later justify
that hierarchy. This architectural term is also distinct from Worker's
capability-step vocabulary.

### Relationship to existing decisions

If accepted, this ADR would qualify ADR-0005 in two narrow ways:

- its listed package roles would no longer be exhaustive; and
- recognizing multi-port orchestration would not require the immediate
  application-service or component caller to own that policy when a cohesive
  capability module is the proper owner.

It preserves ADR-0005's remaining taxonomy, dependency rules, and conservative
one-port Operations convention. It does not supersede ADR-0006. Because this
ADR is Proposed, the existing ADRs remain Accepted and unchanged.

## Consequences

- Cross-resource success, ordering, and partial-failure policy gain one named
  owner.
- Components and application services can share a semantic capability without
  depending on one another's facade.
- Consumers receive narrower contracts and can test against those contracts.
- Local use remains a direct typed call, while a future remote adapter has a
  credible semantic boundary.
- The taxonomy gains another role that contributors and AIs must learn and
  apply consistently.
- Runtime has more explicit construction and injection work than it would for
  an unstructured helper.
- The category can become a miscellaneous “service” drawer unless cohesion,
  policy ownership, and failure-contract tests remain strict.
- The exact remote error model, artifact reconciliation policy, and whether
  several examples eventually justify a shared physical container remain open.

The following alternatives are rejected:

- **Put the policy in an application service:** it ties a shared capability to
  an external entrypoint and gives component callers the wrong dependency.
- **Generalize Operations to any number of ports:** it erases the useful
  function-scale, caller-wired boundary that makes Operations distinct.
- **Make every such module a component:** it invents autonomy and lifecycle for
  call-scoped behavior.
- **Call it an adapter:** it misclassifies application semantics as technology
  translation.
- **Use Messages for every local capability call:** it adds asynchronous
  delivery semantics to a bounded call that already has a meaningful return
  value.
- **Create a generic capabilities directory now:** one established example
  does not justify another physical hierarchy.

The fuller rationale and classification tests remain in the
[capability-module research](../component-architecture/research/capability-modules.md).
