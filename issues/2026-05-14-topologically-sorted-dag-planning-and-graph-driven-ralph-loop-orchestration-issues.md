# Issue Decomposition: Topologically Sorted DAG Planning and Graph-Driven Ralph Loop Orchestration

Parent issue: `#44`
Canonical PRD: `docs/PRDs/2026-05-14-topologically-sorted-dag-planning-and-graph-driven-ralph-loop-orchestration.md`

## Proposed Slices

1. `#45` Add PRD Tightness Validation Before DAG Compilation
2. `#46` Regenerate DAGs With Diffing, Edit Preservation, and Provenance
3. `#47` Make the DAG the Topologically Sorted Execution Authority
4. `#48` Add Wave Planning With Write-Surface and Conflict-Safe Parallelism
5. `#49` Compile Explicit Ralph Loop Specs From Approved DAG Nodes
6. `#50` Add Wave-Bundle Approval for Graph-Driven Execution
7. `#51` Add Preflight Feasibility Validation and Dynamic Wave Splitting
8. `#52` Enforce Evidence-Based Completion, Multidimensional Testing, and Validation-Failed Progression
9. `#53` Auto-Insert Bug-Loop Repair Issues With Escalation Caps
10. `#54` Add Branch-Local Pause and Shared-Foundation Full-Run Freeze Rules
11. `#55` Orchestrate Multi-Stage Single Runs From Connected Wave Bundles

## Dependency Shape

- `#45` is the entry gate for safe graph compilation.
- `#46` depends on `#45` because DAG regeneration quality depends on a validated upstream PRD contract.
- `#47` depends on `#45` because the DAG should not become the execution authority until source-plan validation exists.
- `#48` depends on `#47` because wave planning needs the graph to be the authoritative topological execution model first.
- `#49` depends on `#47` and `#48` because Loop Specs should compile from execution-authoritative nodes and wave-aware graph semantics.
- `#50` depends on `#49` because wave-bundle approval should package real compiled Loop Specs rather than placeholders.
- `#51` depends on `#49` and `#50` because preflight feasibility validation should run against approved wave bundles backed by real Loop Specs.
- `#52` depends on `#49` because completion and validation progression should attach to explicit node-level execution contracts.
- `#53` depends on `#51` and `#52` because automatic repair insertion should happen only after the system can distinguish feasibility failure, execution success, and validation failure.
- `#54` depends on `#53` because branch-local pause versus full-run freeze needs real repair and escalation behavior to react to.
- `#55` depends on `#50`, `#51`, `#52`, `#53`, and `#54` because multi-stage single-run orchestration should compose approved wave bundles, feasibility logic, completion logic, repair insertion, and pause/freeze rules.

## Notes

- All slices are `AFK`.
- The core execution spine is `#45 -> #47 -> #48 -> #49 -> #50 -> #51 -> #53 -> #54 -> #55`.
- `#52` runs in parallel with the approval and preflight path after `#49`, then rejoins the main line at automatic repair insertion.
- The first true tracer bullet is `#49` plus `#50`: once explicit Loop Specs and wave-bundle approval exist, later slices can validate the real graph-driven execution model rather than a planning-only abstraction.
