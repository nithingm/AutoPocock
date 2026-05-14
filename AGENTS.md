# Agentic Repo Template

This repo is a drop-in operating system for AI-assisted engineering workflows.

## Agent skills

### Issue tracker

GitHub is the default Operational Tracker for live issue state, ownership, prioritization, and workflow movement. See `docs/agents/issue-tracker.md`.

### Triage labels

Matt Pocock's canonical triage roles are represented as issue labels, not board columns. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo with root `CONTEXT.md` and optional root `docs/adr/`. See `docs/agents/domain.md`.

### Workflow

Use `pnpm ops` as the Umbrella CLI for Guided Flow, and keep `pnpm prd`, `pnpm issues`, and `pnpm qa` available for Manual Mode. See `docs/agents/workflow.md`.

### TDD

TDD is used inside implementation and bug-fix slices when behavior can be tested through public interfaces. See `docs/agents/tdd.md`.
