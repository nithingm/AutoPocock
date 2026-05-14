function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Feedback classification requires ${fieldName}.`);
  }

  return value.trim();
}

function normalizeTrackerRef(value, fieldName) {
  const normalized = assertNonEmptyString(value, fieldName).replace(/^#/, "");

  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Feedback classification requires numeric ${fieldName}.`);
  }

  return normalized;
}

function linesFromSection(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function firstNonEmptySection(sections, ...keys) {
  for (const key of keys) {
    const values = sections[key];
    if (values?.length) {
      return values;
    }
  }

  return [];
}

function parseFindingSections(finding) {
  const aliases = new Map([
    ["evidence", "evidence"],
    ["expected", "expected_behavior"],
    ["expected behavior", "expected_behavior"],
    ["actual", "actual_behavior"],
    ["actual behavior", "actual_behavior"],
    ["verification", "verification_notes"],
    ["verification notes", "verification_notes"],
    ["notes", "verification_notes"],
    ["title", "title"],
  ]);

  const sections = {
    evidence: [],
    expected_behavior: [],
    actual_behavior: [],
    verification_notes: [],
    title: [],
  };

  let currentKey = null;

  for (const rawLine of String(finding).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const headingMatch = line.match(/^([A-Za-z ]+):\s*(.*)$/);
    if (headingMatch) {
      const [, rawKey, rest] = headingMatch;
      const sectionKey = aliases.get(rawKey.toLowerCase().trim());
      if (sectionKey) {
        currentKey = sectionKey;
        if (rest.trim()) {
          sections[sectionKey].push(rest.trim());
        }
        continue;
      }
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    const value = bulletMatch ? bulletMatch[1].trim() : line;

    if (currentKey) {
      sections[currentKey].push(value);
      continue;
    }

    if (sections.evidence.length === 0) {
      sections.evidence.push(value);
    } else {
      sections.verification_notes.push(value);
    }
  }

  return sections;
}

function buildBugTitle(actualBehavior) {
  const firstLine = actualBehavior[0] || "QA defect requires follow-up";
  const compact = firstLine.replace(/[.]+$/, "").trim();
  return compact.slice(0, 100);
}

function inferKind(finding) {
  const text = finding.toLowerCase();
  const samePrSignals = [
    /\btypo\b/,
    /\bcopy\b/,
    /\bwording\b/,
    /\bgrammar\b/,
    /\bformat(?:ting)?\b/,
    /\blabel\b/,
    /\bminor\b/,
    /\bnit\b/,
    /\bsmall ui\b/,
    /\bsame-pr\b/,
    /\bsame pr\b/,
  ];
  const bugSignals = [
    /\bbug\b/,
    /\bregression\b/,
    /\bcrash\b/,
    /\berror\b/,
    /\bfail(?:s|ed|ing)?\b/,
    /\bbroken\b/,
    /\bmissing\b/,
    /\bincorrect\b/,
    /\bwrong\b/,
    /\bexception\b/,
    /\b500\b/,
    /\b404\b/,
    /\bdata loss\b/,
    /\bscope\b/,
    /\bacceptance criteria\b/,
    /\barchitecture\b/,
    /\bproduct intent\b/,
    /\bnew issue\b/,
  ];

  const hasSamePrSignal = samePrSignals.some((pattern) => pattern.test(text));
  const hasBugSignal = bugSignals.some((pattern) => pattern.test(text));

  if (hasSamePrSignal && !hasBugSignal) {
    return "same-pr-fix";
  }

  return "new-bug-draft";
}

export function classifyFeedback(input) {
  const issue = normalizeTrackerRef(input?.issue, "issue");
  const pr = normalizeTrackerRef(input?.pr, "pr");
  const finding = assertNonEmptyString(input?.finding, "finding");
  const sections = parseFindingSections(finding);
  const evidence = firstNonEmptySection(sections, "evidence");
  const expectedBehavior = firstNonEmptySection(sections, "expected_behavior");
  const actualBehavior = firstNonEmptySection(sections, "actual_behavior", "evidence");
  const verificationNotes = firstNonEmptySection(sections, "verification_notes");
  const kind = inferKind(finding);

  if (kind === "same-pr-fix") {
    return {
      kind,
      issue,
      pr,
      finding,
      decision_basis:
        "Classified as a Same-PR Fix candidate because the finding reads like a minor correction and does not clearly expand scope.",
      requires_solo_operator_approval: true,
      candidate_fix: {
        original_issue: `#${issue}`,
        original_pr: `#${pr}`,
        evidence,
        expected_behavior: expectedBehavior,
        actual_behavior: actualBehavior,
        verification_notes: verificationNotes,
      },
      mode: "dry-run",
    };
  }

  return {
    kind,
    issue,
    pr,
    finding,
    decision_basis:
      "Classified as a new bug draft because Same-PR Fix should remain a narrow exception and this finding needs tracked follow-up by default.",
    bug_draft: {
      title: buildBugTitle(actualBehavior),
      original_issue: `#${issue}`,
      original_pr: `#${pr}`,
      evidence: evidence.length ? evidence : linesFromSection(finding),
      expected_behavior: expectedBehavior,
      actual_behavior: actualBehavior,
      verification_notes: verificationNotes,
    },
    mode: "dry-run",
  };
}

export function renderFeedbackClassification(result) {
  const lines = [
    "# Feedback Classification",
    "",
    "- Mode: dry-run",
    `- Original issue: #${result.issue}`,
    `- Original PR: #${result.pr}`,
    `- Classification: ${result.kind}`,
    "",
    "## Decision Basis",
    "",
    result.decision_basis,
    "",
  ];

  if (result.kind === "same-pr-fix") {
    lines.push("## Same-PR Fix Candidate", "");
    lines.push("- Solo Operator approval required: yes");
    lines.push(`- Original issue: ${result.candidate_fix.original_issue}`);
    lines.push(`- Original PR: ${result.candidate_fix.original_pr}`);

    if (result.candidate_fix.evidence.length) {
      lines.push("", "### Evidence", "", ...result.candidate_fix.evidence.map((item) => `- ${item}`));
    }

    if (result.candidate_fix.expected_behavior.length) {
      lines.push("", "### Expected Behavior", "", ...result.candidate_fix.expected_behavior.map((item) => `- ${item}`));
    }

    if (result.candidate_fix.actual_behavior.length) {
      lines.push("", "### Actual Behavior", "", ...result.candidate_fix.actual_behavior.map((item) => `- ${item}`));
    }

    if (result.candidate_fix.verification_notes.length) {
      lines.push(
        "",
        "### Verification Notes",
        "",
        ...result.candidate_fix.verification_notes.map((item) => `- ${item}`),
      );
    }

    lines.push("", "No GitHub issue or comment was created.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("## New Bug Draft", "");
  lines.push(`- Title: ${result.bug_draft.title}`);
  lines.push(`- Links back to original issue: ${result.bug_draft.original_issue}`);
  lines.push(`- Links back to original PR: ${result.bug_draft.original_pr}`);
  lines.push("", "### Evidence", "", ...result.bug_draft.evidence.map((item) => `- ${item}`));
  lines.push("", "### Expected Behavior", "", ...result.bug_draft.expected_behavior.map((item) => `- ${item}`));
  lines.push("", "### Actual Behavior", "", ...result.bug_draft.actual_behavior.map((item) => `- ${item}`));
  lines.push(
    "",
    "### Verification Notes",
    "",
    ...result.bug_draft.verification_notes.map((item) => `- ${item}`),
  );
  lines.push("", "No GitHub issue or comment was created.");

  return `${lines.join("\n")}\n`;
}
