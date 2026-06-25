# Issue Decomposition: DAG-Driven GitHub Issue Synthesis and Ralph Loop Orchestration

Parent issue: `#34`
Canonical PRD: `docs/PRDs/2026-05-14-dag-driven-github-issue-synthesis-and-ralph-orchestration.md`

## Proposed Slices

1. Define the layered DAG schema and authoritative node contract
2. Compile approved PRDs into the layered DAG
3. Add DAG quality scoring and execution-eligibility gating
4. Synthesize GitHub issues from DAG nodes
5. Add idempotent DAG-to-GitHub reconciliation and tracker drift handling
6. Compile provider-neutral Loop Specs from approved DAG nodes
7. Launch one tracer-bullet wave from graph semantics
8. Make execution, review, QA, reclaim, and bug-loop outcomes mutate graph progression
9. Expose graph quality, sync preview, and wave controls in the workflow console

## Dependency Shape

- `1` is the new contract foundation.
- `2` depends on `1` because the compiler must target the new layered schema.
- `3` depends on `2` because quality analysis should evaluate the compiled graph, not a half-defined model.
- `4` depends on `2` because issue synthesis should come from real DAG nodes.
- `5` depends on `4` because reconciliation and drift handling build on initial sync behavior.
- `6` depends on `2` and `3` because Loop Specs should compile only from graph nodes that are both structurally valid and execution-eligible.
- `7` depends on `3`, `5`, and `6` because a real tracer-bullet launch needs quality-gated nodes, synchronized tracker state, and graph-compiled Loop Specs.
- `8` depends on `6` and `7` because progression rules should react to real execution outcomes, not just static stage transitions.
- `9` depends on `3`, `5`, `7`, and `8` because the console should expose real graph quality, sync preview, orchestration, and progression semantics.

## Notes

- All slices are `AFK`.
- The first true tracer bullet is `7`, but it is intentionally built on thin versions of the new core contracts instead of validating the old planning model.
- This breakdown prioritizes DAG quality over runtime polish because the graph is the control plane for Ralph loop autonomy.
