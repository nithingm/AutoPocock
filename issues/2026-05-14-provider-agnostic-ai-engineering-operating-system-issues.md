# Issue Decomposition

Source PRD: 2026-05-14-provider-agnostic-ai-engineering-operating-system.md

Status: Approved by Solo Operator

## Decomposition Rules

- Keep each issue independently testable.
- Keep architecture decisions upstream of implementation.
- Split by vertical slice, not by technical layer.
- Prefer AFK slices when decisions are already captured in `CONTEXT.md`.
- Create follow-up bugs instead of silently expanding scope.

## Parallelization Model

- Issue 1 is the Feature Track tracer bullet and proves the product center end to end.
- Issues 2, 3, and 6 can proceed after Issue 1 because they establish the Setup Plane, Context Plane, and Workflow Core in parallel.
- Issue 4 depends on Issue 3 because PRD generation must consume approved shared context.
- Issue 5 depends on Issue 4 because Issue DAG planning must consume an approved PRD shape.
- Issue 7 depends on Issue 6 because the Codex adapter must implement the shared provider contract.
- Issue 8 depends on Issues 2, 6, and 7 because isolated Ralph loop execution needs the runtime host, workflow core, and a real provider adapter.
- Issue 9 depends on Issues 5, 6, and 8 because review, QA, reclaim, and DAG progression must consume approved planning artifacts and real execution results.
- Issue 10 depends on Issues 2, 3, 5, 8, and 9 because the workflow console should sit on top of stable setup, context, planning, execution, and review contracts.

## Kanban Defaults

- Category label: `enhancement`
- State label: `ready-for-agent`
- Execution Stage: `Ready for Handoff`
- Execution Lane: `Handoff`
- Feature Track: `provider-agnostic-ai-engineering-operating-system`
- Dependency: `unblocked` when Blocked by is `None - can start immediately`; otherwise `blocked`

## Issue 1: Prove the end-to-end operating-system tracer bullet

### Type

AFK

### Queue

- Queue class: tracer-bullet
- Risk: medium
- Conflict surface: medium
- Blocked by: None - can start immediately
- User stories covered: 1, 3, 8, 10, 15, 17, 24, 25, 29, 32, 35, 38

### What to build

Prove one thin end-to-end path through the product: setup readiness, approved shared context, PRD generation, dependency-safe DAG output, one provider-neutral Loop Spec, one Codex-backed isolated run, and one gated completion decision. This slice should establish the smallest real operating-system flow that demonstrates the product is more than a manual script bundle.

### Acceptance criteria

- [ ] The system can materialize one demo project path from setup through gated completion using durable artifacts at every step.
- [ ] The slice generates and preserves approved Context, PRD, Issue DAG, Loop Spec, Provider Run, and Completion artifacts.
- [ ] One Codex-backed run can execute inside the approved boundaries and return a durable completion result.
- [ ] Review and approval gates are explicit in the demonstrated path and block progression when not satisfied.
- [ ] The tracer bullet can be exercised without introducing provider-specific assumptions into the durable artifact model.

### Blocked by

None - can start immediately

## Issue 2: Make setup plane operational across Windows and Linux

### Type

AFK

### Queue

- Queue class: routine-afk
- Risk: medium
- Conflict surface: medium
- Blocked by: Issue 1
- User stories covered: 1, 2, 3, 20, 21, 34

### What to build

Build the Setup Plane so a new or existing repo can become operational through one cross-platform flow that detects OS, provider readiness, GitHub readiness, runtime prerequisites, and local configuration status. Keep setup dry-run-first where safe and ensure Windows and Linux differences are handled through explicit runtime abstractions instead of leaking into workflow contracts.

### Acceptance criteria

- [ ] Setup reports OS, shell, provider readiness, GitHub readiness, and required local runtime prerequisites in one operator-visible flow.
- [ ] The setup path works on both Windows and Linux through shared orchestration contracts.
- [ ] Setup mutations remain explicit, inspectable, and dry-run-first where possible.
- [ ] Path handling, command planning, and environment preparation are centralized rather than duplicated across workflow commands.
- [ ] Cross-platform smoke coverage exists for setup readiness and failure reporting.

### Blocked by

Issue 1

## Issue 3: Turn grilling sessions into approved shared context artifacts

### Type

AFK

### Queue

- Queue class: routine-afk
- Risk: medium
- Conflict surface: low
- Blocked by: Issue 1
- User stories covered: 4, 5, 6, 7, 25, 26, 32

### What to build

Build the Context Plane so guided grilling sessions produce durable shared context artifacts instead of throwaway transcripts. The flow should interrogate assumptions, capture domain language and unknowns, update shared context artifacts, and require explicit Solo Operator approval before planning may continue.

### Acceptance criteria

- [ ] Guided context formation produces durable context artifacts rather than transient chat-only output.
- [ ] The flow captures domain language, assumptions, unknowns, and follow-up decision points in artifact form.
- [ ] The Solo Operator can review and edit generated context before approval.
- [ ] Planning commands refuse to proceed from unapproved context.
- [ ] The artifact flow preserves transparency between UI or prompt surfaces and repo-backed source files.

### Blocked by

Issue 1

## Issue 4: Generate editable PRDs from approved context

### Type

AFK

### Queue

- Queue class: routine-afk
- Risk: low
- Conflict surface: low
- Blocked by: Issue 3
- User stories covered: 8, 9, 25, 26

### What to build

Generate PRDs from approved shared context so planning starts from durable understanding instead of blank templates. The produced PRD should remain directly editable in the Artifact Layer and preserve an explicit approval step before downstream issue planning.

### Acceptance criteria

- [ ] PRD generation consumes approved context artifacts as its required input.
- [ ] Generated PRDs are durable repo artifacts that the Solo Operator can edit directly.
- [ ] The PRD flow preserves approval state so downstream planning can distinguish draft from approved requirements.
- [ ] The generated PRD shape is rich enough to drive later Issue DAG planning without ad hoc prompt reconstruction.
- [ ] Regression coverage exists for context-to-PRD generation behavior.

### Blocked by

Issue 3

## Issue 5: Plan dependency-safe Issue DAGs with write surfaces and waves

### Type

AFK

### Queue

- Queue class: routine-afk
- Risk: high
- Conflict surface: medium
- Blocked by: Issue 4
- User stories covered: 10, 11, 12, 13, 14, 27, 37

### What to build

Evolve issue decomposition into execution-graph planning that produces a dependency-safe Issue DAG with node metadata, write surfaces, conflict reasoning, human-gate flags, and runnable execution waves. The output should let the Solo Operator inspect graph structure and concurrency boundaries before dispatch.

### Acceptance criteria

- [ ] Planning produces a graph-shaped artifact rather than only a flat issue list.
- [ ] Each node records goal, dependencies, acceptance criteria, verification plan, write surface, risk, conflict surface, and provider eligibility.
- [ ] The planner distinguishes provider-eligible slices from human-gated slices.
- [ ] Runnable waves are computed from dependency state and write-surface conflict reasoning.
- [ ] The Solo Operator can inspect graph structure and wave boundaries before any execution begins.

### Blocked by

Issue 4

## Issue 6: Define the provider-neutral workflow core and loop spec contract

### Type

AFK

### Queue

- Queue class: routine-afk
- Risk: high
- Conflict surface: medium
- Blocked by: Issue 1
- User stories covered: 15, 16, 19, 22, 23, 24, 30, 33, 35

### What to build

Define the Workflow Core and provider-neutral Loop Spec contract that own artifact schemas, workflow transitions, review and QA gates, reclaim behavior, completion rules, and the common execution contract used by all providers. This slice should make Codex the first adapter, not the center of the architecture.

### Acceptance criteria

- [ ] The Workflow Core owns deterministic workflow state transitions and durable artifact schemas independent of provider launch logic.
- [ ] A stable provider contract exists for availability, capability reporting, launch, resume, cancel, status lookup, artifact collection, and prompt-bundle rendering.
- [ ] Loop Specs are provider-neutral and encode goal, owned surface, acceptance criteria, verification commands, forbidden actions, escalation rules, retry budget, and stop conditions.
- [ ] Reclaim, completion, and progression rules live in the Workflow Core rather than in provider-specific code.
- [ ] Tests cover core contract behavior without requiring a live provider.

### Blocked by

Issue 1

## Issue 7: Add the Codex provider adapter on the shared execution contract

### Type

AFK

### Queue

- Queue class: routine-afk
- Risk: medium
- Conflict surface: low
- Blocked by: Issue 6
- User stories covered: 17, 18, 19, 24, 28, 33

### What to build

Implement the first real provider adapter as `CodexProvider`, using the shared provider contract to launch, monitor, and collect results from Codex-backed runs without leaking Codex-specific assumptions into the durable workflow model.

### Acceptance criteria

- [ ] The Codex adapter implements the shared provider contract without changing Workflow Core semantics.
- [ ] The adapter can report availability and readiness before launch.
- [ ] The adapter can render a provider-specific launch bundle from a provider-neutral Loop Spec.
- [ ] Provider run results can be collected and stored without polluting product-level artifacts with Codex-specific workflow rules.
- [ ] Adapter behavior is covered by fixture-backed tests or mocked execution flows.

### Blocked by

Issue 6

## Issue 8: Run isolated Ralph loops through the runtime host

### Type

AFK

### Queue

- Queue class: routine-afk
- Risk: high
- Conflict surface: medium
- Blocked by: Issues 2, 6, and 7
- User stories covered: 20, 21, 22, 23, 24, 28, 36

### What to build

Build the Execution Plane runtime path that launches isolated Ralph loops through the Runtime Host using approved Loop Specs and the Codex adapter. The runtime should manage process spawning, isolation mode, logs, cancellation, escalation, and durable Provider Run metadata without letting shell differences leak into the workflow model.

### Acceptance criteria

- [ ] Ralph loops can be launched from approved Loop Specs through the Runtime Host and Codex adapter.
- [ ] Runtime execution records isolation mode, run metadata, logs, and completion status as durable artifacts or runtime state.
- [ ] Stop conditions and escalation conditions are enforced during execution rather than treated as advisory text.
- [ ] The runtime can cancel or fail runs cleanly without corrupting workflow state.
- [ ] Cross-platform integration coverage exists for runtime launch planning and one no-op or fixture-backed execution path.

### Blocked by

Issues 2, 6, and 7

## Issue 9: Enforce review, QA, reclaim, and DAG progression gates

### Type

AFK

### Queue

- Queue class: routine-afk
- Risk: high
- Conflict surface: medium
- Blocked by: Issues 5, 6, and 8
- User stories covered: 24, 25, 29, 30, 31, 36

### What to build

Build the Review Plane so execution results must pass explicit review, QA, reclaim, and graph-progression rules before a slice counts as complete. The system should support approval, rejection, reopen, reclaim, and follow-up bug creation without hiding those decisions inside provider behavior.

### Acceptance criteria

- [ ] Completion artifacts feed explicit review and QA gates before DAG nodes may close.
- [ ] Rejected or failed work can reopen, reclaim, or produce follow-up bug artifacts through deterministic workflow rules.
- [ ] Approved completions unlock dependent graph nodes only when progression rules are satisfied.
- [ ] The Solo Operator retains explicit authority over approvals at every important boundary.
- [ ] Tests cover gate behavior, rejection handling, and dependency progression semantics.

### Blocked by

Issues 5, 6, and 8

## Issue 10: Ship the workflow console with artifact-first setup, graph, execution, and review views

### Type

AFK

### Queue

- Queue class: routine-afk
- Risk: medium
- Conflict surface: medium
- Blocked by: Issues 2, 3, 5, 8, and 9
- User stories covered: 26, 27, 28, 29, 38

### What to build

Ship the workflow console UI that exposes the Setup, Context, PRD, Graph, Execution, and Review planes while keeping artifacts directly inspectable and editable. The UI should operate as a workflow console over stable contracts, not as a replacement for the Artifact Layer.

### Acceptance criteria

- [ ] The UI exposes setup readiness, context artifacts, PRDs, graph structure, execution status, and review state in distinct workflow views.
- [ ] The Solo Operator can inspect and edit underlying artifacts directly from the product surface.
- [ ] Graph views highlight dependencies, wave structure, and conflict surfaces before execution.
- [ ] Execution views show provider assignment, isolation mode, run status, and logs.
- [ ] Review views expose completion, QA, reclaim, and approval controls without becoming the only source of truth.

### Blocked by

Issues 2, 3, 5, 8, and 9
