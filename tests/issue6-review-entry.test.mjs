import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildReviewPrep,
  generateReviewPrepMarkdown,
  parseCompletionReport,
  validateReviewEntryGate,
} from "../scripts/lib/review-gate.mjs";

test("parseCompletionReport extracts completion report sections used by the review gate", () => {
  const parsed = parseCompletionReport(`# Completion Report

## Changes

- Files or areas changed: scripts/ops.mjs, scripts/lib/review-gate.mjs
- Reason: Added review validation

## Verification

- Commands run: node --test
- Results: Passing
- Gaps: None

## Risks

- Residual risks: Minor integration risk until ops wiring lands

## Follow-ups

- Bugs: None
- Issues: Wire module into CLI

## Issue

- Tracker: #6
`);

  assert.equal(parsed.changes.files_or_areas_changed, "scripts/ops.mjs, scripts/lib/review-gate.mjs");
  assert.equal(parsed.verification.commands_run, "node --test");
  assert.equal(parsed.verification.gaps, "None");
  assert.equal(parsed.risks.residual_risks, "Minor integration risk until ops wiring lands");
  assert.equal(parsed.followUps.issues, "Wire module into CLI");
  assert.equal(parsed.issue.tracker, "#6");
});

test("validateReviewEntryGate reports every missing review entry input explicitly", () => {
  const result = validateReviewEntryGate({
    completionReportMarkdown: `# Completion Report

## Verification

- Commands run:
- Results:
- Gaps:
`,
  });

  assert.equal(result.ok, false);
  assert.equal(result.canGenerateReviewPrep, false);
  assert.deepEqual(result.missingInputs, [
    "acceptance criteria",
    "changed areas",
    "dependency changes",
    "local refactors",
    "verification",
    "gaps",
    "risks",
    "follow-ups",
  ]);
  assert.deepEqual(result.messages, [
    "Missing Review Entry input: acceptance criteria.",
    "Missing Review Entry input: changed areas.",
    "Missing Review Entry input: dependency changes.",
    "Missing Review Entry input: local refactors.",
    "Missing Review Entry input: verification.",
    "Missing Review Entry input: gaps.",
    "Missing Review Entry input: risks.",
    "Missing Review Entry input: follow-ups.",
  ]);
});

test("buildReviewPrep generates advisory markdown when the review entry gate passes", () => {
  const result = buildReviewPrep({
    issue: "#6",
    pr: "https://github.com/example/repo/pull/6",
    completionReportMarkdown: `# Completion Report

## Changes

- Files or areas changed: scripts/lib/review-gate.mjs, tests/issue6-review-entry.test.mjs

## Verification

- Commands run: node --test tests/issue6-review-entry.test.mjs
- Results: Passing on Windows
- Gaps: None

## Risks

- Residual risks: Integration into scripts/ops.mjs still pending

## Follow-ups

- Bugs: None
- Issues: Hook the module into CLI entry points
`,
    acceptanceCriteria: [
      "Reject Review Prep generation when required review entry inputs are missing.",
      "Generate advisory Review Prep markdown from validated inputs.",
    ],
    dependencyChanges: ["None"],
    localRefactors: ["None"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.canGenerateReviewPrep, true);
  assert.equal(result.messages.length, 0);
  assert.match(result.markdown, /# Review Prep/);
  assert.match(result.markdown, /- Issue: #6/);
  assert.match(result.markdown, /- PR: https:\/\/github.com\/example\/repo\/pull\/6/);
  assert.match(result.markdown, /- Changed areas:\n- scripts\/lib\/review-gate\.mjs, tests\/issue6-review-entry\.test\.mjs/);
  assert.match(result.markdown, /- Dependency changes:\n- None/);
  assert.match(result.markdown, /- Local refactors:\n- None/);
  assert.match(result.markdown, /- Results: Passing on Windows/);
  assert.match(result.markdown, /- Gaps: None/);
  assert.match(result.markdown, /- Follow-ups:\n- None/);
  assert.match(result.markdown, /- Hook the module into CLI entry points/);
});

test("generateReviewPrepMarkdown throws with explicit gate messages when validation failed", () => {
  assert.throws(
    () =>
      generateReviewPrepMarkdown({
        ok: false,
        messages: ["Missing Review Entry input: acceptance criteria."],
      }),
    /Missing Review Entry input: acceptance criteria\./,
  );
});
