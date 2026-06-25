import assert from "node:assert/strict";
import { test } from "node:test";

import { buildMirrorComment, renderMirrorPlan, summarizeArtifact } from "../scripts/lib/artifact-mirror.mjs";

test("summarizeArtifact produces a bounded handoff summary", () => {
  const markdown = `# Context Handoff

## Goal

- One sentence outcome: Ship selective artifact mirroring.

## Boundaries

- In scope:
  - mirror handoffs and completions
  - keep comments decision-useful
- Out of scope:
  - full scheduler plans

## Verification

- Automated:
  - node --test
- Manual:
  - inspect dry-run output
- Evidence expected:
  - comment body contains meaningful summary lines
`;

  const summary = summarizeArtifact("docs/agents/handoffs/issue-5.md", markdown);

  assert.equal(summary.kind, "handoff");
  assert.match(summary.lines.join("\n"), /Context handoff summary/);
  assert.match(summary.lines.join("\n"), /Goal:/);
  assert.match(summary.lines.join("\n"), /In scope: .*mirror handoffs and completions/);
  assert.match(summary.lines.join("\n"), /Out of scope: .*full scheduler plans/);
  assert.match(summary.lines.join("\n"), /Automated verification: .*node --test/);
  assert.match(summary.lines.join("\n"), /Manual verification: .*inspect dry-run output/);
  assert.match(summary.lines.join("\n"), /Evidence expected: .*meaningful summary lines/);
});

test("summarizeArtifact preserves nested handoff details from the tracer-bullet handoff shape", () => {
  const markdown = `# Context Handoff

## Goal

- Deliver one thin, demoable end-to-end path.

## Boundaries

- In scope:
  - Define the smallest real vertical slice.
  - Reuse the existing workflow where possible.
- Out of scope:
  - Full workflow-console UI work.
  - Multi-provider support.

## Verification

- Automated:
  - Add or update tests for the tracer-bullet flow.
  - Cover one bounded launch-planning path.
- Manual:
  - Run the documented tracer-bullet path.
- Evidence expected:
  - Commands run and results
  - Paths to generated artifacts
`;

  const summary = summarizeArtifact("docs/agents/handoffs/issue-23.md", markdown);

  assert.match(summary.lines.join("\n"), /In scope: .*smallest real vertical slice/);
  assert.match(summary.lines.join("\n"), /Out of scope: .*Full workflow-console UI work/);
  assert.match(summary.lines.join("\n"), /Automated verification: .*Add or update tests/);
  assert.match(summary.lines.join("\n"), /Manual verification: .*Run the documented tracer-bullet path/);
  assert.match(summary.lines.join("\n"), /Evidence expected: .*Paths to generated artifacts/);
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
