# Context Handoff

## Issue

- Tracker: 40
- Title: Compile provider-neutral Loop Specs from approved DAG nodes
- Labels: enhancement, ready-for-agent
- Execution stage: Ready for Handoff

## Goal

- Compile provider-neutral Loop Specs directly from approved DAG nodes so execution contracts come from graph truth instead of handoff-first packaging.

## Outcome

- The repo can derive Loop Specs from approved graph nodes with ownership, tracer-bullet, stop-condition, and escalation semantics preserved.

## Boundaries

- In scope:
  - Add a graph-to-Loop-Spec compiler module.
  - Preserve ownership boundaries, tracer-bullet semantics, stop conditions, and escalation rules.
  - Add direct tests for the compiled Loop Spec contract.
- Out of scope:
  - Actual wave launch
  - Graph progression mutation
  - GitHub sync/reconciliation logic
  - Console exposure
- Likely touched areas:
  - `scripts/lib/`
  - `tests/`
- Owned files/modules:
  - `scripts/lib/dag-loop-spec-compiler.mjs`
  - `tests/dag-loop-spec-compiler.test.mjs`

## Acceptance Criteria

- Approved graph nodes compile into provider-neutral Loop Specs without depending on manual handoff-first packaging.
- Compiled Loop Specs preserve ownership boundaries, tracer-bullet semantics, stop conditions, and escalation rules from the DAG.
- Later provider adapters can consume the compiled Loop Spec contract without reinterpreting planning intent.

## Context

- Parent issue: `#34`
- Blocked by: `#36`, `#37`
- PRD: `docs/PRDs/2026-05-14-dag-driven-github-issue-synthesis-and-ralph-orchestration.md`
- Related current contract: existing loop-spec behavior under `scripts/lib/workflow-core.mjs`

## Dependencies

- Blockers:
  - `#36` layered DAG compiler
  - `#37` quality gating
- Related issues:
  - `#41` tracer-bullet wave launch
  - `#42` graph progression mutation
- Conflict risks:
  - Medium if this slice starts changing provider adapter behavior directly.

## Implementation Guidance

- Keep this as a compiler boundary. Do not widen into actual orchestration or provider-launch logic in this slice.
- Prefer an additive graph-to-Loop-Spec module that can later replace handoff-first packaging in a controlled way.
- Assume other workers may touch surrounding workflow-core code; do not revert their edits.

## Verification

- Automated:
  - Add direct tests for compiled Loop Spec structure and preserved semantics.
  - Verify provider-neutral output independent of live provider execution.
- Manual:
  - Inspect one representative approved graph node translated into a Loop Spec.
- Evidence expected:
  - Compiled Loop Spec example
  - Test output summary

## Safe Failure Plan

- If the graph contract is still moving under `#35`/`#36`, keep the compiler narrowly compatible and report exact assumptions instead of widening into orchestration.

## Completion

- Report back:
  - Which existing handoff-first behaviors remain
  - Any Loop Spec semantics intentionally deferred
- Artifacts to update:
  - Loop Spec contract docs if needed
- PR or commit expectation:
  - Keep the change set bounded to graph-to-Loop-Spec compilation and tests
- Next suggested stage:
  - Human Review
