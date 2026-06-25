# Context Handoff

## Issue

- Tracker: 35
- Title: Define the layered DAG schema and authoritative node contract
- Labels: enhancement, ready-for-agent
- Execution stage: Ready for Handoff

## Goal

- Define the layered Issue DAG schema that becomes the authoritative planning contract for later compiler, GitHub sync, Loop Spec compilation, and graph-driven orchestration work.

## Outcome

- The repo has one durable layered DAG contract that can represent initiative, tracer bullet, implementation slice, follow-up, and bug-loop nodes.
- The contract preserves dependency, tracer-bullet, write-surface, conflict, provider-eligibility, and human-gate semantics in one place.

## Boundaries

- In scope:
  - Add a dedicated schema/contract module for the layered DAG.
  - Define authoritative node fields and layer semantics.
  - Add focused tests for the schema and contract behavior.
  - Update minimal docs only if the contract meaning changes materially.
- Out of scope:
  - Rewriting the DAG compiler itself.
  - GitHub sync behavior.
  - Loop Spec compilation changes.
  - Workflow-console changes.
- Likely touched areas:
  - `scripts/lib/`
  - `tests/`
- Owned files/modules:
  - `scripts/lib/layered-dag-schema.mjs`
  - `tests/layered-dag-schema.test.mjs`

## Acceptance Criteria

- The layered DAG schema can represent initiative, tracer bullet, implementation slice, follow-up, and bug-loop nodes without flattening them into one generic shape.
- Each node carries the authoritative execution contract fields needed by later GitHub sync, Loop Spec compilation, and wave planning.
- The graph contract preserves tracer-bullet, dependency, write-surface, conflict, provider-eligibility, and human-gate semantics in one durable model.

## Context

- Parent issue: `#34 DAG-Driven GitHub Issue Synthesis and Ralph Loop Orchestration`
- PRD: `docs/PRDs/2026-05-14-dag-driven-github-issue-synthesis-and-ralph-orchestration.md`
- Issue decomposition: `issues/2026-05-14-dag-driven-github-issue-synthesis-and-ralph-orchestration-issues.md`
- Workflow contract: `docs/agents/workflow.md`
- Domain terms:
  - Solo Operator
  - Workflow Artifact
  - Operational Tracker
  - Tracer Bullet
  - Feature Track
  - Context Handoff

## Dependencies

- Blockers: none
- Related issues:
  - `#36` compiler
  - `#37` quality gating
  - `#38` GitHub synthesis
  - `#40` Loop Spec compilation
- Conflict risks:
  - Medium, because downstream slices depend on the contract shape.

## Implementation Guidance

- Keep the interface deep and narrow: one authoritative schema module is better than leaking shape assumptions across the CLI.
- Prefer additive, testable schema helpers over giant inline object literals in command code.
- Do not rewrite unrelated workflow behavior while defining the contract.

## Verification

- Automated:
  - Add direct tests for layer representation and authoritative node fields.
  - Verify the schema preserves the required planning and execution semantics.
- Manual:
  - Confirm the contract is readable enough for downstream compiler and sync slices to consume.
- Evidence expected:
  - Changed module paths
  - Test output summary

## Safe Failure Plan

- If the schema starts expanding into compiler or sync behavior, stop and keep the slice at the contract boundary.
- If a field is speculative and not required by downstream acceptance criteria, leave it out rather than guessing.

## Completion

- Report back:
  - Final contract shape
  - Any unresolved schema ambiguity
- Artifacts to update:
  - This handoff if scope changes
- PR or commit expectation:
  - Keep the change set bounded to schema plus tests
- Next suggested stage:
  - Human Review
