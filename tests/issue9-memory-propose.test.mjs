import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  MEMORY_PROPOSAL_DIR,
  applyMemoryProposalToText,
  createMemoryProposal,
  decideMemoryProposal,
  getMemoryProposalPaths,
  markMemoryProposalApplied,
  memoryProposalMarker,
  renderMemoryProposalMarkdown,
  writeMemoryProposalArtifact,
} from "../scripts/lib/memory-proposals.mjs";

function makeInput(overrides = {}) {
  return {
    type: "workflow",
    title: "Record queue export fallback",
    rationale: "Operators need a durable note when local fallback behavior changes.",
    target_files: ["docs/agents/workflow.md", "CONTEXT.md"],
    suggested_text: "Document that local export artifacts are the fallback when GitHub is unavailable.",
    risk: {
      accept_if_accepted: "The durable memory could preserve a workflow that later needs refinement.",
      if_rejected: "Operators may repeat the same decision and lose the rationale for fallback behavior.",
    },
    ...overrides,
  };
}

test("createMemoryProposal normalizes valid proposal input", () => {
  const proposal = createMemoryProposal(makeInput(), {
    createdAt: "2026-05-14T15:30:00.000Z",
  });

  assert.equal(proposal.proposal_id, "2026-05-14-workflow-record-queue-export-fallback");
  assert.equal(proposal.type, "workflow");
  assert.equal(proposal.status, "proposed");
  assert.deepEqual(proposal.target_files, ["docs/agents/workflow.md", "CONTEXT.md"]);
  assert.equal(
    proposal.risk.accept_if_accepted,
    "The durable memory could preserve a workflow that later needs refinement.",
  );
});

test("createMemoryProposal rejects unsupported types and missing required fields", () => {
  assert.throws(() => createMemoryProposal(makeInput({ type: "note" })), /Unsupported memory proposal type/);
  assert.throws(() => createMemoryProposal(makeInput({ rationale: "   " })), /requires rationale/);
  assert.throws(() => createMemoryProposal(makeInput({ target_files: [] })), /at least one target file/);
  assert.throws(
    () => createMemoryProposal(makeInput({ risk: { accept_if_accepted: "", if_rejected: "" } })),
    /risk\.accept_if_accepted/,
  );
});

test("renderMemoryProposalMarkdown includes all review sections", () => {
  const proposal = createMemoryProposal(makeInput({ type: "adr" }), {
    createdAt: "2026-05-14T15:30:00.000Z",
  });

  const markdown = renderMemoryProposalMarkdown(proposal);

  assert.match(markdown, /# Durable Memory Proposal: Record queue export fallback/);
  assert.match(markdown, /## Rationale/);
  assert.match(markdown, /## Target Files/);
  assert.match(markdown, /## Suggested Text/);
  assert.match(markdown, /## Risk/);
  assert.match(markdown, /- If accepted:/);
  assert.match(markdown, /- If rejected:/);
});

test("writeMemoryProposalArtifact writes json and markdown under docs/agents/memory-proposals", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "autopocock-memory-"));
  const proposal = createMemoryProposal(makeInput({ type: "context" }), {
    createdAt: "2026-05-14T15:30:00.000Z",
  });

  const paths = getMemoryProposalPaths(cwd, proposal);
  const written = await writeMemoryProposalArtifact(cwd, proposal);
  const json = JSON.parse(await readFile(written.jsonPath, "utf8"));
  const markdown = await readFile(written.markdownPath, "utf8");

  assert.equal(path.relative(cwd, written.jsonPath), path.join(MEMORY_PROPOSAL_DIR, `${proposal.proposal_id}.json`));
  assert.equal(path.relative(cwd, written.markdownPath), path.join(MEMORY_PROPOSAL_DIR, `${proposal.proposal_id}.md`));
  assert.equal(written.jsonPath, paths.jsonPath);
  assert.equal(json.type, "context");
  assert.match(markdown, /Document that local export artifacts are the fallback/);
});

test("decideMemoryProposal records approval and rejection metadata", () => {
  const proposal = createMemoryProposal(makeInput(), {
    createdAt: "2026-05-14T15:30:00.000Z",
  });

  const approved = decideMemoryProposal(proposal, {
    decision: "approve",
    by: "solo-operator",
    reason: "This belongs in durable workflow memory.",
    decidedAt: "2026-05-14T16:00:00.000Z",
  });
  const rejected = decideMemoryProposal(proposal, {
    decision: "reject",
    by: "solo-operator",
    reason: "Not durable enough.",
    decidedAt: "2026-05-14T17:00:00.000Z",
  });

  assert.equal(approved.status, "approved");
  assert.equal(approved.decision.by, "solo-operator");
  assert.equal(rejected.status, "rejected");
  assert.match(renderMemoryProposalMarkdown(approved), /## Decision/);
});

test("applyMemoryProposalToText appends an idempotent marked block", () => {
  const proposal = decideMemoryProposal(createMemoryProposal(makeInput()), {
    decision: "approve",
    by: "solo-operator",
    reason: "Accepted.",
  });
  const first = applyMemoryProposalToText("# Workflow\n", proposal);
  const second = applyMemoryProposalToText(first.text, proposal);
  const marker = memoryProposalMarker(proposal.proposal_id);

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.match(first.text, new RegExp(marker.start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(first.text, /Document that local export artifacts are the fallback/);
});

test("markMemoryProposalApplied records application metadata only after approval", () => {
  const proposal = createMemoryProposal(makeInput());

  assert.throws(() => markMemoryProposalApplied(proposal, { appliedBy: "solo-operator" }), /must be approved/);

  const approved = decideMemoryProposal(proposal, {
    decision: "approve",
    by: "solo-operator",
    reason: "Accepted.",
  });
  const applied = markMemoryProposalApplied(approved, {
    appliedBy: "solo-operator",
    appliedAt: "2026-05-14T18:00:00.000Z",
    targetFiles: ["docs/agents/workflow.md"],
  });

  assert.equal(applied.status, "applied");
  assert.equal(applied.application.applied_by, "solo-operator");
  assert.match(renderMemoryProposalMarkdown(applied), /## Application/);
});
