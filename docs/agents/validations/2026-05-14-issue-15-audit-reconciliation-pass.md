# Issue 15 Reconciliation: Audit vs Hardening

Date: 2026-05-14
Repo state: `D:\Projects\AutoPocock`
Validator: Codex
Issue under reconciliation: `#15` `Audit reconciliation pass`

## Observable Outcome

Produce a reconciliation artifact that compares the real-run happy-path audit from issue `#4` against the shipped hardening work from issues `#5` through `#10`, issue `#14`, and the approved issue `#13` decision where relevant, so the final acceptance checklist can distinguish eliminated operator guesswork from unresolved follow-up work.

## Sources Compared

- Audit baseline: `docs/agents/validations/2026-05-14-issue-4-real-run-happy-path-audit.md`
- Product scope: `docs/PRDs/2026-05-14-manual-os-hardening-before-automation.md`
- Approved product-shape decision: `docs/agents/issue-13-skills-prompts-decision-brief.md`
- Shipped workflow docs:
  - `docs/agents/manual-walkthrough.md`
  - `docs/agents/workflow.md`
  - `README.md`
- Shipped behavior/tests:
  - `tests/issue6-review-entry.test.mjs`
  - `tests/issue7-qa-targeted.test.mjs`
  - `tests/issue8-feedback.test.mjs`
  - `tests/issue9-artifact-recovery.test.mjs`
  - `tests/ops-cli.test.mjs`
  - `tests/ops-workflow-extensions.test.mjs`
- Real-run follow-up validation relevant to remaining rough edges:
  - `docs/agents/manual-artifact-command-validation-2026-05-14.md`
  - `docs/agents/validations/2026-05-14-issue-11-tracker-commands.md`

## Reconciliation Summary

The hardening work materially closed the audit's biggest implementation-side gaps:

- artifact lookup is no longer loose for completion resolution and recovery guidance
- completion and review-prep now force explicit review-gate inputs instead of silently passing placeholder artifacts
- targeted QA now fails loudly when required context is missing or the slice is too broad
- GitHub export now covers the real flattened and top-level `gh project item-list` shapes discovered during manual validation
- workflow docs now explain the intended product split from issue `#13` and document more of the operator contract directly

The remaining guesswork is mostly not hidden in code anymore. It is now explicit follow-up work in documentation, product boundaries, or still-rough manual dispatch behavior.

## Audit-To-Hardening Matrix

### 1. Artifact resolution

Audit findings from issue `#4`:

- review prep depended on the operator knowing the right completion path
- targeted QA matched issue `4` against unrelated `123` artifacts by substring
- schedule/run recovery paths were under-specified when queue or dispatch artifacts were missing

Shipped hardening:

- `review-prep` now auto-resolves the latest completion report by exact issue evidence from parsed content or `issue-<n>` filenames, and stops with explicit candidate paths when resolution is ambiguous
- missing queue, dispatch, and completion artifacts now return exact recovery commands
- strict targeted QA now requires handoff/completion context and reports missing artifacts as workflow failures

Evidence:

- `tests/ops-workflow-extensions.test.mjs`
- `tests/issue9-artifact-recovery.test.mjs`
- `tests/issue7-qa-targeted.test.mjs`
- `scripts/ops.mjs`

Status:

- Eliminated for completion resolution and recovery guidance
- Eliminated for targeted QA failure visibility
- Not fully eliminated for artifact matching in `scripts/qa.mjs`: `findMatchingArtifact()` still uses `file.includes(issue)`, so the exact false-positive seen in issue `#4` remains possible in real repo state despite the stricter QA validator

### 2. Template hardening

Audit findings from issue `#4`:

- handoff and completion generation succeeded while leaving major required content implicit
- review prep failed late because earlier artifacts did not structure required inputs clearly enough

Shipped hardening:

- completion template now marks required vs optional fields directly in the artifact
- review-prep gate now treats placeholder content as missing input and fails with explicit messages
- review-prep writes advisory output only after the gate passes

Evidence:

- `tests/issue6-review-entry.test.mjs`
- `tests/ops-workflow-extensions.test.mjs`
- `scripts/ops.mjs`

Status:

- Eliminated for completion-to-review-prep handoff
- Partially unresolved for `handoff` and `hitl`: they still generate blank templates without an equivalent validation gate, so operator content judgment is still required before those artifacts are actually actionable

### 3. Guidance and workflow clarity

Audit findings from issue `#4`:

- the walkthrough only described the new-feature path, not existing-issue validation
- it did not explain scheduler mismatch, manual dispatch recovery, or pre-PR versus post-PR late-stage usage
- operators had to infer whether `ready-for-agent` drift mattered and what the issue `#13` product split actually was

Shipped hardening:

- `manual-walkthrough.md`, `workflow.md`, and `README.md` now document the canonical artifact chain, review gate, strict QA contract, local-first feedback, and the approved issue `#13` split
- scheduler docs now say manual `pnpm ops dispatch` exists and is still rough
- workflow docs now call out that GitHub project creation/field setup remains manual in this phase
- scheduler output now distinguishes missing repo canonical label from missing issue label

Evidence:

- `docs/agents/manual-walkthrough.md`
- `docs/agents/workflow.md`
- `README.md`
- `tests/ops-cli.test.mjs`
- `docs/agents/issue-13-skills-prompts-decision-brief.md`

Status:

- Eliminated for the issue `#13` skills/prompts/TDD product-shape ambiguity
- Eliminated for `ready-for-agent` scheduler guidance
- Partially unresolved for existing-live-issue walkthrough branching, scheduler-picked-different-issue recovery, and pre-PR late-stage guidance: the walkthrough still presents one linear happy path and still assumes a PR for `review-prep`, `qa`, and `feedback`

### 4. GitHub export hardening

Audit findings from issue `#4`:

- queue export hid critical scheduler fields when GitHub returned real flattened shapes
- the operator had to inspect `.ai/queue.json` manually to learn what exported

Shipped hardening:

- export now accepts nested, flattened, empty-field, and alternate top-level project item shapes
- scheduler-critical fields are preserved across those shapes
- missing `gh` and missing project-reference failures now include explicit immediate and permanent recovery guidance

Evidence:

- `tests/ops-cli.test.mjs`
- `scripts/ops.mjs`

Status:

- Eliminated for the real JSON-shape compatibility problem called out by the PRD
- Still unresolved for issue-level exclusion reporting in live GitHub runs: `github:export` reports aggregate counts, but it still does not explicitly say that the operator's intended issue was absent from the configured project

## Eliminated Guesswork

These audit rough edges are credibly closed by shipped work:

- How to recover from missing queue, dispatch, or completion artifacts
- Whether review prep can proceed with missing or placeholder review-entry inputs
- Whether strict targeted QA should tolerate missing handoff/completion context
- Whether strict targeted QA should pass broad or unclear slices
- Whether feedback classification mutates GitHub by default
- Whether GitHub export supports the flattened and alternate real-world item shapes discovered during hardening
- Whether issue `#13` changes the repo shape for TDD, skills, and prompts
- Whether scheduler skips due to missing `ready-for-agent` come from repo config drift or issue label drift

## Remaining Unresolved Follow-Up Work

These operator-guesswork gaps still exist and should stay explicit:

- `scripts/qa.mjs` still resolves targeted artifacts with substring matching, so the exact issue `4` versus `123` mis-link class from the audit is not fully removed
- `docs/agents/manual-walkthrough.md` still lacks an explicit branch for validating or operating against an already-existing live issue instead of starting from `prd` and `issues`
- the docs still do not define a clear stop/recovery decision when queue export and scheduling select a different issue than the one under active ownership
- late-stage walkthrough guidance still assumes a PR exists; pre-PR usage rules for `review-prep`, `qa`, and `feedback` remain implicit
- `github:export` still does not report issue-level exclusion when an otherwise valid issue is simply not attached to the configured project
- manual `pnpm ops dispatch` remains rough: handoff auto-resolution is still substring-based and a missing matching handoff does not block artifact creation
- `handoff` and `hitl` still rely on operator judgment to replace placeholders, with no comparable validation gate to the hardened completion/review-prep path
- `mirror -- --apply` remains unvalidated in the real-repo notes reviewed here
- the PRD called for a manual acceptance checklist, but no dedicated final checklist artifact is present in the compared sources yet

## Acceptance-Checklist Readiness

This reconciliation is specific enough to support the final acceptance checklist because it separates:

- fixes that are implemented and covered by tests
- fixes that are only documented guidance
- rough edges that remain as explicit follow-up work

A final acceptance checklist should treat these as required unresolved items unless a later slice closes them:

- exact targeted-QA artifact matching
- existing-live-issue walkthrough branch
- scheduler-mismatch recovery guidance
- pre-PR late-stage workflow guidance
- issue-level GitHub export exclusion reporting
- manual dispatch handoff validation
- final manual acceptance checklist artifact itself

## Verification

Targeted first:

```bash
node --test tests/issue6-review-entry.test.mjs tests/issue7-qa-targeted.test.mjs tests/issue8-feedback.test.mjs tests/issue9-artifact-recovery.test.mjs tests/ops-cli.test.mjs tests/ops-workflow-extensions.test.mjs
```

Broader relevant verification:

```bash
node --test tests/*.mjs
```

Results:

- Targeted surface: 47 tests passed, 0 failed
- Broader relevant suite: 62 tests passed, 0 failed

## Outcome Against Acceptance Criteria

- Reconciliation compares the audit directly against implemented fixes for artifact resolution, template hardening, guidance, and GitHub export: satisfied
- Remaining operator guesswork is explicitly identified as unresolved follow-up work: satisfied
- Result is specific enough to support the final acceptance checklist: satisfied
