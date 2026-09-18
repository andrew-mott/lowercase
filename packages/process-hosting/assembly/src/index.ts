/**
 * Generic process lifecycle mechanics, and nothing else.
 *
 * This package has no dependencies at all, which is the point rather than a
 * coincidence: it must be installable by a process that hosts one component,
 * without dragging in Engine, Worker, application services, or any concrete
 * adapter. It accepts already-selected, port-shaped instances and knows nothing
 * about what they are.
 *
 * The profile-specific assembler that lists one system's resources in order
 * stays with the profile that owns that graph -- see ADR-0008. Only the
 * mechanics live here.
 */
export * from "./managed-resource.js";
export * from "./lifecycle.js";
export * from "./managed-runtime.js";
