import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const MEMORY_PROPOSAL_DIR = path.join("docs", "agents", "memory-proposals");
export const MEMORY_PROPOSAL_TYPES = Object.freeze(["context", "adr", "workflow", "roadmap"]);

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Memory proposal requires ${fieldName}.`);
  }
  return value.trim();
}

function normalizeTargetFiles(targetFiles) {
  if (!Array.isArray(targetFiles) || targetFiles.length === 0) {
    throw new Error("Memory proposal requires at least one target file.");
  }

  return targetFiles.map((targetFile, index) =>
    assertNonEmptyString(targetFile, `target_files[${index}]`),
  );
}

function normalizeRisk(risk) {
  if (!risk || typeof risk !== "object" || Array.isArray(risk)) {
    throw new Error("Memory proposal requires risk.accept_if_accepted and risk.if_rejected.");
  }

  return {
    accept_if_accepted: assertNonEmptyString(risk.accept_if_accepted, "risk.accept_if_accepted"),
    if_rejected: assertNonEmptyString(risk.if_rejected, "risk.if_rejected"),
  };
}

export function createMemoryProposal(input, options = {}) {
  const type = assertNonEmptyString(input?.type, "type").toLowerCase();

  if (!MEMORY_PROPOSAL_TYPES.includes(type)) {
    throw new Error(
      `Unsupported memory proposal type "${type}". Expected one of: ${MEMORY_PROPOSAL_TYPES.join(", ")}.`,
    );
  }

  const title = assertNonEmptyString(input?.title, "title");
  const createdAt = options.createdAt || new Date().toISOString();
  const date = createdAt.slice(0, 10);
  const slug = slugify(options.slug || `${type}-${title}`) || `${type}-proposal`;
  const proposalId = options.proposalId || `${date}-${slug}`;

  return {
    proposal_id: proposalId,
    type,
    title,
    rationale: assertNonEmptyString(input?.rationale, "rationale"),
    target_files: normalizeTargetFiles(input?.target_files),
    suggested_text: assertNonEmptyString(input?.suggested_text, "suggested_text"),
    risk: normalizeRisk(input?.risk),
    status: "proposed",
    created_at: createdAt,
  };
}

export function renderMemoryProposalMarkdown(proposal) {
  const decision = proposal.decision;
  const application = proposal.application;
  const decisionSection = decision
    ? `
## Decision

- Decision: ${decision.decision}
- By: ${decision.by}
- At: ${decision.at}
- Reason: ${decision.reason}
`
    : "";
  const applicationSection = application
    ? `
## Application

- Applied at: ${application.applied_at}
- Applied by: ${application.applied_by}
- Target files:
${application.target_files.map((targetFile) => `  - ${targetFile}`).join("\n")}
`
    : "";

  return `# Durable Memory Proposal: ${proposal.title}

- Proposal ID: ${proposal.proposal_id}
- Type: ${proposal.type}
- Status: ${proposal.status}
- Created At: ${proposal.created_at}

## Rationale

${proposal.rationale}

## Target Files

${proposal.target_files.map((targetFile) => `- ${targetFile}`).join("\n")}

## Suggested Text

${proposal.suggested_text}

## Risk

- If accepted: ${proposal.risk.accept_if_accepted}
- If rejected: ${proposal.risk.if_rejected}
${decisionSection}${applicationSection}
`;
}

export function decideMemoryProposal(proposalInput, { decision, by, reason = "", decidedAt = new Date().toISOString() } = {}) {
  const normalizedDecision = assertNonEmptyString(decision, "decision").toLowerCase();
  if (!["approve", "reject"].includes(normalizedDecision)) {
    throw new Error('Memory proposal decision must be "approve" or "reject".');
  }

  if (proposalInput.status === "applied") {
    throw new Error(`Memory proposal ${proposalInput.proposal_id} is already applied.`);
  }

  const byValue = assertNonEmptyString(by, "by");
  const reasonValue = assertNonEmptyString(reason, "reason");

  return {
    ...proposalInput,
    status: normalizedDecision === "approve" ? "approved" : "rejected",
    decision: {
      decision: normalizedDecision,
      by: byValue,
      at: decidedAt,
      reason: reasonValue,
    },
  };
}

export function memoryProposalMarker(proposalId) {
  return {
    start: `<!-- memory-proposal:${proposalId} -->`,
    end: `<!-- /memory-proposal:${proposalId} -->`,
  };
}

export function applyMemoryProposalToText(existingText, proposal) {
  if (proposal.status !== "approved") {
    throw new Error(`Memory proposal ${proposal.proposal_id} must be approved before apply.`);
  }

  const marker = memoryProposalMarker(proposal.proposal_id);
  if (existingText.includes(marker.start)) {
    return { text: existingText, changed: false };
  }

  const suffix = existingText.endsWith("\n") ? "" : "\n";
  const block = [
    "",
    marker.start,
    proposal.suggested_text,
    marker.end,
    "",
  ].join("\n");

  return {
    text: `${existingText}${suffix}${block}`,
    changed: true,
  };
}

export function markMemoryProposalApplied(proposalInput, {
  appliedBy,
  appliedAt = new Date().toISOString(),
  targetFiles = proposalInput.target_files,
} = {}) {
  if (proposalInput.status !== "approved") {
    throw new Error(`Memory proposal ${proposalInput.proposal_id} must be approved before apply.`);
  }

  return {
    ...proposalInput,
    status: "applied",
    application: {
      applied_by: assertNonEmptyString(appliedBy, "appliedBy"),
      applied_at: appliedAt,
      target_files: normalizeTargetFiles(targetFiles),
    },
  };
}

export function getMemoryProposalPaths(cwd, proposal) {
  const dir = path.join(cwd, MEMORY_PROPOSAL_DIR);
  return {
    dir,
    jsonPath: path.join(dir, `${proposal.proposal_id}.json`),
    markdownPath: path.join(dir, `${proposal.proposal_id}.md`),
  };
}

export async function writeMemoryProposalArtifact(cwd, proposal, fileOps = { mkdir, writeFile }) {
  const { dir, jsonPath, markdownPath } = getMemoryProposalPaths(cwd, proposal);

  await fileOps.mkdir(dir, { recursive: true });
  await fileOps.writeFile(jsonPath, `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
  await fileOps.writeFile(markdownPath, renderMemoryProposalMarkdown(proposal), "utf8");

  return { jsonPath, markdownPath };
}
