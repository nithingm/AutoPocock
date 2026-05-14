import assert from "node:assert/strict";
import { test } from "node:test";

import {
  renderTargetedQaChecklistContext,
  validateTargetedQa,
} from "../scripts/lib/qa-targeted.mjs";

test("strict targeted QA rejects invalid identifiers and missing required artifacts", () => {
  const result = validateTargetedQa({
    issue: "issue-seven",
    pr: "feature-branch",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "fail");
  assert.deepEqual(result.errors, [
    "Strict targeted QA requires a valid issue identifier.",
    "Strict targeted QA requires a valid PR identifier.",
    "Missing required Handoff Artifact for targeted QA.",
    "Missing required Completion Report for targeted QA.",
  ]);
  assert.deepEqual(result.warnings, ["Missing Review Prep artifact."]);
});

test("manual mode bypasses identifier checks and strict artifact failures but keeps warnings", () => {
  const result = validateTargetedQa({
    manual: true,
    issue: "draft issue",
    pr: "draft pr",
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "pass");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, [
    "Manual mode bypassed strict issue identifier validation.",
    "Manual mode bypassed strict PR identifier validation.",
    "Missing required Handoff Artifact for targeted QA. Manual mode allowed QA to continue.",
    "Missing required Completion Report for targeted QA. Manual mode allowed QA to continue.",
    "Missing Review Prep artifact.",
  ]);
});

test("checklist context lists found artifacts and warnings", () => {
  const result = validateTargetedQa({
    issue: "#7",
    pr: "https://github.com/example/repo/pull/7",
    handoffArtifact: {
      path: "docs/agents/handoffs/issue-7.md",
      content: `# Context Handoff

## Goal

- One sentence outcome: Add strict targeted QA validation.

## Boundaries

- In scope: targeted QA validation module
- Out of scope: wiring scripts/qa.mjs
`,
    },
    completionReport: {
      path: "docs/agents/completions/issue-7.md",
      content: `# Completion Report

## Changes

- Files or areas changed: scripts/lib/qa-targeted.mjs, tests/issue7-qa-targeted.test.mjs

## Verification

- Commands run: node --test tests/issue7-qa-targeted.test.mjs
- Results: Passing
`,
    },
  });

  const markdown = renderTargetedQaChecklistContext(result);

  assert.equal(result.status, "pass");
  assert.deepEqual(result.checklistContext.foundArtifacts, [
    "Handoff Artifact: docs/agents/handoffs/issue-7.md",
    "Completion Report: docs/agents/completions/issue-7.md",
  ]);
  assert.deepEqual(result.warnings, ["Missing Review Prep artifact."]);
  assert.match(markdown, /- Issue: #7/);
  assert.match(markdown, /- PR: https:\/\/github\.com\/example\/repo\/pull\/7/);
  assert.match(markdown, /Handoff Artifact: docs\/agents\/handoffs\/issue-7\.md/);
  assert.match(markdown, /Completion Report: docs\/agents\/completions\/issue-7\.md/);
  assert.match(markdown, /Missing Review Prep artifact\./);
});

test("oversized or unclear work is reported as needing slicing instead of passing QA", () => {
  const result = validateTargetedQa({
    issue: "#7",
    pr: "#77",
    handoffArtifact: {
      path: "docs/agents/handoffs/issue-7.md",
      content: `# Context Handoff

## Goal

- TBD
`,
    },
    completionReport: {
      path: "docs/agents/completions/issue-7.md",
      content: `# Completion Report

## Changes

- Files or areas changed: many
`,
    },
    reviewPrep: {
      path: "docs/agents/reviews/issue-7.md",
      content: "# Review Prep\n",
    },
    changedFiles: [
      "scripts/qa.mjs",
      "scripts/ops.mjs",
      "scripts/issues.mjs",
      "scripts/lib/qa-targeted.mjs",
      "tests/issue7-qa-targeted.test.mjs",
      "docs/agents/workflow.md",
      "docs/agents/tdd.md",
      "issues/7.md",
      "README.md",
      "CONTEXT.md",
      "prompts/review.md",
      "skills/qa/SKILL.md",
    ],
    recentCommits: [
      { sha: "a1", subject: "TBD", files: ["scripts/qa.mjs", "scripts/ops.mjs"] },
      { sha: "b2", subject: "Expand qa", files: ["docs/agents/workflow.md", "README.md"] },
      { sha: "c3", subject: "More edits", files: ["CONTEXT.md", "issues/7.md"] },
      { sha: "d4", subject: "More edits", files: ["prompts/review.md", "skills/qa/SKILL.md"] },
      { sha: "e5", subject: "More edits", files: ["tests/issue7-qa-targeted.test.mjs"] },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "needs-slicing");
  assert.equal(result.needsSlicing, true);
  assert.match(result.sliceSignals.join("\n"), /placeholder language/);
  assert.match(result.sliceSignals.join("\n"), /missing boundaries or scope|missing verification evidence/);
  assert.match(result.sliceSignals.join("\n"), /touches 12 files/);
  assert.match(result.sliceSignals.join("\n"), /spans 5 commits/);
  assert.match(result.sliceSignals.join("\n"), /top-level areas/);
  assert.match(result.sliceSignals.join("\n"), /unclear subjects/);
});
