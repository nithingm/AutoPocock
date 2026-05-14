# Triage Labels

Matt Pocock skills expect canonical triage roles. This template keeps those roles as labels and uses project fields for execution flow.

## Category Roles

- `bug`: something is broken
- `enhancement`: new feature or improvement

## State Roles

- `needs-triage`: maintainer needs to evaluate
- `needs-info`: waiting on reporter for more information
- `ready-for-agent`: fully specified and AFK-ready
- `ready-for-human`: needs human implementation or judgment
- `wontfix`: will not be actioned

## Rules

- Every triaged issue should have exactly one category role and one state role.
- `ready-for-agent` requires the strict handoff gate in `docs/agents/handoff.md`.
- Work that fails the strict handoff gate should be labeled `ready-for-human` and shown as a HITL task.
- Execution stage is a project field, not a replacement for these labels.
