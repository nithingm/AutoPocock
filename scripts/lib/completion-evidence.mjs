function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function normalizeList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function normalizeAcceptanceEvidence(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => ({
      criterion: normalizeText(entry?.criterion),
      evidence: normalizeText(entry?.evidence),
    }))
    .filter((entry) => entry.criterion && entry.evidence);
}

function normalizeTestEvidence(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => ({
      dimension: normalizeText(entry?.dimension).toLowerCase(),
      status: normalizeText(entry?.status).toLowerCase(),
      summary: normalizeText(entry?.summary),
    }))
    .filter((entry) => entry.dimension && entry.status && entry.summary);
}

function textSignals(node) {
  return [
    ...normalizeList(node?.verification_plan?.automated),
    ...normalizeList(node?.verification_plan?.manual),
    ...normalizeList(node?.verification_plan?.evidence_expected),
    ...normalizeList(node?.acceptance_criteria),
  ].map((item) => item.toLowerCase());
}

export function expectedTestDimensionsForNode(node) {
  const signals = textSignals(node);
  const dimensions = [];
  const pushIfPresent = (dimension, patterns) => {
    if (signals.some((signal) => patterns.some((pattern) => signal.includes(pattern)))) {
      dimensions.push(dimension);
    }
  };

  pushIfPresent("workflow", ["workflow"]);
  pushIfPresent("e2e", ["e2e", "end-to-end", "end to end"]);
  pushIfPresent("integration", ["integration", "contract", "merge behavior"]);
  pushIfPresent("unit", ["unit"]);

  if (dimensions.length === 0 && normalizeList(node?.verification_plan?.automated).length > 0) {
    dimensions.push("unit");
  }

  return [...new Set(dimensions)];
}

export function normalizeCompletionEvidence(evidence = {}, { reviewEvidence = null } = {}) {
  const normalizedReviewEvidence = reviewEvidence || evidence.review_evidence;
  return {
    changed_outputs: normalizeList(evidence.changed_outputs),
    verification_commands: normalizeList(evidence.verification_commands),
    verification_results: normalizeList(evidence.verification_results),
    acceptance_criteria_evidence: normalizeAcceptanceEvidence(evidence.acceptance_criteria_evidence),
    test_evidence: normalizeTestEvidence(evidence.test_evidence),
    review_evidence: normalizedReviewEvidence && typeof normalizedReviewEvidence === "object"
      ? {
          by: normalizeText(normalizedReviewEvidence.by),
          at: normalizeText(normalizedReviewEvidence.at),
          decision: normalizeText(normalizedReviewEvidence.decision),
          reason: normalizeText(normalizedReviewEvidence.reason),
        }
      : null,
  };
}

function acceptanceCoverage(node, evidence) {
  const criteria = normalizeList(node?.acceptance_criteria);
  const covered = new Set(
    evidence.acceptance_criteria_evidence.map((entry) => entry.criterion.toLowerCase()),
  );

  return criteria.filter((criterion) => !covered.has(criterion.toLowerCase()));
}

export function validateCompletionEvidence(node, evidenceInput, { requireReviewEvidence = false } = {}) {
  const evidence = normalizeCompletionEvidence(evidenceInput);
  const errors = [];

  if (evidence.changed_outputs.length === 0) {
    errors.push("missing changed outputs");
  }
  if (evidence.verification_commands.length === 0) {
    errors.push("missing verification commands");
  }
  if (evidence.verification_results.length === 0) {
    errors.push("missing verification results");
  }

  const uncoveredCriteria = acceptanceCoverage(node, evidence);
  if (uncoveredCriteria.length > 0) {
    errors.push(`missing acceptance evidence for: ${uncoveredCriteria.join(" | ")}`);
  }

  const requiredDimensions = expectedTestDimensionsForNode(node);
  const observed = new Map();
  for (const entry of evidence.test_evidence) {
    observed.set(entry.dimension, entry);
  }

  for (const dimension of requiredDimensions) {
    if (!observed.has(dimension)) {
      errors.push(`missing ${dimension} test evidence`);
    }
  }

  const failedDimensions = evidence.test_evidence
    .filter((entry) => entry.status !== "pass" && entry.status !== "passed")
    .map((entry) => entry.dimension);

  if (requireReviewEvidence && !evidence.review_evidence?.by) {
    errors.push("missing review evidence");
  }

  return {
    ok: errors.length === 0 && failedDimensions.length === 0,
    errors,
    evidence,
    required_test_dimensions: requiredDimensions,
    failed_test_dimensions: [...new Set(failedDimensions)],
  };
}
