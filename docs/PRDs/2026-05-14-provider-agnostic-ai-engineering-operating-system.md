# Provider Agnostic AI Engineering Operating System

## Problem Statement

The Solo Operator has a credible manual operating system for AI-assisted engineering, but the current product shape is still too close to a scaffold. It does not yet present one coherent system that takes a project from initialization through shared context, PRD approval, dependency-safe issue planning, isolated execution, and gated completion across one or more AI providers.

Without that coherence, the workflow risks splitting into disconnected scripts, provider-specific assumptions, and unsafe execution behavior. The Solo Operator needs a real operating system that preserves artifact-level transparency, keeps product intent and approvals human-owned, and lets an Agent Runtime execute bounded work without introducing chaos.

## Solution

Build AutoPocock into a cross-platform, provider-agnostic AI engineering operating system with a strong human-in-the-loop planning front end and a controlled execution runtime.

The product should feel like one system with five explicit planes:

- Setup Plane: make a blank repo operational.
- Context Plane: turn fuzzy human intent into approved shared context.
- Planning Plane: turn approved context into a PRD and a dependency-safe Issue DAG.
- Execution Plane: run isolated Ralph loops against approved slices through provider adapters.
- Review Plane: enforce review, QA, reclaim, and completion rules before graph progression.

The durable artifact model should stay first-class throughout: Project, Context, PRD, Issue DAG, Slice, Handoff, Review Gate, QA Gate, Loop Spec, Provider Run, Approval, Reclaim, and Completion all remain visible and editable in the Artifact Layer. GitHub remains the default Operational Tracker for live issue state, while workflow truth is deliberately split across tracker state, repo artifacts, and runtime metadata.

## User Stories

1. As a Solo Operator, I want to initialize a new or existing repo through one setup flow, so that I can make the project operational without reverse-engineering prerequisites.
2. As a Solo Operator, I want setup to detect OS, provider readiness, GitHub readiness, and runtime prerequisites, so that failures are explicit before workflow execution begins.
3. As a Solo Operator, I want setup to remain dry-run-first where possible, so that I can inspect configuration and tracker impact before mutation.
4. As a Solo Operator, I want fuzzy intent turned into durable shared context through guided AI interviews, so that later planning work starts from explicit understanding rather than memory.
5. As a Solo Operator, I want `/grill-me` and `/grill-with-docs` to update shared artifacts instead of producing throwaway chat, so that important decisions survive the session.
6. As a Solo Operator, I want the system to capture domain language and unknowns during context formation, so that later slices do not drift from the product model.
7. As a Solo Operator, I want an approval gate before planning begins, so that unapproved context cannot quietly become execution scope.
8. As a Solo Operator, I want PRDs generated from approved context, so that planning starts from durable shared understanding instead of blank templates.
9. As a Solo Operator, I want to edit generated PRDs before they become planning inputs, so that the system remains artifact-driven instead of prompt-driven.
10. As a Solo Operator, I want issue decomposition to produce a dependency-safe Issue DAG rather than a flat checklist, so that execution order and parallelism are explicit.
11. As a Solo Operator, I want each DAG node to carry goal, dependencies, acceptance criteria, verification plan, risk, and provider eligibility, so that execution decisions are inspectable.
12. As a Solo Operator, I want each node to include a write surface, so that safe parallelism is constrained by ownership rather than optimism.
13. As a Solo Operator, I want the planner to identify runnable waves automatically, so that I can see what can proceed now without manually scanning the entire graph.
14. As a Solo Operator, I want human-gated slices separated from provider-eligible slices, so that approval-dependent work does not silently enter AFK execution.
15. As a Solo Operator, I want loop specs generated from approved DAG nodes, so that execution contracts are consistent and auditable.
16. As a Solo Operator, I want loop specs to be provider-neutral, so that the workflow core does not become Codex-locked.
17. As a Solo Operator, I want Codex to be the first supported provider, so that the product can ship with one strong real executor.
18. As a future operator, I want Claude Code or other providers to plug into the same loop contract later, so that provider portability remains real rather than aspirational.
19. As an Agent Runtime, I want a stable provider adapter contract, so that workflow core logic can launch, resume, cancel, and inspect runs without knowing provider-specific details.
20. As a Solo Operator, I want the runtime host to isolate OS-specific spawning, path normalization, worktrees, and logging, so that Windows and Linux behavior stays consistent.
21. As a Solo Operator, I want work to run in isolated contexts, so that multiple active slices do not step on each other.
22. As a Solo Operator, I want Ralph loops to stop when boundaries are exceeded or ambiguity becomes too high, so that AFK execution fails safely instead of widening scope.
23. As a Solo Operator, I want escalation conditions encoded in loop specs, so that provider runs know when to return control instead of improvising.
24. As a Solo Operator, I want provider runs to produce durable completion artifacts, so that graph progression depends on evidence rather than chat transcripts.
25. As a Solo Operator, I want every important boundary to require approval, so that product intent, completion, QA, reclaim, and merge remain human-owned.
26. As a Solo Operator, I want to inspect and edit workflow artifacts directly in the UI, so that the interface never traps the source of truth inside itself.
27. As a Solo Operator, I want a graph view that highlights dependencies, conflict surfaces, and execution waves, so that I can reason about concurrency before dispatch.
28. As a Solo Operator, I want an execution console that shows provider assignment, isolation mode, status, and logs, so that AFK work remains observable.
29. As a Solo Operator, I want review and QA gates modeled explicitly, so that a slice is not considered done just because code exists.
30. As a Solo Operator, I want rejected completions to reopen or reclaim work cleanly, so that graph progression remains reversible and honest.
31. As a Solo Operator, I want follow-up bug creation to be part of the workflow, so that failed QA or rejected work produces tracked consequences instead of side conversations.
32. As a Solo Operator, I want the system to preserve GitHub as the live Operational Tracker and repo artifacts as the rich Artifact Layer, so that state and context each live in the right place.
33. As a Solo Operator, I want provider run metadata stored separately from durable artifacts, so that provider-specific details do not pollute product-level workflow truth.
34. As a Solo Operator, I want the product to be cross-platform from the start, so that Windows support is real and Linux support is not a future rewrite.
35. As a Solo Operator, I want the workflow core to be deterministic and testable without a live provider, so that planning, gating, and graph behavior can be trusted independently.
36. As a Solo Operator, I want the first version to support launching one slice or one whole wave, so that concurrency can be adopted gradually instead of all at once.
37. As a Solo Operator, I want conflict scoring and write-surface overlap to shape wave generation, so that safe concurrency is designed rather than accidental.
38. As a Solo Operator, I want the product to look and feel like a real operating system for AI-assisted engineering, so that users experience one coherent workflow rather than a bag of scripts.

## Implementation Decisions

- Treat the product as five planes with stable boundaries: Setup, Context, Planning, Execution, and Review.
- Keep the current repo vocabulary where it fits and introduce new first-class concepts explicitly: Project, Context, PRD, Issue DAG, Slice, Handoff, Review Gate, QA Gate, Loop Spec, Provider Run, Approval, Reclaim, and Completion.
- Build a provider-neutral Workflow Core that owns artifact schemas, workflow state transitions, DAG semantics, review gates, QA gates, completion rules, and loop-spec schema.
- Keep the Workflow Core deterministic, OS-neutral, and independent from provider launch details.
- Add a Provider Adapter layer behind a single `AgentProvider` contract. The initial interface should cover availability, capability reporting, launch, resume, cancel, status lookup, artifact collection, and prompt-bundle rendering.
- Implement `CodexProvider` first, but require all durable workflow contracts to remain provider-agnostic.
- Reserve future adapters for Claude Code and additional providers without changing Loop Spec semantics.
- Add a Runtime Host layer that owns process spawning, shell abstraction, path normalization, worktree management, temporary bundle writing, stdout/stderr capture, cancellation, and per-run metadata.
- Centralize Windows/Linux behavior in the Runtime Host instead of letting shell assumptions leak into workflow contracts.
- Prefer Node-based orchestration over shell-heavy orchestration for cross-platform reliability.
- Split persistence deliberately:
  GitHub for live issue state, labels, project fields, and queue state.
  Repo artifacts for context, PRDs, issue decomposition, handoffs, review prep, QA, feedback, loop specs, and completion artifacts.
  Runtime metadata for provider run IDs, host-local status, run logs, and resumable execution state.
- Evolve issue decomposition into execution-graph planning. Each node should carry identity, type, goal, dependencies, acceptance criteria, verification plan, write surface, risk, conflict surface, parallelizability, provider eligibility, and human-gate requirements.
- Treat write-surface reasoning as a first-class planner output so the system can group non-overlapping nodes into safe waves.
- Compute execution waves from the DAG using dependency state, conflict overlap, provider eligibility, and human-gate status.
- Generate provider-neutral Loop Specs from approved nodes. Each Loop Spec should include issue identity, goal, owned surface, required context artifacts, acceptance criteria, verification commands, forbidden actions, escalation rules, retry budget, completion target, and stop conditions.
- Encode reclaim and graph progression rules in the Workflow Core instead of letting each provider invent its own completion semantics.
- Keep GitHub as the default Operational Tracker and preserve the Artifact Layer principle already established in this repo.
- Build a workflow-console UI that surfaces artifacts directly and provides Setup, Context, PRD, Graph, Execution, and Review views.
- Defer UI-heavy implementation details until core schemas, workflow contracts, provider contracts, and runtime boundaries are stable.
- Use a staged build order:
  provider-neutral Workflow Core and Runtime Host first,
  Codex adapter second,
  setup automation third,
  context formation fourth,
  DAG planner fifth,
  Ralph loop generator sixth,
  UI shell seventh,
  additional providers last.
- Treat the earlier GitHub-backed manual operating system as a foundation, not the final product boundary. This PRD expands that foundation into the full provider-agnostic operating system.

## Testing Decisions

- A good test should verify externally observable workflow behavior and artifact contracts, not internal helper structure.
- The Workflow Core should receive the deepest automated coverage because determinism there is what makes planning, reclaim, and graph progression trustworthy.
- Test modules should include the artifact schema layer, workflow state machine, DAG planner, wave generator, review gate rules, QA gate rules, completion progression rules, provider adapter contract, and runtime host abstractions.
- Provider tests should separate adapter-planning behavior from real provider execution. Most adapter tests should run from fixtures and mocked provider responses.
- Runtime Host tests should verify path normalization, quoting, worktree preparation, process launch planning, cancellation, and log capture on both Windows and Linux.
- Add fixture-backed tests for Loop Spec rendering so the same approved node can be translated cleanly into provider-specific launch bundles.
- Add cross-platform integration smoke tests for setup, runtime launch planning, and at least one end-to-end no-op execution flow.
- Add DAG-planning tests that verify dependency-safe wave generation, human-gated node exclusion, and write-surface conflict handling.
- Add reclaim and completion tests that verify node closure, dependent unlocking, rejection handling, and follow-up bug creation.
- Keep UI tests focused on artifact visibility, editability, graph rendering, and boundary actions rather than brittle presentation details.
- Reuse the repo’s existing CLI and workflow test style where it fits, but refactor core logic into deeper modules so behavior can be tested in isolation from shell entrypoints.

## Out of Scope

- Making the first version provider-hosted only or cloud-mandatory
- Baking Codex-specific assumptions into durable artifacts or workflow state
- Building provider adapters beyond Codex in the first delivery phase
- High-concurrency execution before worktree isolation, reclaim rules, and graph gating are proven
- Automatic merge authority or unattended approval of completion, QA, memory, or reclaim decisions
- Hiding workflow truth inside the UI instead of preserving direct artifact access
- Treating shell scripts as the long-term architecture for cross-platform runtime concerns
- Replacing GitHub as the default Operational Tracker in the near term

## Further Notes

- The strongest tracer bullet for this PRD is not a generic UI shell. It is a thin but end-to-end vertical slice that proves one project can move through setup, approved context, PRD generation, DAG generation, one provider-neutral Loop Spec, one Codex-backed isolated run, and one gated completion decision.
- The deepest modules to stabilize first are:
  Workflow Core,
  DAG planner,
  Provider Adapter contract,
  Runtime Host,
  persistence boundaries between Operational Tracker, Artifact Layer, and runtime metadata.
- This PRD should become the canonical product brief for the next planning pass. Earlier PRDs remain useful as supporting artifacts for the manual GitHub-backed foundation, but this document defines the broader operating-system product center.
