import assert from "node:assert/strict";
import { test } from "node:test";

import { buildMirrorComment, renderMirrorPlan, summarizeArtifact } from "../scripts/lib/artifact-mirror.mjs";

test("summarizeArtifact produces a bounded handoff summary", () => {
  const markdown = `# Context Handoff

## Goal

- One sentence outcome: Ship selective artifact mirroring.

## Boundaries

- In scope: mirror handoffs and completions
- Out of scope: full scheduler plans

## Verification

- Automated: node --test
- Manual: inspect dry-run output
`;

  const summary = summarizeArtifact("docs/agents/handoffs/issue-5.md", markdown);

  assert.equal(summary.kind, "handoff");
  assert.match(summary.lines.join("\n"), /Context handoff summary/);
  assert.match(summary.lines.join("\n"), /Goal:/);
  assert.match(summary.lines.join("\n"), /Boundaries:/);
  assert.match(summary.lines.join("\n"), /Verification:/);
});

test("summarizeArtifact rejects full scheduler plans by default", () => {
  assert.throws(
    () => summarizeArtifact("docs/agents/schedules/plan.md", "# Scheduler Plan\n\n- DISPATCH: #1\n"),
    /Full Scheduler Plans are not mirrored by default/,
  );
});

test("buildMirrorComment supports durable memory proposal summaries", () => {
  const markdown = `# Durable Memory Proposal: Update workflow contract

## Rationale

Capture the review gate policy as durable memory.

## Target Files

- docs/agents/workflow.md
- ROADMAP.md

## Risk

- If accepted: durable memory may need another update.
- If rejected: operators may repeat the same decision manually.
`;

  const comment = buildMirrorComment({
    artifactPath: "docs/agents/memory-proposals/proposal.md",
    markdown,
    issue: "123",
  });

  assert.equal(comment.kind, "memory-proposal");
  assert.match(comment.body, /Artifact mirror from `proposal.md`/);
  assert.match(comment.body, /Durable memory proposal summary/);
  assert.match(comment.body, /Target files:/);
});

test("renderMirrorPlan prints dry-run target and no-post behavior", () => {
  const comment = {
    kind: "completion",
    body: "- Completion report summary",
  };

  const plan = renderMirrorPlan({
    artifactPath: "docs/agents/completions/issue-5.md",
    issue: "123",
    comment,
    apply: false,
  });

  assert.match(plan, /Mode: dry-run/);
  assert.match(plan, /Target: issue #123/);
  assert.match(plan, /No GitHub comment was posted/);
});
