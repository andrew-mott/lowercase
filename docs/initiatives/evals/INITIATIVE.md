# Evals Rework

## Summary

A real data-model rearchitecture, not a UI tab — deserves its own initiative the same way the original eval vertical slice did (Initiative I9, see [`eval-milestone.md`](./eval-milestone.md)). Current state: evals are embedded inside the flow definition itself (an eval is just a flow with a judge step) — a smaller move than originally wanted. The actual goal: evals as standalone, reusable entities, decoupled from any one flow — a fixed template (System Prompt + Question + Context + Answer) that can be constructed and run against different flows.

User's own framing for why this matters, not a bolt-on: "the premise behind my project is a workflow engine that allowed you to run experiments and measure results" — evals are core to the project's thesis. Wanted built hopefully within the same demo window as the UI rework (see memory `project_job_interview_demo_deadline`), but as independent work — see memory `project_post_ui_rework_priorities` for the fuller sequencing framing (run params next after the UI rework, evals important but on its own track).

Scaffolded now, work not yet started — this directory exists so the `docs/initiatives/` pattern has a second real example, per the [`ui-workspace`](../ui-workspace/INITIATIVE.md) initiative's own Change C36.

## Not yet scoped

- **Move eval context out of the flow definition entirely, into its own specialized artifact type**, with template-variable references pointing at a specific flow definition — decoupled, not embedded. Concrete architecture direction volunteered by the user, not yet designed further.
- **`ArtifactComposition` / `ComposedArtifact`** — one proposal floated for the eval-binding problem: a more primitive object, `ArtifactComposition` (itself an artifact, but one with template references to other artifacts plus arbitrary text) that composes into a single output artifact, `ComposedArtifact`. The core idea: map several artifacts into one output — exactly the shape needed to bind a run's outputs into an eval flow's expected inputs. Not eval-specific — the same primitive could be used by any flow, reusing the existing artifact/templating system rather than inventing something new. One open question: the templating language itself may need to diverge from what the rest of this system already uses. `ComposedArtifact`s would likely be created lazily at runtime, materialized right before a run is submitted.
- **Inside the UI workspace**, an Evals mode/tab would let you construct an eval run (bind a flow's actual output to the eval template's expected inputs) — results visualization might need its own separate page if it doesn't fit inside that tab. Not scoped further; needs its own dedicated design pass.
