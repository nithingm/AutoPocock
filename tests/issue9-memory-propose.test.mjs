import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  MEMORY_PROPOSAL_DIR,
  createMemoryProposal,
  getMemoryProposalPaths,
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
