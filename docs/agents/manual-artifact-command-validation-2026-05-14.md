# Manual Artifact Command Validation

Validated on 2026-05-14 in `D:\Projects\AutoPocock` against the current repo state, not fixture-only test workspaces.

Update note, 2026-06-25: this artifact records the original live validation pass. The manual-dispatch rough edge documented below has since been closed in the current working tree; see `docs/agents/manual-acceptance-checklist.md` and `tests/ops-cli.test.mjs` for exact handoff matching, missing-handoff refusal, and wrong-issue handoff rejection evidence.

## Scope

- `pnpm ops memory-propose`
- `pnpm ops hitl`
- manual `pnpm ops dispatch`

## Commands Run

```bash
pnpm ops memory-propose -- --type workflow --title "Manual artifact command validation" --rationale "Issue #12 needs a real-repo validation artifact for manual memory proposal behavior and readiness." --target-files "docs/agents/workflow.md|CONTEXT.md" --suggested-text "Validation notes should record prerequisites, expected artifacts, readiness, and rough edges for manual artifact-oriented commands." --accept-risk "Keeps durable-memory candidates explicit without mutating canonical docs during validation." --reject-risk "Operators may continue relying on unvalidated behavior for artifact-oriented commands."

pnpm ops hitl -- --issue 12 --title "Manual artifact command validation needs human judgment"

pnpm ops dispatch -- --issue 12 --title "Manual artifact command validation" --source manual --override-reason "Issue #12 requires validating manual dispatch against live repo state before normal use."
```

## `memory-propose`

- Prerequisites: installed repo dependencies; valid `--type`; non-empty `--title`, `--rationale`, `--target-files`, `--suggested-text`, `--accept-risk`, and `--reject-risk`.
- Observed stdout: two artifact paths.
- Observed artifacts:
  - `docs/agents/memory-proposals/2026-05-14-workflow-manual-artifact-command-validation.json`
  - `docs/agents/memory-proposals/2026-05-14-workflow-manual-artifact-command-validation.md`
- Expected artifact shape from the real run: JSON proposal with `proposal_id`, `type`, `target_files`, `risk`, `status: "proposed"`, and a markdown mirror with the same fields rendered for review.
- Readiness: ready for normal use.
- Notes: no GitHub, queue, handoff, or durable-memory mutation was required. The command behaved as documented and produced reviewable artifacts only.

## `hitl`

- Prerequisites: installed repo dependencies; `--issue`; `--title`.
- Observed stdout: one markdown artifact path.
- Observed artifact:
  - `docs/agents/hitl/2026-05-14-12-manual-artifact-command-validation-needs-human-judgment.md`
- Expected artifact shape from the real run: a Prepared Human Step template with sections for reason, manual steps, location, required value, verification, report-back, and follow-on AFK work.
- Readiness at original validation time: usable, but rough.
- Rough edge: the command writes a blank template with placeholders only. It does not validate that the required sections are filled, so artifact creation can succeed before the HITL step is actually actionable.

## Manual `dispatch`

- Prerequisites: installed repo dependencies; `--issue`; `--title`; `--source manual`; `--override-reason`. No queue export or GitHub access was required for this manual path.
- Observed stdout: JSON and markdown artifact paths.
- Observed artifacts:
  - `docs/agents/dispatches/dispatch-2026-05-14T17-29-38-006Z-12.json`
  - `docs/agents/dispatches/dispatch-2026-05-14T17-29-38-006Z-12.md`
- Expected artifact shape from the real run: queued dispatch metadata, expected branch name, allowed and forbidden actions, completion report target, and markdown mirror.
- Readiness at original validation time: rough.
- Original rough edge, superseded in the current working tree: the generated dispatch for issue `12` auto-linked `docs/agents/handoffs/2026-05-14-123-implement-slice.md` as `handoff_artifact`. That was the latest handoff whose filename contained `12`, not a handoff for issue `12`.
- Original rough edge, superseded in the current working tree: manual dispatch succeeded without proving that a matching handoff existed, even though repo docs say manual dispatch should not bypass normal workflow gates.
- Current guidance: exact handoff matching and missing-handoff refusal are covered by `tests/ops-cli.test.mjs`. If manual dispatch is ambiguous, pass `--handoff <exact path>` explicitly and inspect the generated JSON before treating the artifact as dispatchable.

## Verification

- `node --test tests/ops-workflow-extensions.test.mjs tests/ops-cli.test.mjs tests/issue9-artifact-recovery.test.mjs`
- Result: 34 tests passed, 0 failed.

## Follow-Up Issues Suggested

- Superseded by current working tree: fix handoff auto-resolution for manual dispatch so issue matching is exact rather than substring-based.
- Superseded by current working tree: enforce or explicitly warn on missing matching handoff artifacts before a manual dispatch is considered valid.
- Decide whether `hitl` should stay a pure template writer or add an actionable-mode validation pass.
