import path from "node:path";
import { createHash } from "node:crypto";

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function sectionBody(markdown, heading) {
  const text = normalizeText(markdown);
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingMatch = new RegExp(`^##\\s+${escaped}\\s*$`, "m").exec(text);
  if (!headingMatch) {
    return "";
  }

  const start = headingMatch.index + headingMatch[0].length;
  const rest = text.slice(start).replace(/^\n+/, "");
  const nextHeadingIndex = rest.search(/^##\s+/m);
  if (nextHeadingIndex === -1) {
    return normalizeText(rest);
  }

  return normalizeText(rest.slice(0, nextHeadingIndex));
}

function extractBulletValue(body, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`^-\\s*${escaped}:\\s*(.*)$`, "mi"));
  return normalizeText(match?.[1] || "");
}

function extractNestedBulletItems(body, label) {
  const lines = normalizeText(body).split("\n");
  const target = `${label}:`.toLowerCase();
  const index = lines.findIndex((line) => line.trim().toLowerCase() === `- ${target}`);
  if (index === -1) {
    return [];
  }

  const items = [];
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    if (!line.trim()) {
      continue;
    }

    if (/^-\s+/.test(line)) {
      break;
    }

    const nestedMatch = line.match(/^\s*-\s+(.*)$/);
    if (nestedMatch) {
      items.push(normalizeText(nestedMatch[1]));
    }
  }

  return items.filter(Boolean);
}

function listFromValue(value) {
  const text = normalizeText(value);
  if (!text) {
    return [];
  }

  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean);
}

function clip(value, max = 280) {
  const text = normalizeText(value).replace(/\s+/g, " ");
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function classifyArtifact(markdown, artifactPath) {
  const text = normalizeText(markdown);
  const base = path.basename(artifactPath).toLowerCase();

  if (/^#\s+Scheduler Plan\b/m.test(text)) {
    return "scheduler-plan";
  }
  if (/^#\s+Context Handoff\b/m.test(text)) {
    return "handoff";
  }
  if (/^#\s+Prepared Human Step\b/m.test(text)) {
    return "hitl";
  }
  if (/^#\s+Completion Report\b/m.test(text)) {
    return "completion";
  }
  if (/^#\s+Review Prep\b/m.test(text)) {
    return "review-prep";
  }
  if (/^#\s+QA Checklist\b/m.test(text)) {
    return "qa-summary";
  }
  if (/^#\s+Durable Memory Proposal:/m.test(text)) {
    return "memory-proposal";
  }
  if (/^#\s+Feedback Summary\b/m.test(text) || base.includes("feedback")) {
    return "feedback-summary";
  }

  return "unknown";
}

function summarizeHandoff(markdown) {
  const goal = listFromValue(sectionBody(markdown, "Goal")).join(" ");
  const boundaries = sectionBody(markdown, "Boundaries");
  const verificationBody = sectionBody(markdown, "Verification");
  const inScope = extractNestedBulletItems(boundaries, "In scope");
  const outOfScope = extractNestedBulletItems(boundaries, "Out of scope");
  const automated = extractNestedBulletItems(verificationBody, "Automated");
  const manual = extractNestedBulletItems(verificationBody, "Manual");
  const evidence = extractNestedBulletItems(verificationBody, "Evidence expected");

  return [
    "Context handoff summary",
    goal && `Goal: ${clip(goal)}`,
    inScope.length > 0 && `In scope: ${clip(inScope.join(" | "))}`,
    outOfScope.length > 0 && `Out of scope: ${clip(outOfScope.join(" | "))}`,
    automated.length > 0 && `Automated verification: ${clip(automated.join(" | "))}`,
    manual.length > 0 && `Manual verification: ${clip(manual.join(" | "))}`,
    evidence.length > 0 && `Evidence expected: ${clip(evidence.join(" | "))}`,
  ].filter(Boolean);
}

function summarizeHitl(markdown) {
  const why = listFromValue(sectionBody(markdown, "Why This Is HITL")).join(" ");
  const steps = listFromValue(sectionBody(markdown, "What To Do"));
  const verify = listFromValue(sectionBody(markdown, "How To Verify"));

  return [
    "Prepared Human Step summary",
    why && `Reason: ${clip(why)}`,
    steps.length > 0 && `Steps: ${clip(steps.join(" | "))}`,
    verify.length > 0 && `Verification: ${clip(verify.join(" | "))}`,
  ].filter(Boolean);
}

function summarizeCompletion(markdown) {
  const resultBody = sectionBody(markdown, "Result");
  const summary = extractBulletValue(resultBody, "Summary");
  const status = extractBulletValue(resultBody, "Status");
  const changes = extractBulletValue(sectionBody(markdown, "Changes"), "Files or areas changed");
  const verification = sectionBody(markdown, "Verification");
  const commands = extractBulletValue(verification, "Commands run");
  const results = extractBulletValue(verification, "Results");
  const risks = extractBulletValue(sectionBody(markdown, "Risks"), "Residual risks");

  return [
    "Completion report summary",
    status && `Status: ${clip(status)}`,
    summary && `Summary: ${clip(summary)}`,
    changes && `Changed areas: ${clip(changes)}`,
    commands && `Verification commands: ${clip(commands)}`,
    results && `Verification results: ${clip(results)}`,
    risks && `Residual risks: ${clip(risks)}`,
  ].filter(Boolean);
}

function summarizeReviewPrep(markdown) {
  const boundary = sectionBody(markdown, "Boundary Check");
  const acceptance = sectionBody(markdown, "Acceptance Criteria Check");
  const verification = sectionBody(markdown, "Verification Check");
  const risks = sectionBody(markdown, "Risk Summary");

  return [
    "Review Prep summary",
    `Changed areas: ${clip(extractBulletValue(boundary, "Changed areas"))}`,
    `Criteria addressed: ${clip(extractBulletValue(acceptance, "Criteria addressed"))}`,
    `Verification: ${clip(extractBulletValue(verification, "Results"))}`,
    `Risks: ${clip(extractBulletValue(risks, "Residual risks"))}`,
  ].filter((line) => !line.endsWith(": "));
}

function summarizeQa(markdown) {
  const warningsBody = sectionBody(markdown, "Warnings");
  const checksBody = sectionBody(markdown, "Targeted QA Checks");
  const focusBody = sectionBody(markdown, "Focus Areas");

  return [
    "Targeted QA summary",
    warningsBody && `Warnings: ${clip(listFromValue(warningsBody).join(" | "))}`,
    checksBody && `Checks: ${clip(listFromValue(checksBody).join(" | "))}`,
    focusBody && `Focus areas: ${clip(listFromValue(focusBody).slice(0, 3).join(" | "))}`,
  ].filter(Boolean);
}

function summarizeFeedback(markdown) {
  return [
    "Feedback summary",
    clip(markdown, 500),
  ];
}

function summarizeMemoryProposal(markdown) {
  const rationale = sectionBody(markdown, "Rationale");
  const targets = sectionBody(markdown, "Target Files");
  const risk = sectionBody(markdown, "Risk");

  return [
    "Durable memory proposal summary",
    rationale && `Rationale: ${clip(rationale)}`,
    targets && `Target files: ${clip(listFromValue(targets).join(" | "))}`,
    risk && `Risk: ${clip(listFromValue(risk).join(" | "))}`,
  ].filter(Boolean);
}

export function summarizeArtifact(artifactPath, markdown) {
  const kind = classifyArtifact(markdown, artifactPath);

  if (kind === "scheduler-plan") {
    throw new Error("Full Scheduler Plans are not mirrored by default.");
  }

  const summaries = {
    handoff: summarizeHandoff,
    hitl: summarizeHitl,
    completion: summarizeCompletion,
    "review-prep": summarizeReviewPrep,
    "qa-summary": summarizeQa,
    "feedback-summary": summarizeFeedback,
    "memory-proposal": summarizeMemoryProposal,
  };

  const summarizer = summaries[kind];
  if (!summarizer) {
    throw new Error(`Unsupported artifact type for mirroring: ${kind}.`);
  }

  return {
    kind,
    lines: summarizer(markdown),
  };
}

export function mirrorCommentMarker({ artifactPath, kind }) {
  const normalizedPath = String(artifactPath || "").replace(/\\/g, "/");
  const digest = createHash("sha256").update(normalizedPath).digest("hex").slice(0, 16);
  return `<!-- autopocock:artifact-mirror:${kind}:${digest} -->`;
}

export function findMirroredComment(comments, marker) {
  return (comments || []).find((comment) => String(comment?.body || "").includes(marker)) || null;
}

export function buildMirrorComment({ artifactPath, markdown, issue, pr }) {
  if (!artifactPath) {
    throw new Error("Mirror requires --artifact.");
  }

  if (!issue && !pr) {
    throw new Error("Mirror requires either --issue or --pr.");
  }

  if (issue && pr) {
    throw new Error("Mirror expects only one target: either --issue or --pr.");
  }

  const summary = summarizeArtifact(artifactPath, markdown);
  const target = issue ? { type: "issue", id: issue } : { type: "pr", id: pr };
  const marker = mirrorCommentMarker({ artifactPath, kind: summary.kind });
  const body = [
    marker,
    `Artifact mirror from \`${path.basename(artifactPath)}\``,
    "",
    ...summary.lines.map((line) => `- ${line}`),
  ].join("\n");

  return {
    target,
    kind: summary.kind,
    marker,
    body,
  };
}

export function renderMirrorPlan({ artifactPath, issue, pr, comment, apply = false, updateExisting = false }) {
  const targetLabel = issue ? `issue #${issue}` : `PR #${pr}`;
  return `# Artifact Mirror

Mode: ${apply ? "apply" : "dry-run"}
Artifact: ${artifactPath}
Target: ${targetLabel}
Type: ${comment.kind}
Mirror marker: ${comment.marker || "none"}
Existing comment behavior: ${updateExisting ? "update matching mirror comment when present" : "post a new comment"}

## Comment Body

${comment.body}

${apply ? "GitHub comment posting requires explicit apply behavior." : "No GitHub comment was posted."}
`;
}
