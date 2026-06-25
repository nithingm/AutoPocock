function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function asList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  const text = normalizeText(value);
  return text ? [text] : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function rootSegment(surface) {
  const normalized = normalizeText(surface).replace(/\\/g, "/");
  if (!normalized) {
    return "";
  }
  return normalized.split("/")[0] || normalized;
}

function containsAmbiguousMarker(value) {
  return /\b(tbd|todo|unknown|unclear|misc|thing|stuff|somehow|later)\b/i.test(value);
}

function containsBroadMarker(value) {
  return /\b(all|entire|system|platform|global|end-to-end|everything|exhaustive)\b/i.test(value);
}

function isRepoWideSurface(surface) {
  const normalized = normalizeText(surface).replace(/\\/g, "/");
  return normalized === "**" || normalized === "*" || normalized === "./**" || normalized === ".";
}

function isBroadSurface(surface) {
  const normalized = normalizeText(surface).replace(/\\/g, "/");
  if (!normalized) {
    return false;
  }
  if (isRepoWideSurface(normalized)) {
    return true;
  }
  return /^(src|scripts|docs|tests|packages|apps)\/\*\*$/.test(normalized);
}

function verificationItems(plan) {
  if (!plan || typeof plan !== "object") {
    return [];
  }
  return [...asList(plan.automated), ...asList(plan.manual)];
}

function classify(level, reasons) {
  return {
    level,
    reasons: unique(reasons),
  };
}

export function analyzeDagNodeQuality(node) {
  const title = normalizeText(node?.title);
  const goal = normalizeText(node?.goal);
  const acceptanceCriteria = asList(node?.acceptance_criteria);
  const writeSurface = asList(node?.write_surface);
  const verification = verificationItems(node?.verification_plan);
  const providerEligible = node?.provider_eligible !== false;
  const humanGateRequired = node?.human_gate_required === true;

  const ambiguityReasons = [];
  if (!title) {
    ambiguityReasons.push("missing title");
  }
  if (!goal) {
    ambiguityReasons.push("missing goal");
  }
  if (acceptanceCriteria.length === 0) {
    ambiguityReasons.push("missing acceptance criteria");
  }
  if (verification.length === 0) {
    ambiguityReasons.push("missing verification plan");
  }
  if ([title, goal, ...acceptanceCriteria].some(containsAmbiguousMarker)) {
    ambiguityReasons.push("contains ambiguous placeholder language");
  }

  const ambiguityLevel = ambiguityReasons.some((reason) =>
    reason === "missing goal" ||
    reason === "missing acceptance criteria" ||
    reason === "missing verification plan"
  ) || ambiguityReasons.length >= 2
    ? "high"
    : ambiguityReasons.length === 1
      ? "medium"
      : "low";

  const oversizeReasons = [];
  if (acceptanceCriteria.length >= 6) {
    oversizeReasons.push("too many acceptance criteria for a single AFK slice");
  }
  if (verification.length >= 6) {
    oversizeReasons.push("verification surface is too large for a single AFK slice");
  }
  if (writeSurface.length >= 5) {
    oversizeReasons.push("write surface spans too many areas");
  }
  if ([title, goal].some(containsBroadMarker)) {
    oversizeReasons.push("scope language is too broad");
  }
  if (writeSurface.some(isRepoWideSurface)) {
    oversizeReasons.push("write surface is repo-wide");
  }

  const oversizeLevel = oversizeReasons.some((reason) =>
    reason === "write surface is repo-wide" ||
    reason === "too many acceptance criteria for a single AFK slice"
  ) || oversizeReasons.length >= 2
    ? "high"
    : oversizeReasons.length === 1
      ? "medium"
      : "low";

  const ownershipReasons = [];
  if (writeSurface.length === 0) {
    ownershipReasons.push("missing write surface");
  }
  if (writeSurface.some(isRepoWideSurface)) {
    ownershipReasons.push("write surface does not establish file ownership boundaries");
  }
  if (writeSurface.some(isBroadSurface)) {
    ownershipReasons.push("write surface uses broad directory globs");
  }
  if (unique(writeSurface.map(rootSegment)).length >= 4) {
    ownershipReasons.push("write surface crosses too many top-level areas");
  }

  const ownershipLevel = ownershipReasons.some((reason) =>
    reason === "missing write surface" ||
    reason === "write surface does not establish file ownership boundaries"
  ) || ownershipReasons.length >= 2
    ? "high"
    : ownershipReasons.length === 1
      ? "medium"
      : "low";

  const ineligibilityReasons = [];
  if (!providerEligible) {
    ineligibilityReasons.push("provider marked node as ineligible for AFK execution");
  }
  if (humanGateRequired) {
    ineligibilityReasons.push("node requires human gate approval before AFK execution");
  }
  if (ambiguityLevel === "high") {
    ineligibilityReasons.push("ambiguity score is too high");
  }
  if (oversizeLevel === "high") {
    ineligibilityReasons.push("oversize risk is too high");
  }
  if (ownershipLevel === "high") {
    ineligibilityReasons.push("ownership boundary is too weak");
  }

  const executionEligibility = {
    status: ineligibilityReasons.length === 0 ? "eligible" : "ineligible",
    reasons: unique(ineligibilityReasons),
  };

  return {
    ambiguity: classify(ambiguityLevel, ambiguityReasons),
    oversize_risk: classify(oversizeLevel, oversizeReasons),
    ownership_strength: {
      level: ownershipLevel === "low" ? "strong" : ownershipLevel === "medium" ? "moderate" : "weak",
      reasons: unique(ownershipReasons),
    },
    execution_eligibility: executionEligibility,
  };
}

export function analyzeDagQuality(dag) {
  const nodes = Array.isArray(dag?.nodes) ? dag.nodes : [];
  const analyzedNodes = nodes.map((node) => ({
    id: node.id,
    title: node.title,
    quality: analyzeDagNodeQuality(node),
  }));

  const eligibleNodeIds = analyzedNodes
    .filter((node) => node.quality.execution_eligibility.status === "eligible")
    .map((node) => node.id);
  const ineligibleNodeIds = analyzedNodes
    .filter((node) => node.quality.execution_eligibility.status === "ineligible")
    .map((node) => node.id);

  return {
    schema_version: "dag-quality/v1",
    assumptions: [
      "Analyzed against the current issue-dag/v1 node shape.",
      "Eligibility is deterministic and based on node-local ambiguity, oversize, ownership, provider, and human-gate signals.",
    ],
    summary: {
      total_nodes: analyzedNodes.length,
      eligible_nodes: eligibleNodeIds.length,
      ineligible_nodes: ineligibleNodeIds.length,
    },
    eligible_node_ids: eligibleNodeIds,
    ineligible_node_ids: ineligibleNodeIds,
    nodes: analyzedNodes,
  };
}

export function enrichDagWithQuality(dag) {
  const analysis = analyzeDagQuality(dag);
  const qualityByNodeId = new Map(analysis.nodes.map((node) => [node.id, node.quality]));

  return {
    ...dag,
    nodes: (Array.isArray(dag?.nodes) ? dag.nodes : []).map((node) => {
      const quality = qualityByNodeId.get(node.id) || analyzeDagNodeQuality(node);
      return {
        ...node,
        quality,
        execution_eligible: quality.execution_eligibility.status === "eligible",
        execution_eligibility_reasons: quality.execution_eligibility.reasons,
      };
    }),
    quality: analysis,
  };
}
