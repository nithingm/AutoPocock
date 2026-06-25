# Context Handoff

## Issue

- Tracker: 36
- Title: Compile approved PRDs into the layered DAG
- Labels: enhancement, ready-for-agent
- Execution stage: Ready for Handoff

## Goal

- Compile approved PRDs into the new layered DAG format so planning output becomes a durable multi-layer execution graph instead of a flat decomposition.

## Outcome

- `pnpm ops issues` or its underlying compiler emits layered DAG artifacts with stable node identities, layer assignments, dependency edges, and tracer-bullet structure.

## Boundaries

- In scope:
  - Add the layered DAG compiler module.
  - Route PRD-to-DAG generation through the new compiler.
  - Add tests for stable identities, dependencies, layers, and tracer-bullet structure.
- Out of scope:
  - DAG quality scoring
  - GitHub sync
  - Loop Spec compilation
  - Execution orchestration
- Likely touched areas:
  - `scripts/issues.mjs`
  - `scripts/lib/`
  - `tests/`
- Owned files/modules:
  - `scripts/lib/layered-dag-compiler.mjs`
  - `tests/layered-dag-compiler.test.mjs`
  - `scripts/issues.mjs`

## Acceptance Criteria

- Approved PRDs compile into the layered DAG schema rather than the current flat issue list shape.
- The compiler produces stable node identities, dependency edges, layer assignments, and tracer-bullet structure from the same PRD input.
- The generated DAG remains a durable Workflow Artifact that later quality analysis, GitHub sync, and orchestration can consume directly.

## Context

- Parent issue: `#34`
- Blocked by: `#35`
- PRD: `docs/PRDs/2026-05-14-dag-driven-github-issue-synthesis-and-ralph-orchestration.md`
- Related contract slice: `#35`

## Dependencies

- Blockers:
  - `#35` layered DAG schema
- Related issues:
  - `#37`, `#38`, `#40`
- Conflict risks:
  - Medium, because this slice changes current DAG generation.

## Implementation Guidance

- Assume other workers may add new schema helpers in parallel; do not revert their work.
- Prefer a dedicated compiler module over embedding layered logic directly into `scripts/issues.mjs`.
- Preserve current artifact-writing behavior where possible while swapping the graph model underneath.

## Verification

- Automated:
  - Add compiler tests for deterministic node identities and layer structure.
  - Verify emitted artifacts are consumable JSON/markdown Workflow Artifacts.
- Manual:
  - Run the compiler on a representative PRD and inspect the resulting layered DAG.
- Evidence expected:
  - Sample emitted node structure
  - Test output summary

## Safe Failure Plan

- If the schema from `#35` is not available yet, stop at a compatible adapter layer and report the exact missing contract.
- If replacing the old compiler would widen into sync/orchestration work, keep the slice at PRD-to-DAG compilation only.

## Completion

- Report back:
  - Whether the old flat DAG path was fully replaced or only adapted
  - Any compiler ambiguities left for quality scoring
- Artifacts to update:
  - DAG artifact generation path
- PR or commit expectation:
  - Keep the change set bounded to compiler and artifact emission
- Next suggested stage:
  - Human Review
