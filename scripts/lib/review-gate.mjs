const PLACEHOLDER_PATTERN = /^(?:tbd|todo|n\/a|na|unknown|not provided)$/i;
function normalizeText(value) {
  if (value == null) {
    return "";
  }

  return String(value).replace(/\r\n/g, "\n").trim();
}

function splitList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }

  const text = normalizeText(value);
  if (!text) {
    return [];
  }

  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);
}

function hasExplicitValue(value) {
  const text = normalizeText(value);
  if (!text) {
    return false;
  }

  return !PLACEHOLDER_PATTERN.test(text);
}

function normalizeExplicitField(value) {
  const text = normalizeText(value);
  if (!text || PLACEHOLDER_PATTERN.test(text)) {
    return "";
  }

  return text;
}

function normalizeExplicitList(value) {
  const items = splitList(value).filter((item) => !PLACEHOLDER_PATTERN.test(item));
  if (items.length > 0) {
    return items;
  }

  const text = normalizeExplicitField(value);
  if (!text) {
    return [];
  }

  return [text];
}

function preferList(...values) {
  for (const value of values) {
    const items = normalizeExplicitList(value);
    if (items.length > 0) {
      return items;
    }
  }

  return [];
}

function collectLists(...values) {
  return values.flatMap((value) => normalizeExplicitList(value));
}

function preferField(...values) {
  for (const value of values) {
    const text = normalizeExplicitField(value);
    if (text) {
      return text;
    }
  }

  return "";
}

function formatList(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function parseBullets(sectionBody) {
  const bullets = {};
  const lines = normalizeText(sectionBody).split("\n");

  for (const line of lines) {
    const match = line.match(/^\s*-\s*([^:]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1].trim().toLowerCase().replace(/\s+/g, "_");
    bullets[key] = match[2].trim();
  }

  return bullets;
}

function normalizeKey(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function parseCompletionReport(markdown) {
  const text = normalizeText(markdown);
  if (!text) {
    return {
      result: {},
      changes: {},
      verification: {},
      risks: {},
      followUps: {},
      artifacts: {},
      nextStage: {},
      issue: {},
    };
  }

  const sections = {};
  const lines = text.split("\n");
  let currentHeading = "";
  let currentBody = [];

  const flushSection = () => {
    if (!currentHeading) {
      return;
    }

    sections[currentHeading] = parseBullets(currentBody.join("\n"));
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      flushSection();
      currentHeading = normalizeKey(headingMatch[1]);
      currentBody = [];
      continue;
    }

    currentBody.push(line);
  }

  flushSection();

  return {
    result: sections.result || {},
    changes: sections.changes || {},
    verification: sections.verification || {},
    risks: sections.risks || {},
    followUps: sections.follow_ups || {},
    artifacts: sections.artifacts || {},
    nextStage: sections.next_stage || {},
    issue: sections.issue || {},
  };
}

function makeMissingMessage(label) {
  return `Missing Review Entry input: ${label}.`;
}

function isExplicitlyAddressedList(items) {
  return items.length > 0;
}

function isExplicitlyAddressedField(value) {
  return hasExplicitValue(value);
}

export function validateReviewEntryGate(input = {}) {
  const parsedReport =
    input.parsedCompletionReport || parseCompletionReport(input.completionReportMarkdown || "");

  const acceptanceCriteria = preferList(
    input.acceptanceCriteria,
    input.acceptance,
  );
  const changedAreas = preferList(
    input.changedAreas,
    parsedReport.changes.files_or_areas_changed,
  );
  const dependencyChanges = preferList(input.dependencyChanges);
  const localRefactors = preferList(input.localRefactors);
  const verificationCommands = preferList(
    input.verificationCommands,
    parsedReport.verification.commands_run,
  );
  const verificationResults = preferField(
    input.verificationResults,
    parsedReport.verification.results,
  );
  const verificationGaps = preferField(
    input.verificationGaps,
    input.gaps,
    parsedReport.verification.gaps,
  );
  const risks = preferList(
    input.risks,
    parsedReport.risks.residual_risks,
  );
  const followUps = collectLists(
    input.followUps,
    parsedReport.followUps.bugs,
    parsedReport.followUps.issues,
  );

  const normalized = {
    issue: preferField(input.issue, parsedReport.issue.tracker) || "TBD",
    pr: preferField(input.pr),
    acceptanceCriteria,
    changedAreas,
    dependencyChanges,
    localRefactors,
    verificationCommands,
    verificationResults,
    verificationGaps,
    risks,
    followUps,
  };

  const missingInputs = [];
  if (!isExplicitlyAddressedList(normalized.acceptanceCriteria)) {
    missingInputs.push("acceptance criteria");
  }
  if (!isExplicitlyAddressedList(normalized.changedAreas)) {
    missingInputs.push("changed areas");
  }
  if (!isExplicitlyAddressedList(normalized.dependencyChanges)) {
    missingInputs.push("dependency changes");
  }
  if (!isExplicitlyAddressedList(normalized.localRefactors)) {
    missingInputs.push("local refactors");
  }
  if (!isExplicitlyAddressedList(normalized.verificationCommands) || !isExplicitlyAddressedField(normalized.verificationResults)) {
    missingInputs.push("verification");
  }
  if (!isExplicitlyAddressedField(normalized.verificationGaps)) {
    missingInputs.push("gaps");
  }
  if (!isExplicitlyAddressedList(normalized.risks)) {
    missingInputs.push("risks");
  }
  if (!isExplicitlyAddressedList(normalized.followUps)) {
    missingInputs.push("follow-ups");
  }

  return {
    ok: missingInputs.length === 0,
    canGenerateReviewPrep: missingInputs.length === 0,
    missingInputs,
    messages: missingInputs.map(makeMissingMessage),
    parsedCompletionReport: parsedReport,
    reviewEntry: normalized,
  };
}

export function generateReviewPrepMarkdown(validationResult) {
  if (!validationResult?.ok) {
    const details = (validationResult?.messages || []).join("\n");
    throw new Error(details || "Review Entry Gate failed.");
  }

  const entry = validationResult.reviewEntry;
  const prLine = entry.pr ? `- PR: ${entry.pr}` : "- PR: TBD";

  return `# Review Prep

## Issue And PR

- Issue: ${entry.issue}
${prLine}
- Current stage: Human Review

## Boundary Check

- Changed areas:
${formatList(entry.changedAreas)}
- Dependency changes:
${formatList(entry.dependencyChanges)}
- Local refactors:
${formatList(entry.localRefactors)}

## Acceptance Criteria Check

- Criteria addressed:
${formatList(entry.acceptanceCriteria)}

## Verification Check

- Commands reported:
${formatList(entry.verificationCommands)}
- Results: ${entry.verificationResults}
- Gaps: ${entry.verificationGaps}

## Risk Summary

- Residual risks:
${formatList(entry.risks)}
- Follow-ups:
${formatList(entry.followUps)}

## Suggested Review Outcome

- Suggested next stage: Human Review
- Reason: Review Entry Gate passed with explicit acceptance, verification, boundary, and risk coverage.

## Solo Operator Decisions Needed

- Same-PR fix decision: Required if review findings suggest a fix should stay on this PR.
- Memory update decision: Required if the change implies Durable Memory updates.
- Merge decision: Required after Human Review and QA complete.
`;
}

export function buildReviewPrep(input = {}) {
  const validation = validateReviewEntryGate(input);
  return {
    ...validation,
    markdown: validation.ok ? generateReviewPrepMarkdown(validation) : "",
  };
}

export const reviewGateInternals = {
  PLACEHOLDER_PATTERN,
};
