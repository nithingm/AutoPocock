# Context Handoff

## Issue

- Tracker: 38
- Title: Synthesize GitHub issues from DAG nodes
- Labels: enhancement, ready-for-agent
- Execution stage: Ready for Handoff

## Goal

- Synthesize live GitHub issue payloads and project metadata directly from DAG nodes so the Operational Tracker reflects graph truth without manual copy-paste.

## Outcome

- The repo has a dry-run-first DAG-to-GitHub synthesis path that can render deterministic issue payloads, labels, and project-field values from node contracts.

## Boundaries

- In scope:
  - Add a DAG-to-GitHub synthesis module.
  - Produce deterministic issue bodies and project-field payloads from DAG nodes.
  - Add dry-run coverage and tests.
- Out of scope:
  - Idempotent reconciliation of existing issues
  - Loop Spec compilation
  - Wave execution
  - Console exposure
- Likely touched areas:
  - `scripts/lib/`
  - `scripts/ops.mjs`
  - `tests/`
- Owned files/modules:
  - `scripts/lib/dag-github-sync.mjs`
  - `tests/dag-github-sync.test.mjs`

## Acceptance Criteria

- DAG nodes can compile into deterministic GitHub issue payloads with goal, scope, dependency, verification, and execution metadata.
- The sync layer can preview issue creation before mutating GitHub.
- Synthesized issues inherit the labels and project-field values needed for later scheduling and dispatch.

## Context

- Parent issue: `#34`
- Blocked by: `#36`
- PRD: `docs/PRDs/2026-05-14-dag-driven-github-issue-synthesis-and-ralph-orchestration.md`
- Operational Tracker contract: `docs/agents/issue-tracker.md`
- Workflow contract: `docs/agents/workflow.md`

## Dependencies

- Blockers:
  - `#36` layered DAG compiler
- Related issues:
  - `#39` reconciliation
  - `#41` wave launch
- Conflict risks:
  - Medium if this slice starts mutating tracker state beyond dry-run-safe synthesis.

## Implementation Guidance

- Keep synthesis separate from reconciliation. This slice should create deterministic payloads first.
- Prefer dry-run-first rendering and explicit apply boundaries.
- Do not bake current label or project assumptions into the DAG contract itself.

## Verification

- Automated:
  - Add tests for issue-body rendering and project-field synthesis.
  - Verify dry-run output is deterministic.
- Manual:
  - Inspect one representative DAG node to issue payload translation.
- Evidence expected:
  - Sample payload structure
  - Test output summary

## Safe Failure Plan

- If the live GitHub mutation path is too risky for this slice, keep the output as a dry-run preview contract and report the remaining apply gap explicitly.

## Completion

- Report back:
  - Whether synthesis remains dry-run only or includes apply behavior
  - Any tracker-field assumptions deferred
- Artifacts to update:
  - Workflow docs only if the command surface changes
- PR or commit expectation:
  - Keep the change set bounded to synthesis and tests
- Next suggested stage:
  - Human Review
