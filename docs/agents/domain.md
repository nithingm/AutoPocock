# Domain Docs

This repo uses a single-context domain documentation layout.

## Layout

- `CONTEXT.md`: canonical glossary and relationships
- `docs/adr/`: architectural decisions, created only when needed
- `docs/agents/`: operating rules for agent workflows

## Consumer Rules

- Read `CONTEXT.md` before naming concepts in issues, handoffs, or completion reports.
- Use glossary terms exactly when writing user-facing workflow artifacts.
- Do not add implementation details to `CONTEXT.md`.
- Create ADRs only for decisions that are hard to reverse, surprising without context, and based on real trade-offs.
