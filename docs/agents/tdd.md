# TDD Contract

TDD is an execution discipline for implementation and bug-fix work. It is not a separate Execution Stage.

## When To Use TDD

- Use TDD for AFK implementation slices when behavior can be verified through a public interface.
- Use TDD for bug fixes when the failure can be reproduced with a regression test.
- Use TDD for tracer bullets when one behavior can prove the path end-to-end.
- Do not force TDD for documentation-only work, tracker setup, or pure reporting commands.

## Red-Green-Refactor Rules

- Write one behavior test first.
- Confirm it fails for the expected reason.
- Write the minimum implementation needed to pass.
- Refactor only after the test is green.
- Repeat vertically, one behavior at a time.

## Test Quality Rules

- Test observable behavior through public interfaces.
- Avoid tests coupled to private implementation details.
- Prefer integration-style tests for CLI behavior, generated artifacts, exit codes, and filesystem output.
- Use local fixtures for GitHub, queue, dispatch, and QA workflows.
- Keep real network calls out of default tests.

## Handoff Requirements

When TDD applies, Context Handoffs should include:

- first behavior to test
- expected failing condition
- public interface under test
- verification command
- refactor boundaries

## Completion Requirements

Completion Reports should state:

- tests added or updated
- failing behavior reproduced before the fix, when applicable
- verification commands run
- refactors performed after green
- any behavior that could not be tested and why
