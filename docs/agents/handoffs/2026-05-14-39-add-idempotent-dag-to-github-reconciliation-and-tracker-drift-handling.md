# Context Handoff

## Issue

- Tracker: 39
- Title: Add idempotent DAG-to-GitHub reconciliation and tracker drift handling
- Labels: enhancement, ready-for-agent
- Execution stage: Ready for Handoff

## Goal

- Add reconciliation between the layered DAG and live GitHub issues so reruns update or diff existing tracker state instead of duplicating work.

## Outcome

- The system persists node-to-issue mappings and surfaces tracker drift explicitly, making DAG-to-GitHub sync idempotent and reviewable.

## Boundaries

- In scope:
  - Add reconciliation logic and durable node-to-issue mapping persistence.
  - Detect tracker drift between DAG expectations and live issue state.
  - Add tests for rerun behavior and duplicate prevention.
- Out of scope:
  - Initial issue synthesis logic
  - Loop Spec compilation
  - Wave launch
  - Console changes
- Likely touched areas:
  - `scripts/lib/`
  - `tests/`
- Owned files/modules:
  - `scripts/lib/dag-github-reconcile.mjs`
  - `tests/dag-github-reconcile.test.mjs`

## Acceptance Criteria

- DAG-to-GitHub sync is idempotent and does not create duplicate live issues for the same node on rerun.
- The system persists node-to-issue mappings as durable workflow state.
- Tracker drift between DAG expectations and GitHub issue state is surfaced explicitly for reconciliation.

## Context

- Parent issue: `#34`
- Blocked by: `#38`
- PRD: `docs/PRDs/2026-05-14-dag-driven-github-issue-synthesis-and-ralph-orchestration.md`

## Dependencies

- Blockers:
  - `#38` GitHub issue synthesis
- Related issues:
  - `#41` wave launch
  - `#43` console exposure
- Conflict risks:
  - Low if reconciliation stays in its own module and does not rewrite synthesis behavior.

## Implementation Guidance

- Keep reconciliation logic separate from initial issue-payload generation.
- Prefer explicit mapping artifacts over hidden naming heuristics.
- Surface drift; do not silently mutate away meaningful tracker differences.

## Verification

- Automated:
  - Add rerun and duplicate-prevention tests.
  - Verify mapping persistence and drift reporting.
- Manual:
  - Inspect one simulated rerun against existing issue references.
- Evidence expected:
  - Mapping artifact examples
  - Drift output examples
  - Test output summary

## Safe Failure Plan

- If live GitHub behavior is too volatile for a full end-to-end proof in this slice, keep reconciliation fixture-backed and report the live gap explicitly.

## Completion

- Report back:
  - Final mapping mechanism
  - Drift categories surfaced
- Artifacts to update:
  - Workflow docs only if new persistent mapping artifacts are introduced
- PR or commit expectation:
  - Keep the change set bounded to reconciliation and tests
- Next suggested stage:
  - Human Review
