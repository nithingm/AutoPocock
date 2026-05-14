const PLACEHOLDER_PATTERN = /(?:^|\b)(?:tbd|todo|unknown|unclear|n\/a|na|not provided)(?:\b|$)/i;
const ISSUE_IDENTIFIER_PATTERN = /^(?:#?\d+|[a-z][a-z0-9]+-\d+|issue[-\s#]*\d+)$/i;
const PR_IDENTIFIER_PATTERN = /^(?:#?\d+|pr[-\s#]*\d+|https?:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+)$|^gh-\d+$/i;

function normalizeText(value) {
  if (value == null) {
    return "";
  }

  return String(value).replace(/\r\n/g, "\n").trim();
}

function normalizeList(value) {
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

function collectArtifact(label, artifact) {
  if (!artifact) {
    return {
      label,
      found: false,
      path: "",
      content: "",
    };
  }

  if (typeof artifact === "string") {
    return {
      label,
      found: true,
      path: artifact,
      content: "",
    };
  }

  return {
    label,
    found: true,
    path: normalizeText(artifact.path),
    content: normalizeText(artifact.content),
  };
}

function artifactSummary(artifact) {
  return artifact.path || `${artifact.label} present`;
}

function hasPlaceholder(text) {
  return PLACEHOLDER_PATTERN.test(normalizeText(text));
}

function hasSection(content, headings) {
  if (!content) {
    return false;
  }

  return headings.some((heading) => new RegExp(`^##\\s+${heading}\\b`, "im").test(content));
}

function inspectArtifactClarity(artifact, kind) {
  const reasons = [];
  const content = artifact.content;

  if (!artifact.found || !content) {
    return reasons;
  }

  if (content.length < 120) {
    reasons.push(`${kind} artifact is too short to support strict QA.`);
  }

  if (hasPlaceholder(content)) {
    reasons.push(`${kind} artifact still contains placeholder language.`);
  }

  if (kind === "Handoff") {
    if (!hasSection(content, ["Goal", "Outcome", "Objective"])) {
      reasons.push("Handoff artifact is missing a goal or outcome section.");
    }
    if (!hasSection(content, ["Boundaries", "Scope"])) {
      reasons.push("Handoff artifact is missing boundaries or scope.");
    }
  }

  if (kind === "Completion Report") {
    if (!hasSection(content, ["Changes", "Result"])) {
      reasons.push("Completion Report is missing a changes or result section.");
    }
    if (!hasSection(content, ["Verification", "Evidence"])) {
      reasons.push("Completion Report is missing verification evidence.");
    }
  }

  return reasons;
}

function summarizeCommits(commits) {
  return commits.map((commit) => ({
    sha: normalizeText(commit.sha || commit.shortSha),
    subject: normalizeText(commit.subject),
    files: normalizeList(commit.files),
  }));
}

function deriveSliceSignals({ handoff, completion, changedFiles, recentCommits }) {
  const signals = [
    ...inspectArtifactClarity(handoff, "Handoff"),
    ...inspectArtifactClarity(completion, "Completion Report"),
  ];

  const normalizedChangedFiles = normalizeList(changedFiles);
  const commitSummaries = summarizeCommits(recentCommits);
  const uniqueCommitFiles = [...new Set(commitSummaries.flatMap((commit) => commit.files))];
  const uniqueFiles = [...new Set([...normalizedChangedFiles, ...uniqueCommitFiles])];
  const topLevelAreas = [...new Set(uniqueFiles.map((file) => normalizeText(file).split(/[\\/]/)[0]).filter(Boolean))];

  if (uniqueFiles.length >= 12) {
    signals.push(`Change set touches ${uniqueFiles.length} files, which is too broad for strict targeted QA.`);
  }

  if (commitSummaries.length >= 5) {
    signals.push(`Recent work spans ${commitSummaries.length} commits; slice the work before strict QA.`);
  }

  if (topLevelAreas.length >= 4) {
    signals.push(`Change set spans ${topLevelAreas.length} top-level areas, which suggests unclear scope.`);
  }

  if (commitSummaries.some((commit) => !commit.subject || hasPlaceholder(commit.subject))) {
    signals.push("Recent commits contain unclear subjects, so QA should request slicing.");
  }

  return signals;
}

export function validateTargetedQa(input = {}) {
  const manual = Boolean(input.manual);
  const strict = !manual;
  const issue = normalizeText(input.issue);
  const pr = normalizeText(input.pr);
  const handoff = collectArtifact("Handoff Artifact", input.handoffArtifact || input.artifacts?.handoff);
  const completion = collectArtifact("Completion Report", input.completionReport || input.artifacts?.completion);
  const reviewPrep = collectArtifact("Review Prep", input.reviewPrep || input.artifacts?.reviewPrep);
  const errors = [];
  const warnings = [];

  if (strict) {
    if (!issue || !ISSUE_IDENTIFIER_PATTERN.test(issue)) {
      errors.push("Strict targeted QA requires a valid issue identifier.");
    }

    if (!pr || !PR_IDENTIFIER_PATTERN.test(pr)) {
      errors.push("Strict targeted QA requires a valid PR identifier.");
    }
  } else {
    if (!issue || !ISSUE_IDENTIFIER_PATTERN.test(issue)) {
      warnings.push("Manual mode bypassed strict issue identifier validation.");
    }

    if (!pr || !PR_IDENTIFIER_PATTERN.test(pr)) {
      warnings.push("Manual mode bypassed strict PR identifier validation.");
    }
  }

  if (!handoff.found) {
    const message = "Missing required Handoff Artifact for targeted QA.";
    if (strict) {
      errors.push(message);
    } else {
      warnings.push(`${message} Manual mode allowed QA to continue.`);
    }
  }

  if (!completion.found) {
    const message = "Missing required Completion Report for targeted QA.";
    if (strict) {
      errors.push(message);
    } else {
      warnings.push(`${message} Manual mode allowed QA to continue.`);
    }
  }

  if (!reviewPrep.found) {
    warnings.push("Missing Review Prep artifact.");
  }

  const sliceSignals = deriveSliceSignals({
    handoff,
    completion,
    changedFiles: input.changedFiles,
    recentCommits: input.recentCommits || [],
  });

  const needsSlicing = sliceSignals.length > 0;
  if (needsSlicing) {
    warnings.push(...sliceSignals);
  }

  const status = errors.length > 0 ? "fail" : needsSlicing ? "needs-slicing" : "pass";
  const foundArtifacts = [handoff, completion, reviewPrep]
    .filter((artifact) => artifact.found)
    .map((artifact) => `${artifact.label}: ${artifactSummary(artifact)}`);

  return {
    ok: status === "pass",
    status,
    strict,
    manual,
    issue,
    pr,
    errors,
    warnings,
    needsSlicing,
    sliceSignals,
    artifacts: {
      handoff,
      completion,
      reviewPrep,
    },
    checklistContext: {
      mode: strict ? "strict-targeted" : "manual-targeted",
      issue: issue || "missing",
      pr: pr || "missing",
      foundArtifacts,
      warnings: [...warnings],
      requiredArtifactsReady: handoff.found && completion.found,
      reviewPrepReady: reviewPrep.found,
      needsSlicing,
    },
  };
}

export function renderTargetedQaChecklistContext(result) {
  const validation = result?.checklistContext ? result : validateTargetedQa(result);
  const context = validation.checklistContext;
  const foundArtifacts =
    context.foundArtifacts.length > 0
      ? context.foundArtifacts.map((line) => `- ${line}`).join("\n")
      : "- None";
  const warningLines =
    context.warnings.length > 0
      ? context.warnings.map((line) => `- ${line}`).join("\n")
      : "- None";

  return `## Targeted QA Context

- Mode: ${context.mode}
- Issue: ${context.issue}
- PR: ${context.pr}
- Required artifacts ready: ${context.requiredArtifactsReady ? "yes" : "no"}
- Review Prep ready: ${context.reviewPrepReady ? "yes" : "no"}
- QA status: ${validation.status}
- Needs slicing: ${context.needsSlicing ? "yes" : "no"}

### Found Artifacts

${foundArtifacts}

### Warnings

${warningLines}
`;
}

export const qaTargetedInternals = {
  ISSUE_IDENTIFIER_PATTERN,
  PR_IDENTIFIER_PATTERN,
  PLACEHOLDER_PATTERN,
};
