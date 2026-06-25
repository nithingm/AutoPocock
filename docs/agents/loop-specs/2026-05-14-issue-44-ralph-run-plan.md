# Ralph Run Plan: Issue #44 Execution Graph

## Scope

- Parent issue: `#44`
- PRD: `docs/PRDs/2026-05-14-topologically-sorted-dag-planning-and-graph-driven-ralph-loop-orchestration.md`
- Issue decomposition: `issues/2026-05-14-topologically-sorted-dag-planning-and-graph-driven-ralph-loop-orchestration-issues.md`
- Execution set: `#45` through `#55`

## Control Stance

- Approval unit: wave bundle
- Default loop unit: one issue = one bounded Ralph loop
- Default pass shape: `inspect -> implement -> verify -> record evidence -> decide continue/stop`
- Default stop rule:
  - report `COMPLETE` when acceptance criteria are satisfied and verification is green
  - stop immediately on hard blocker, scope violation, or retry-budget exhaustion
- Default escalation:
  - graph-contract ambiguity
  - write-surface expansion outside the approved slice
  - repeated failure of the same acceptance criterion
  - missing artifact or approval required by the current loop
- Default verification baseline:
  - targeted `node --test ...` coverage for the slice
  - broader `pnpm test` before loop completion when the touched surface is shared
  - relevant `pnpm ops ...` dry-run or artifact-generation command when workflow behavior is part of the acceptance criteria

## Subagent Topology

- Coordinator:
  - owns wave gating, branch-local pause decisions, artifact review, and merge-order discipline
  - does not hand off the critical-path dependency decision itself
- Implementation workers:
  - default maximum active workers: `2`
  - each worker owns one issue or one explicitly split sub-surface inside an issue
- Verifier workers:
  - optional short-lived explorer/verifier support for test expansion or merge-risk inspection
  - do not own primary implementation paths

The plan deliberately uses wave-level parallelism instead of large nested worker trees. That keeps ownership and merge pressure sane.

## Wave Order

### Wave 0

- Issue: `#45` Add PRD Tightness Validation Before DAG Compilation
- Mode: single worker
- Why first:
  - this is the hard gate for all downstream graph work
  - everything else assumes a durable compile-or-refuse validation contract
- Likely owned surfaces:
  - `scripts/lib/prd-plane.mjs`
  - issue-planning entrypoints under `scripts/`
  - PRD and issue-planning tests
- Verification:
  - validator fixture coverage
  - `pnpm ops issues -- --prd <fixture>` pass/fail behavior matches the validator outcome
- Retry budget: `3`

### Wave 1

- Issue: `#47` Make the DAG the Topologically Sorted Execution Authority
- Mode: single worker
- Why alone:
  - this is the real execution foundation
  - it sets canonical node identity, topology semantics, and graph truth for all later waves
- Likely owned surfaces:
  - `scripts/lib/layered-dag-schema.mjs`
  - `scripts/lib/layered-dag-compiler.mjs`
  - `scripts/lib/dag-planner.mjs`
  - DAG tests
- Verification:
  - graph fixture tests for sort, validation, and readiness
  - workflow-facing proof that downstream consumers use the DAG as authority
- Retry budget: `3`

### Wave 2

- Issues:
  - `#48` Add Wave Planning With Write-Surface and Conflict-Safe Parallelism
  - `#46` Regenerate DAGs With Diffing, Edit Preservation, and Provenance
- Mode: two implementation workers in parallel
- Worker split:
  - Worker A owns `#48`
  - Worker B owns `#46`
- Why parallel:
  - both depend on the post-`#47` DAG contract
  - they mostly diverge after that into scheduling versus regeneration/provenance
- Branch-local pause rule:
  - if `#46` changes canonical node fields or write-surface metadata consumed by scheduling, pause `#48` at merge time and reconcile before continuing
- Likely owned surfaces:
  - `#48`: `scripts/lib/dag-wave-orchestrator.mjs`, scheduler selection tests, quality-gating consumers
  - `#46`: DAG regeneration/diff/provenance modules, DAG artifact rendering, reconciliation-style tests
- Verification:
  - `#48`: fixture matrix for dependency, overlap, priority, and concurrency-policy cases
  - `#46`: round-trip DAG regeneration tests with edit preservation and stale marking
- Retry budget:
  - `#48`: `3`
  - `#46`: `3`

### Wave 3

- Issue: `#49` Compile Explicit Ralph Loop Specs From Approved DAG Nodes
- Mode: single worker
- Why alone:
  - this is the tracer-bullet checkpoint for the execution model
  - it should land on top of stable DAG and wave semantics
- Likely owned surfaces:
  - `scripts/lib/dag-loop-spec-compiler.mjs`
  - `scripts/lib/workflow-core.mjs`
  - loop-spec tests
- Verification:
  - compile approved DAG fixtures into durable loop-spec artifacts
  - assert owned surfaces, stop conditions, escalation rules, and retry budgets are preserved
- Retry budget: `3`

### Wave 4

- Issues:
  - `#50` Add Wave-Bundle Approval for Graph-Driven Execution
  - `#52` Enforce Evidence-Based Completion, Multidimensional Testing, and Validation-Failed Progression
- Mode: two implementation workers in parallel
- Worker split:
  - Worker A owns `#50`
  - Worker B owns `#52`
- Why parallel:
  - both consume the frozen loop-spec contract
  - one is pre-execution approval packaging
  - one is post-execution completion and validation progression
- Branch-local pause rule:
  - if `#52` renames or reshapes completion/validation states that `#50` displays or gates on, hold `#50` merge until vocabulary is aligned
- Likely owned surfaces:
  - `#50`: wave approval packaging, dispatch/approval artifacts, CLI and console previews
  - `#52`: `scripts/lib/graph-progression.mjs`, `scripts/lib/review-plane.mjs`, completion and QA artifact semantics
- Verification:
  - `#50`: approval bundle artifact tests and preview flows
  - `#52`: state-transition tests around completion, review, QA, and `validation-failed`
- Retry budget:
  - `#50`: `2`
  - `#52`: `2`

### Wave 5

- Issue: `#51` Add Preflight Feasibility Validation and Dynamic Wave Splitting
- Mode: single worker
- Why here:
  - needs real wave-bundle approval and real loop specs
  - should land after `#52` if preflight output needs the final failure-state taxonomy
- Likely owned surfaces:
  - `scripts/lib/dag-wave-orchestrator.mjs`
  - provider-run preflight logic
  - reconciliation artifact generation
- Verification:
  - fixture-driven infeasible-node and split-wave scenarios
  - dry-run proof that safe nodes still launch while withheld nodes emit durable reasons
- Retry budget: `2`

### Wave 6

- Issue: `#53` Auto-Insert Bug-Loop Repair Issues With Escalation Caps
- Mode: single worker
- Why alone:
  - this is the first place preflight failure and validation failure converge
  - it mutates shared progression behavior
- Likely owned surfaces:
  - `scripts/lib/graph-progression.mjs`
  - review/QA follow-up behavior
  - bug-loop insertion tests
- Verification:
  - integration-failure scenarios
  - same-node retry caps
  - descendant cap enforcement
  - write-surface expansion escalation
- Retry budget: `1` additional repair attempt after first working version

### Wave 7

- Issue: `#54` Add Branch-Local Pause and Shared-Foundation Full-Run Freeze Rules
- Mode: single worker
- Why here:
  - it depends on real repair and escalation behavior, not hypothetical failure handling
- Likely owned surfaces:
  - `scripts/lib/graph-progression.mjs`
  - orchestration and runner pause/freeze logic
  - failure-policy tests
- Verification:
  - branch-only failure versus full-run freeze scenario coverage
  - durable reason output for every pause/freeze decision
- Retry budget: `1`

### Wave 8

- Issue: `#55` Orchestrate Multi-Stage Single Runs From Connected Wave Bundles
- Mode: single worker, with optional short-lived verifier support for end-to-end fixtures
- Why last:
  - it composes approval, preflight, completion progression, repair insertion, and pause/freeze behavior into one staged run
- Likely owned surfaces:
  - `scripts/lib/provider-runner.mjs`
  - `scripts/lib/dag-wave-orchestrator.mjs`
  - `scripts/lib/graph-progression.mjs`
  - end-to-end tracer-bullet tests
- Verification:
  - end-to-end staged-run tracer bullet
  - preserve deterministic state across pause, resume, repair insertion, and stage transitions
- Retry budget: `2`

## Strong Dependency Spine

`#45 -> #47 -> #48 -> #49 -> #50 -> #51 -> #53 -> #54 -> #55`

Parallel side paths:

- `#46` after `#47`
- `#52` after `#49`, parallel with `#50`

## Branch-Local Pause Points

Pause only the affected branch by default at these seams:

1. `#46` versus `#48`
   - trigger when DAG field or write-surface semantics change underneath the scheduler
2. `#50` versus `#52`
   - trigger when completion-state vocabulary changes underneath approval bundles
3. `#51` before `#53`
   - trigger when preflight failure semantics diverge from validation-failure semantics

Freeze the whole run only if one of the already-agreed shared-foundation conditions is hit:

- shared schema instability
- unstable shared contracts
- broken global build/runtime environment
- architecture contradiction
- missed broad write-surface overlap
- incorrect accepted dependency structure

## Standard Ralph Prompt Shape

Use this prompt skeleton for each issue worker:

```text
Implement issue #<id>: <title>.

Goal:
- <bounded issue goal>

Acceptance criteria:
- <criterion 1>
- <criterion 2>

Owned surface:
- <owned module or test surface>

Verification:
- node --test <targeted tests>
- pnpm test
- <relevant pnpm ops dry-run or artifact command when applicable>

Stop when:
- acceptance criteria are satisfied
- verification is green
- evidence is recorded in artifacts or completion output
- report COMPLETE

Escalate when:
- scope expands beyond the owned surface
- a required artifact or approval is missing
- the same acceptance criterion fails repeatedly
- graph or state semantics are ambiguous
```

## Recommended First Launch

If you actually run this with live workers, start with:

1. `#45` as a solo tracer bullet
2. `#47` as the authority checkpoint
3. `#48` and `#46` as the first real parallel wave

That sequence proves the graph foundation before deeper orchestration work starts compounding on top of it.
