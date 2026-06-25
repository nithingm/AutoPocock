# DAG-Driven GitHub Issue Synthesis and Ralph Loop Orchestration

## Problem Statement

The current operating system can take the Solo Operator from setup through approved Context, PRD generation, Issue DAG generation, isolated execution, and gated completion. But the most important planning boundary is still too weak for the next phase: the Issue DAG is not yet the authoritative control plane for execution, and the system does not yet synthesize exhaustive GitHub issues automatically from the PRD and the DAG.

That leaves a dangerous gap between planning and execution. The Solo Operator can generate local Workflow Artifacts, but still has to create or manage live tracker issues manually. More importantly, the DAG is not yet rich or authoritative enough to drive multi-layer tracer bullets, precise slice boundaries, parallel waves, and Ralph loop orchestration with high confidence.

If the product is meant to support near-autonomous “vibe coding” for a technical Solo Builder, then the planning layer must become much stronger than a flat issue decomposition. The DAG must become the central execution model, GitHub issue synthesis must become exhaustive and deterministic, and Ralph loops must be compiled directly from approved graph nodes instead of loosely derived later.

## Solution

Build the next planning-and-orchestration phase around a DAG-central control plane.

The system should let the Solo Operator move from approved planning artifacts to exhaustive GitHub-backed execution like this:

- optional guided planning through `/grill-me` or `/grill-with-docs`
- approved Context
- approved PRD
- multi-layer execution DAG
- deterministic GitHub issue and project-field synthesis from that DAG
- tracer-bullet-first wave planning across layers
- provider-neutral Loop Spec compilation from approved DAG nodes
- Ralph loop orchestration driven by graph semantics, not by ad hoc manual packaging

The DAG should become the authoritative source for:

- issue creation
- dependency structure
- write surface ownership
- conflict reasoning
- tracer-bullet gating
- wave computation
- provider eligibility
- human-gated boundaries
- loop-spec generation
- graph progression after review, QA, reclaim, and bug-loop outcomes

The result should feel like a real planning compiler for AI-assisted engineering, not just a local issue artifact generator.

## User Stories

1. As a Solo Operator, I want the PRD to compile into an exhaustive multi-layer Issue DAG, so that execution planning is complete before AFK work begins.
2. As a Solo Operator, I want the DAG to be the authoritative planning model, so that GitHub issues, Loop Specs, and execution waves all derive from one source of truth.
3. As a Solo Operator, I want optional `/grill-me` and `/grill-with-docs` planning up front, so that I can deepen context before the DAG is generated when the idea is still fuzzy.
4. As a Solo Operator, I want planning to remain skippable for advanced use, so that I can move faster when I already know the shape of the work.
5. As a Solo Operator, I want autonomy to downgrade automatically when I skip deeper planning, so that the Agent Runtime does not over-trust weak inputs.
6. As a Solo Operator, I want the DAG to represent multiple planning layers, so that large ideas can be decomposed into architecture, tracer bullets, slices, and follow-on work without flattening important structure.
7. As a Solo Operator, I want tracer bullets represented explicitly inside the DAG, so that trust in routine AFK work is earned layer by layer.
8. As a Solo Operator, I want each tracer bullet to gate deeper routine execution inside a Feature Track, so that broad plans do not trigger unsafe automation immediately.
9. As a Solo Operator, I want each DAG node to include identity, layer, goal, dependencies, acceptance criteria, verification plan, and provider eligibility, so that each node can compile into a reliable execution contract.
10. As a Solo Operator, I want each DAG node to include write surface ownership, so that safe parallelism is based on declared boundaries instead of optimistic assumptions.
11. As a Solo Operator, I want each DAG node to include conflict surface and conflict reasoning, so that execution-wave planning can explain why slices may or may not run together.
12. As a Solo Operator, I want each DAG node to include human-gate requirements, so that approval-sensitive work cannot silently enter Ralph loop execution.
13. As a Solo Operator, I want each DAG node to include confidence or ambiguity signals, so that oversized or unclear work is stopped before execution instead of discovered too late.
14. As a Solo Operator, I want the planner to detect “too broad to execute” nodes automatically, so that weakly-sliced work returns to planning instead of entering AFK chaos.
15. As a Solo Operator, I want the planner to generate execution waves from graph semantics, so that concurrency follows dependencies, write surfaces, conflict surfaces, and tracer-bullet policy.
16. As a Solo Operator, I want the planner to separate runnable waves from blocked waves, so that I can see what is actionable now versus later.
17. As a Solo Operator, I want the planner to distinguish provider-eligible nodes from HITL nodes, so that human-only work is visible and not mixed into AFK scheduling.
18. As a Solo Operator, I want the planner to synthesize live GitHub issues automatically from the DAG, so that the Operational Tracker reflects the graph without manual copy-paste.
19. As a Solo Operator, I want issue creation to be exhaustive, so that every actionable DAG node becomes a tracked execution unit in GitHub when appropriate.
20. As a Solo Operator, I want GitHub issue creation to be deterministic and idempotent, so that reruns update or reconcile instead of duplicating work.
21. As a Solo Operator, I want synthesized GitHub issues to inherit labels, execution stages, queue class, risk, dependency, conflict surface, feature track, and tracer-bullet status, so that the tracker is ready for scheduling immediately.
22. As a Solo Operator, I want each GitHub issue body to be generated from the node contract, so that the live issue preserves goal, scope, dependencies, verification expectations, and execution constraints.
23. As a Solo Operator, I want the DAG-to-GitHub sync to preserve parent-child relationships and graph references, so that I can navigate between the Artifact Layer and the Operational Tracker cleanly.
24. As a Solo Operator, I want the sync layer to support dry-run previews, so that I can inspect planned issue creation before mutating GitHub.
25. As a Solo Operator, I want the sync layer to surface tracker drift between DAG and GitHub issue state, so that I can reconcile mismatches explicitly.
26. As a Solo Operator, I want Loop Specs to compile directly from approved DAG nodes, so that execution contracts come from the authoritative planning model.
27. As a Solo Operator, I want Loop Specs to preserve tracer-bullet and layer semantics, so that deeper-wave execution remains constrained by what earlier validated slices proved.
28. As a Solo Operator, I want Ralph loops to launch from execution waves computed from the DAG, so that parallel AFK work follows the planner instead of ad hoc commands.
29. As a Solo Operator, I want Ralph loops to stop or escalate when graph boundaries are violated, so that execution cannot widen scope invisibly.
30. As a Solo Operator, I want Ralph loops to inherit explicit stop conditions, escalation rules, and retry budgets from graph-compiled Loop Specs, so that execution remains predictable.
31. As a Solo Operator, I want blocked, failed, or rejected loop outcomes to mutate graph state deterministically, so that the DAG remains the live execution truth.
32. As a Solo Operator, I want review approval, QA pass/fail, reclaim, and bug-loop outcomes to unlock or re-block dependent nodes, so that graph progression remains honest.
33. As a Solo Operator, I want follow-up bugs created during QA or execution to re-enter the graph intentionally, so that defects become first-class planning consequences.
34. As a Solo Operator, I want wave planning to support multiple layers of work simultaneously, so that architecture work, tracer bullets, and implementation slices can all be represented coherently.
35. As a Solo Operator, I want the planner to choose the smallest credible tracer bullets across layers, so that the system validates product and workflow assumptions early.
36. As a Solo Operator, I want the planning engine to support future multi-provider execution without changing DAG semantics, so that portability stays real.
37. As an Agent Runtime, I want graph-derived Loop Specs to be stable and provider-neutral, so that provider adapters only translate execution rather than reinterpret intent.
38. As an Agent Runtime, I want execution queues to come from approved graph waves, so that the planner, not the runtime, owns ordering decisions.
39. As a technical Solo Builder, I want the system to feel close to plug-and-play for a new idea, so that I can move from concept to safe autonomous execution with minimal manual tracker work.
40. As a technical Solo Builder, I want the product to keep artifact-level transparency even while it auto-creates issues and plans loops, so that “vibe coding” does not become invisible chaos.

## Implementation Decisions

- Treat the Issue DAG as the central planning compiler, not just a decomposition artifact.
- Expand the DAG schema into a layered model that can represent plan levels such as initiative, tracer bullet, implementation slice, review follow-up, and bug-loop consequence.
- Add a dedicated DAG-planning module that owns layer semantics, node validation, dependency normalization, conflict scoring, write-surface reasoning, and wave computation.
- Add a DAG-quality pass that scores ambiguity, oversize risk, missing verification detail, missing ownership boundaries, and unsafe dependency structure before execution eligibility is granted.
- Introduce explicit tracer-bullet metadata in the DAG so that routine AFK execution can be gated by validated vertical slices inside a Feature Track.
- Compile GitHub issue payloads from DAG nodes through a dedicated sync layer rather than generating ad hoc issue bodies in CLI code.
- Make DAG-to-GitHub sync dry-run-first and idempotent. Reruns should reconcile existing nodes and issue references rather than duplicating live issues.
- Persist node-to-GitHub issue mappings as durable workflow data so the graph can be recompiled, diffed, and progressed deterministically.
- Extend project-field synthesis so DAG metadata can populate queue class, execution stage, dependency, conflict surface, feature track, and dispatch identity in the Operational Tracker.
- Keep GitHub as the live Operational Tracker, but treat the DAG artifact as the source planning model that the tracker mirrors for execution state.
- Promote graph progression rules so review, QA, reclaim, bug-loop, and follow-up outcomes mutate node state and dependent eligibility directly.
- Compile Loop Specs from approved DAG nodes only. Handoffs may remain operator-facing artifacts, but they should no longer be the primary execution source when DAG-backed orchestration is active.
- Add a Ralph-loop orchestration layer that launches approved waves from DAG state, enforces concurrency limits, and respects provider eligibility plus human-gate boundaries.
- Keep orchestration provider-neutral. Provider adapters should consume graph-derived Loop Specs instead of interpreting PRDs or handoffs independently.
- Preserve the current Workflow Core as the place that owns deterministic state transitions, but deepen it so graph progression becomes richer than single-node stage flags.
- Keep the Runtime Host responsible for isolation, worktrees, process launch, logging, and cancellation; do not let DAG compilation leak OS-specific behavior.
- Preserve artifact-first visibility in the workflow console by adding graph-layer views, node quality signals, GitHub sync previews, and wave launch controls directly over the durable DAG artifact.
- Prefer deep modules with narrow interfaces for:
  - layered DAG compilation
  - DAG quality analysis
  - DAG-to-GitHub synchronization
  - graph-driven wave orchestration
  - graph progression and replay
- Treat manual GitHub issue creation for DAG nodes as an implementation gap to remove, not as an acceptable steady-state behavior.

## Testing Decisions

- A good test should verify external planning and orchestration behavior from the Solo Operator’s perspective, not internal helper structure.
- The layered DAG compiler should receive the deepest automated coverage because planning quality now determines execution safety.
- Test the DAG compiler with fixture-backed PRDs that vary in scope clarity, dependency complexity, and tracer-bullet structure.
- Test DAG quality analysis against broad, ambiguous, conflicting, and under-specified plans to verify that unsafe nodes are blocked before execution.
- Test wave generation with overlapping and non-overlapping write surfaces, mixed provider eligibility, mixed human-gate requirements, and multiple planning layers.
- Test DAG-to-GitHub synchronization in dry-run and apply modes, including idempotent reruns, tracker drift detection, and reconciliation against existing issues.
- Test node-to-issue mapping persistence so node identities survive recompilation and graph edits.
- Test Loop Spec compilation from DAG nodes to ensure execution contracts preserve graph semantics, ownership boundaries, stop conditions, and escalation rules.
- Test Ralph-loop orchestration from graph waves using provider stubs so wave launch, blocking, retry, reclaim, and progression can be validated without a live provider.
- Test graph progression behavior for review approval, QA pass/fail, reclaim, follow-up bug insertion, and dependent unlocking across multiple graph layers.
- Add integrated smoke tests that cover `approved context -> approved PRD -> DAG -> GitHub sync preview -> wave compilation -> loop launch plan`.
- Keep UI tests focused on graph inspectability, sync preview visibility, node editability, and orchestration controls rather than brittle presentational details.

## Out of Scope

- Replacing GitHub as the default Operational Tracker
- Fully autonomous execution without approval boundaries
- Provider adapters beyond what is needed to preserve provider neutrality in the planning and orchestration layers
- Generic consumer-grade onboarding for non-technical idea owners
- Hiding the DAG or generated issues behind a closed UI-only abstraction
- Unbounded parallel Ralph loops without graph-quality and write-surface safeguards
- Auto-merge or automatic approval of review, QA, reclaim, or memory updates

## Further Notes

- This initiative is the real bridge between the current operating-system foundation and the “almost autonomous vibe coding” goal for a technical Solo Builder.
- The hardest part is not runtime plumbing. It is DAG quality. If the DAG is weak, the autonomy story collapses.
- The strongest tracer bullet for this initiative is:
  approved Context -> approved PRD -> layered DAG -> GitHub issue synthesis preview -> live issue creation -> first tracer-bullet wave -> one graph-driven Ralph loop -> deterministic graph progression
- The current repo already has strong foundations in Workflow Core, Runtime Host, provider adaptation, review/QA gating, and workflow-console surfacing. This PRD should focus the next phase on planning quality and graph authority rather than more low-level execution polish.
