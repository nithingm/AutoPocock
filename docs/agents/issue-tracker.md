# Issue Tracker

GitHub is the default **Operational Tracker**.

## Source Of Truth

- Live issue state lives in GitHub Issues and GitHub Projects.
- Repo markdown stores rich context in the **Artifact Layer**.
- Issue comments mirror important handoffs and completion reports for operational visibility.

## Tracker Contract

- Use GitHub labels for Matt Pocock triage roles.
- Use GitHub Project fields for execution stages, lanes, risk, dependencies, capacity, and conflict surface.
- Treat repo-local markdown as supporting context, not the canonical status source.
- Treat `.ai/ops.config.json` `projectSchema` as the canonical local copy of the required Project fields and values.

## Tracker Bootstrap

- `pnpm ops github:init` is dry-run by default.
- It reports `gh` CLI readiness, authentication status, expected labels, issue template presence, and required Project fields/views.
- It does not create labels, issues, comments, Projects, fields, or views unless `--apply` plus the relevant explicit creation flag is provided.
- It can create missing labels with `--apply`, create a fresh Project with `--apply --create-project` only when no Project reference is configured, and create missing configured fields with `--apply --create-project-fields`.
- Project views are inspected through GraphQL and missing/name-drift views are reported. Creation and renaming remain manual because GitHub CLI/GraphQL do not expose ProjectV2 view mutations.

## Artifact Mirroring

- Workflow artifacts may be mirrored into GitHub issue or PR comments for operational visibility.
- Mirroring is selective and summarized; it is not a raw file dump.
- Supported mirrored artifact families are handoff, HITL, completion, review prep, QA summary, feedback summary, and durable memory proposal summary.
- Full Scheduler Plans are excluded by default.
- `pnpm ops mirror` is dry-run by default and only posts with explicit `--apply`.
- Mirrored comments carry a stable marker so `pnpm ops mirror -- --apply --update-existing` can refresh an existing artifact mirror instead of creating a duplicate comment.

## Local Fallback

When GitHub is unavailable, write issue drafts and workflow artifacts locally. Local fallback should preserve the same labels, stages, handoff templates, and completion templates so migration to GitHub stays mechanical.
