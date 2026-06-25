# ADR: Keep Durable Memory Decisions Repo-Local

## Status

Accepted

## Context

AutoPocock can create Durable Memory proposals with `pnpm ops memory-propose` and record approval or rejection with `pnpm ops memory-decision`. Approved proposals can be applied to repo-local target files with `--apply`.

The remaining open question was whether approved repo-local Durable Memory decisions should also sync into external or user-level memory stores.

## Decision

Approved Durable Memory decisions stay repo-local. `pnpm ops memory-decision -- --apply` may only mutate target files named in the proposal inside the repository.

AutoPocock will not automatically write to external Codex memory, user-level memory stores, or other cross-project state. Any future external memory export must be a separate, explicit connector boundary with its own preview, approval, and audit trail.

## Consequences

- Repo history remains the authority for project memory decisions.
- A project cannot silently change user-level agent behavior.
- External memory sync is no longer an open completion item for this template.
- Future connector work can still add an opt-in export path without weakening the current safety boundary.
