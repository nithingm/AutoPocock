# Canonical Manual Workflow Artifact

This **Workflow Artifact** is the canonical manual happy path for a **Solo Operator** using `pnpm ops` as the **Umbrella CLI**. GitHub is the **Operational Tracker**. Repo markdown under `docs/` and `issues/` is the **Artifact Layer**.

Use the command shapes below exactly, then replace the example issue, PR, title, and path values with the live values for your slice.

## Before You Start

- Configure `.ai/ops.config.json` with the intended GitHub owner, repo, and Project reference.
- Install and authenticate `gh` before any GitHub-backed step.
- Create the GitHub Project manually in this version and keep its required fields aligned with `docs/agents/board.md`: `Execution Stage`, `Execution Lane`, `Queue Class`, `Risk`, `Dependency`, `Conflict Surface`, `Feature Track`, and `Dispatch ID`.
- Treat `pnpm ops github:init` as a bootstrap and drift report. Even with `-- --apply`, validated behavior is missing-label creation only; it does not create Projects, fields, or views.

## Choose Your Entry Path

Use the full planning path when you are starting from an idea or a new feature request:

1. `pnpm ops init`
2. `pnpm ops github:init`
3. `pnpm ops prd`
4. `pnpm ops issues`
5. continue into handoff, export, schedule, claim, run, complete, review-prep, QA, and feedback

Use the existing-live-issue path when the GitHub issue already exists and you are not creating a new PRD or issue decomposition:

1. `pnpm ops init`
2. `pnpm ops github:init`
3. skip `prd` and `issues`
4. create or refresh the handoff for the existing issue with `pnpm ops handoff -- --issue <issue-number> --title "Implement slice"`
5. continue into export, schedule, claim, run, complete, review-prep, QA, and feedback

Use the pre-PR late-stage path when the slice is implemented but no PR exists yet:

- `review-prep` accepts `--issue` plus the required review-gate inputs. Add `--pr <pr-number>` only when a PR already exists.
- `qa` accepts `--issue` by itself for strict targeted QA. Add `--pr <pr-number>` when you want the checklist to name the PR explicitly.
- `feedback` accepts `--issue` plus `--finding`. Add `--pr <pr-number>` only when the finding should link back to an existing PR.

## Happy Path Order

1. `pnpm ops init`
2. `pnpm ops github:init`
3. `pnpm ops prd -- --title "Feature Name"`
4. `pnpm ops issues -- --prd docs/PRDs/<date>-feature-name.md`
5. `pnpm ops handoff -- --issue <issue-number> --title "Implement slice"`
6. `pnpm ops github:export`
7. `pnpm ops schedule -- --dispatch`
8. `pnpm ops claim -- --dispatch docs/agents/dispatches/<dispatch-id>.json --claimed-by <runner-name> --isolation-mode worktree`
9. `pnpm ops run -- --dispatch docs/agents/dispatches/<dispatch-id>.json --prepare-worktree`
10. Implement the slice inside the prepared worktree and update the generated artifacts.
11. `pnpm ops complete -- --issue <issue-number> --status "needs human review"`
12. `pnpm ops review-prep -- --issue <issue-number> ...required flags...`
13. `pnpm ops qa -- --issue <issue-number>`
14. `pnpm ops feedback -- --issue <issue-number> --finding "QA finding text"`

The artifact chain across those steps is PRD -> issue decomposition -> handoff -> queue snapshot -> scheduler plan -> dispatch -> completion -> review prep -> QA -> feedback.

## 1. Initialize The Artifact Layer

Prerequisites:
- Run from the repo root.
- `pnpm install` has already been run.

Command:

```bash
pnpm ops init
```

Expected artifact or output:
- Prints `Workflow structure is initialized. No workers or automations were started.`
- Ensures the local **Artifact Layer** directories exist.

Common failure modes:
- `pnpm` or Node is missing from `PATH`.
- Running outside the repo root initializes the wrong directory.

Exact next command:

```bash
pnpm ops github:init
```

## 2. Verify Operational Tracker Bootstrap

Prerequisites:
- `.ai/ops.config.json` points at the intended GitHub owner, repo, and project.
- `gh` is installed and authenticated.

Command:

```bash
pnpm ops github:init
```

Expected artifact or output:
- Prints a dry-run **GitHub Tracker Bootstrap** report.
- Reports `gh` readiness, auth status, canonical labels, Tracker Drift, issue template presence, and required Project fields/views.
- Does not mutate GitHub unless `-- --apply` is added.

Common failure modes:
- `gh` is not installed.
- `gh auth status` is not authenticated.
- `.ai/ops.config.json` points at the wrong repo or project.
- Tracker Drift is reported for existing labels; this is informational unless you are missing canonical labels.

Exact next command:

```bash
pnpm ops prd -- --title "Feature Name"
```

## 3. Create The PRD Artifact

Prerequisites:
- The feature or change has a bounded title.

Command:

```bash
pnpm ops prd -- --title "Feature Name"
```

Expected artifact or output:
- Writes a PRD under `docs/PRDs/`.
- Example verified output in this repo: `docs/PRDs/2026-05-14-canonical-manual-walkthrough.md`

Common failure modes:
- The generated PRD is still a template. `issues` can run, but the decomposition will be generic unless you fill in real acceptance criteria first.

Exact next command:

```bash
pnpm ops issues -- --prd docs/PRDs/<date>-feature-name.md
```

## 4. Create The Issue Decomposition Artifact

Prerequisites:
- The PRD exists.
- Prefer a PRD with filled acceptance criteria.

Command:

```bash
pnpm ops issues -- --prd docs/PRDs/<date>-feature-name.md
```

Expected artifact or output:
- Writes an issue decomposition file under `issues/`.
- The output filename is derived from the PRD filename.

Common failure modes:
- If you omit `--prd`, the script picks the lexically latest file in `docs/PRDs/`, which may not be the PRD you just created.
- If the PRD still contains only placeholders, issue titles fall back to generic slices.

Exact next command:

```bash
pnpm ops handoff -- --issue <issue-number> --title "Implement slice"
```

## 5. Create The Context Handoff

Prerequisites:
- The issue exists in the **Operational Tracker**.
- The slice is small enough for one **Context Handoff**.

Command:

```bash
pnpm ops handoff -- --issue <issue-number> --title "Implement slice"
```

Expected artifact or output:
- Writes a **Context Handoff** under `docs/agents/handoffs/`.
- Committed example shape: `docs/agents/handoffs/2026-05-14-23-prove-the-end-to-end-operating-system-tracer-bullet.md`

Common failure modes:
- The generated handoff is still a template until you fill in goal, boundaries, context, dependencies, and verification.
- If the slice is too broad, later targeted QA will fail even if the file exists.

Exact next command:

```bash
pnpm ops github:export
```

## 6. Export The Queue Snapshot

Prerequisites:
- GitHub project fields are configured.
- The target issues are not in `Done`.

Command:

```bash
pnpm ops github:export
```

Expected artifact or output:
- Writes `.ai/queue.json`.
- Example verified output in this repo: `Exported 1 non-Done item(s).`

Common failure modes:
- `gh` is missing or unauthenticated.
- The configured project reference is wrong.
- The exported issues are missing scheduler-critical fields or labels.

Exact next command:

```bash
pnpm ops schedule -- --dispatch
```

## 7. Generate The Scheduler Plan And Dispatch Artifacts

Prerequisites:
- `.ai/queue.json` exists.
- The issue is eligible for dispatch.
- It has the canonical `ready-for-agent` label.
- Its `Execution Stage` is `Ready for Handoff`.
- `Dependency` is `unblocked`.
- `Risk` and `Conflict Surface` are not blocking values.

Command:

```bash
pnpm ops schedule -- --dispatch
```

Expected artifact or output:
- Writes a **Scheduler Plan** under `docs/agents/schedules/`.
- Writes one or more **Dispatch Artifacts** under `docs/agents/dispatches/`.
- Generated artifact filenames are timestamped; keep the scheduler plan and dispatch artifacts only when they are durable validation evidence for the slice.

Common failure modes:
- `.ai/queue.json` is missing. The command tells you to recover with `pnpm ops github:export`.
- No issue is eligible, so the plan contains only `SKIP` entries and no **Dispatch Artifact** is created.

Exact next command:

```bash
pnpm ops claim -- --dispatch docs/agents/dispatches/<dispatch-id>.json --claimed-by <runner-name> --isolation-mode worktree
```

## 8. Claim One Dispatch Artifact

Prerequisites:
- A queued **Dispatch Artifact** exists.
- You have a stable runner identity for `--claimed-by`.

Command:

```bash
pnpm ops claim -- --dispatch docs/agents/dispatches/<dispatch-id>.json --claimed-by <runner-name> --isolation-mode worktree
```

Expected artifact or output:
- Updates the JSON **Dispatch Artifact** from `queued` to `claimed`.
- Prints the claimed dispatch path.

Common failure modes:
- The dispatch path does not exist. The command tells you to recover with `pnpm ops schedule -- --queue .ai/queue.json --dispatch`.
- The dispatch is already claimed.
- `--isolation-mode` does not match the artifact's isolation mode.
- If you try `--issue <issue-number>` while multiple dispatches exist for that issue, resolution can become ambiguous. Use `--dispatch` once multiple artifacts exist.

Exact next command:

```bash
pnpm ops run -- --dispatch docs/agents/dispatches/<dispatch-id>.json --prepare-worktree
```

## 9. Prepare The Worktree And Runner Plan

Prerequisites:
- The **Dispatch Artifact** is already claimed.
- The dispatch uses `worktree` isolation.

Command:

```bash
pnpm ops run -- --dispatch docs/agents/dispatches/<dispatch-id>.json --prepare-worktree
```

Expected artifact or output:
- Prints a **Runner Plan** with branch name, worktree path, handoff artifact, completion target, and forbidden actions.
- Creates the local worktree directory only.
- Example verified output in this repo reported `Worktree prepared: yes` and `No provider was invoked. Worktree directory was prepared locally. No code was changed.`

Common failure modes:
- The dispatch was not claimed first.
- `--prepare-worktree` is used on a non-worktree dispatch.
- The dispatch is missing claim metadata or `worktree_path`.

Exact next command:

```bash
pnpm ops complete -- --issue <issue-number> --status "needs human review"
```

## 10. Create The Completion Report

Prerequisites:
- The implementation work is done in the claimed worktree.
- You know the real changed areas, verification commands, gaps, and follow-ups.

Command:

```bash
pnpm ops complete -- --issue <issue-number> --status "needs human review"
```

Expected artifact or output:
- Writes a **Completion Report** under `docs/agents/completions/`.
- Committed example shape: `docs/agents/completions/2026-05-15-49-completion.md`

Common failure modes:
- The generated file is only a template until you replace every `REQUIRED` placeholder.
- If the issue field or changed areas stay vague, `review-prep` will fail the **Review Entry Gate**.

Exact next command:

```bash
pnpm ops review-prep -- --issue <issue-number> --acceptance "<criterion 1>|<criterion 2>" --changed-areas "<path 1>|<path 2>" --dependency-changes "None" --local-refactors "None" --verification-commands "<cmd 1>|<cmd 2>" --verification-results "<observed result>" --gaps "<remaining gaps or None>" --risks "<risk 1>|<risk 2>" --follow-ups "<follow-up 1>|None"
```

## 11. Generate Review Prep

Prerequisites:
- The **Completion Report** exists for the issue.
- Acceptance criteria, changed areas, dependency changes, local refactors, verification, gaps, risks, and follow-ups are explicit either in the report or on the command line.

Command:

```bash
pnpm ops review-prep -- --issue <issue-number> --acceptance "<criterion 1>|<criterion 2>" --changed-areas "<path 1>|<path 2>" --dependency-changes "None" --local-refactors "None" --verification-commands "<cmd 1>|<cmd 2>" --verification-results "<observed result>" --gaps "<remaining gaps or None>" --risks "<risk 1>|<risk 2>" --follow-ups "<follow-up 1>|None"
```

Expected artifact or output:
- Writes **Review Prep** under `docs/agents/reviews/`.
- Generated review prep artifacts are timestamped and issue-scoped; commit them only when they are durable review evidence.
- `--pr` is optional. Add it only when a PR already exists and you want the review artifact to carry that reference.

Common failure modes:
- Missing **Review Entry Gate** inputs produce explicit errors such as `Missing Review Entry input: acceptance criteria.`
- If no completion path is supplied, the command resolves the latest completion report for `--issue`. If none exists, it tells you to create one with `pnpm ops complete`.

Exact next command:

```bash
pnpm ops qa -- --issue <issue-number>
```

## 12. Run Targeted QA

Prerequisites:
- The issue, PR, **Context Handoff**, **Completion Report**, and preferably **Review Prep** exist.
- The change set is still a bounded slice.

Command:

```bash
pnpm ops qa -- --issue <issue-number> --pr <pr-number>
```

Expected artifact or output:
- Always writes a QA checklist artifact under `docs/QA/`.
- On a clean slice, strict targeted QA exits successfully after writing the checklist.
- In the verified repo state, the command wrote `docs/QA/2026-05-14-qa-checklist.generated.md` and then failed because the current change set was too broad for strict targeted QA.

Common failure modes:
- Missing handoff or completion context is a workflow failure.
- Missing review prep is a warning, not a hard blocker.
- Broad change sets fail strict targeted QA even when all artifacts exist.
- If a PR exists, pass `--pr <pr-number>` so the checklist names it. If no PR exists yet, running with `--issue` only is the intended pre-PR path.

Exact next command:

```bash
pnpm ops feedback -- --issue <issue-number> --finding "QA finding text"
```

## 13. Classify QA Feedback

Prerequisites:
- At least one QA finding is explicit and written in one sentence.

Command:

```bash
pnpm ops feedback -- --issue <issue-number> --pr <pr-number> --finding "QA finding text"
```

Expected artifact or output:
- Writes local feedback JSON and markdown artifacts under `docs/agents/feedback/`.
- Prints a classification as either a Same-PR Fix candidate or a new bug draft.
- Example verified output in this repo classified the finding as `new-bug-draft` and printed both artifact paths.

Common failure modes:
- `--apply` is not implemented; the command is local-first and does not create a GitHub issue or comment.
- Vague findings create weak bug drafts. Write the finding as observable behavior, not as a fix idea.
- `--pr` is optional. Use it when a PR exists and the follow-up should link back to that PR. Omit it on the intended pre-PR path.

Exact next command:

```bash
# Either create the new bug in GitHub from the local draft, or take an explicit Same-PR Fix decision before widening scope.
```

## When The Slice Counts As Done

Treat the slice as done only when:

- the implementation stayed inside the original slice boundary
- the handoff, completion report, and review prep all contain real operator-facing content rather than placeholders
- the Review Entry Gate passed with explicit acceptance, changed areas, verification, risks, gaps, and follow-ups
- targeted QA ran against that same slice
- any bug that would widen scope was captured as a follow-up instead of being silently folded into the slice
