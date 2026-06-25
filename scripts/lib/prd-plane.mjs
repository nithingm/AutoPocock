function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sectionBody(markdown, heading) {
  const text = normalizeText(markdown);
  const match = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, "m").exec(text);
  if (!match) {
    return "";
  }

  const start = match.index + match[0].length;
  const rest = text.slice(start).replace(/^\n+/, "");
  const nextHeadingIndex = rest.search(/^##\s+/m);
  return normalizeText(nextHeadingIndex === -1 ? rest : rest.slice(0, nextHeadingIndex));
}

function listItems(markdown, heading) {
  return sectionBody(markdown, heading)
    .split("\n")
    .map((line) => line.match(/^\s*-\s+(.*)$/)?.[1] || "")
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

function parseKeyValueSection(markdown, heading) {
  const items = listItems(markdown, heading);
  const values = {};
  for (const item of items) {
    const match = item.match(/^([^:]+):\s*(.*)$/);
    if (match) {
      values[match[1].trim().toLowerCase()] = match[2].trim();
    }
  }
  return values;
}

function firstMeaningfulValue(items, fallback = "") {
  return meaningfulList(items)[0] || fallback;
}

function checklistItems(markdown, heading) {
  return sectionBody(markdown, heading)
    .split("\n")
    .map((line) => line.match(/^\s*-\s+\[[ xX]\]\s+(.*)$/)?.[1] || "")
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

function parseTitle(markdown, prdPath = "") {
  return normalizeText(markdown.match(/^#\s+(.+)$/m)?.[1] || prdPath || "PRD");
}

function isPlaceholderValue(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    "none",
    "none captured",
    "tbd",
    "n/a",
    "unknown",
    "none captured.",
  ].includes(normalized)
    || normalized.includes("define explicitly")
    || normalized.includes("derive from approved context")
    || normalized.includes("to be decided")
    || normalized.includes("tbd");
}

function meaningfulList(items) {
  return items.filter((item) => !isPlaceholderValue(item));
}

function parseScopeSection(markdown) {
  const scope = parseKeyValueSection(markdown, "Scope");
  return {
    inScope: normalizeText(scope["in scope"] || ""),
    outOfScope: normalizeText(scope["out of scope"] || ""),
  };
}

function collectConstraintStatements(markdown) {
  const values = parseKeyValueSection(markdown, "Constraints");
  return Object.entries(values)
    .map(([key, value]) => `${key}: ${value}`)
    .filter((item) => !isPlaceholderValue(item));
}

function isCodeSpecificPrd(markdown) {
  return /\b(repo|code|module|file|refactor|api|database|schema|migration|cli|script|ui|frontend|backend|test|implementation)\b/i.test(
    normalizeText(markdown),
  );
}

function isNegatedStatement(value) {
  return /\b(must not|should not|cannot|can't|do not|don't|without|no)\b/i.test(value);
}

function canonicalStatement(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/^[^:]+:\s*/, "")
    .replace(/\b(must not|should not|cannot|can't|do not|don't|without|no|must|should|use|the|a|an|existing|shared)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findContradictions(statements) {
  const contradictions = [];

  for (let index = 0; index < statements.length; index += 1) {
    for (let inner = index + 1; inner < statements.length; inner += 1) {
      const left = statements[index];
      const right = statements[inner];
      const leftCanonical = canonicalStatement(left);
      const rightCanonical = canonicalStatement(right);
      if (!leftCanonical || leftCanonical !== rightCanonical) {
        continue;
      }
      if (isNegatedStatement(left) === isNegatedStatement(right)) {
        continue;
      }
      contradictions.push(`${left} <-> ${right}`);
    }
  }

  return contradictions;
}

function tracerBulletCandidates(markdown) {
  const acceptance = meaningfulList(checklistItems(markdown, "Acceptance Criteria"));
  if (acceptance.length > 0) {
    return acceptance;
  }

  const scope = parseScopeSection(markdown);
  return meaningfulList([scope.inScope]);
}

function isBroadCandidate(value) {
  return /\b(all|everything|entire|whole|platform-wide|repo-wide|codebase-wide|full rewrite|broad refactor|across the (repo|codebase|system))\b/i.test(
    value,
  );
}

function buildValidationResult({ markdown, prdPath = "", approval }) {
  const title = parseTitle(markdown, prdPath);
  const userValueItems = meaningfulList(listItems(markdown, "User Value"));
  const acceptanceCriteria = meaningfulList(checklistItems(markdown, "Acceptance Criteria"));
  const scope = parseScopeSection(markdown);
  const constraintStatements = collectConstraintStatements(markdown);
  const contradictionCandidates = [
    ...constraintStatements,
    scope.inScope ? `in scope: ${scope.inScope}` : "",
    scope.outOfScope ? `out of scope: ${scope.outOfScope}` : "",
  ].filter(Boolean);
  const contradictions = findContradictions(contradictionCandidates);
  const tracerCandidates = tracerBulletCandidates(markdown);
  const tracerViable = tracerCandidates.some((candidate) => !isBroadCandidate(candidate));
  const codeSpecific = isCodeSpecificPrd(markdown);

  const failures = [];
  const suggestions = [];
  const checks = {
    concrete_user_outcome: "pass",
    acceptance_criteria: "pass",
    scope_boundaries: "pass",
    contradictory_constraints: "pass",
    tracer_bullet_viability: "pass",
    code_context: "pass",
  };

  if (userValueItems.length === 0) {
    checks.concrete_user_outcome = "fail";
    failures.push("Missing a concrete user outcome in `## User Value`.");
    suggestions.push("Clarify the user-visible outcome in `## User Value` with one explicit builder or operator benefit.");
  }

  if (acceptanceCriteria.length === 0) {
    checks.acceptance_criteria = "fail";
    failures.push("Missing testable acceptance criteria in `## Acceptance Criteria`.");
    suggestions.push("Add at least one checklist-style acceptance criterion that can be verified after implementation.");
  }

  if (isPlaceholderValue(scope.inScope) || isPlaceholderValue(scope.outOfScope)) {
    checks.scope_boundaries = "fail";
    failures.push("Missing explicit scope boundaries in `## Scope`.");
    suggestions.push("State both `In scope` and `Out of scope` with concrete boundaries before compiling the DAG.");
  }

  if (
    scope.inScope
    && scope.outOfScope
    && canonicalStatement(scope.inScope)
    && canonicalStatement(scope.inScope) === canonicalStatement(scope.outOfScope)
  ) {
    checks.scope_boundaries = "fail";
    failures.push("Scope boundaries are contradictory because the same work is both in scope and out of scope.");
    suggestions.push("Split the boundary so one item is clearly inside the plan and the other is explicitly excluded.");
  }

  if (contradictions.length > 0) {
    checks.contradictory_constraints = "fail";
    failures.push(`Found contradictory constraints: ${contradictions.join(" ; ")}`);
    suggestions.push("Resolve contradictory constraints before issue decomposition so the scheduler is not forced to guess.");
  }

  if (tracerCandidates.length === 0 || !tracerViable) {
    checks.tracer_bullet_viability = "fail";
    failures.push("Missing tracer-bullet viability because the PRD does not expose a bounded first slice.");
    suggestions.push("Add one narrow first-slice outcome that proves the happy path without requiring a repo-wide rewrite.");
  }

  if (codeSpecific && !approval.sourceContext) {
    checks.code_context = "fail";
    failures.push("Missing repo or domain context for code-specific slicing.");
    suggestions.push("Attach approved source context or add decomposition notes that name the relevant repo surfaces and domain terms.");
  }

  return {
    ok: failures.length === 0,
    prd_title: title,
    prd_path: prdPath,
    approval,
    checks,
    failures,
    suggestions,
    extracted: {
      user_value: userValueItems,
      acceptance_criteria: acceptanceCriteria,
      in_scope: scope.inScope,
      out_of_scope: scope.outOfScope,
      contradiction_candidates: contradictionCandidates,
      tracer_bullet_candidates: tracerCandidates,
      code_specific: codeSpecific,
    },
  };
}

export function renderPrdFromContext({ title, contextPath, context }) {
  const terms = context.domainLanguage.filter((line) => line.toLowerCase().startsWith("term:"));
  const meanings = context.domainLanguage.filter((line) => line.toLowerCase().startsWith("meaning:"));
  const assumptions = context.assumptions.filter((line) => !/^assumption:\s*$/i.test(line));
  const unknowns = context.unknowns.filter((line) => !/^unknown:\s*$/i.test(line));
  const decisions = context.followUpDecisions.filter((line) => !/^decision:\s*$/i.test(line));
  const scopeSignals = context.scopeSignals.filter((line) => !/^(in scope|out of scope):\s*$/i.test(line));
  const sharedTitle = context.title || title;
  const userOutcome = firstMeaningfulValue(
    meanings,
    `Technical solo builders can deliver ${sharedTitle} without reconstructing intent from scratch.`,
  );
  const domainAnchor = firstMeaningfulValue(
    terms,
    `Term: ${sharedTitle}`,
  );
  const inScope = firstMeaningfulValue(
    scopeSignals,
    `In scope: Deliver the first thin slice for ${sharedTitle}.`,
  );
  const outOfScope = firstMeaningfulValue(
    scopeSignals.slice(1),
    `Out of scope: unrelated refactors outside the first thin slice for ${sharedTitle}.`,
  );
  const primaryAssumption = firstMeaningfulValue(
    assumptions,
    `Assumption: The approved context for ${sharedTitle} is sufficient to draft a first slice.`,
  );
  const primaryUnknown = firstMeaningfulValue(
    unknowns,
    `Unknown: Which acceptance criterion should become the first tracer bullet for ${sharedTitle}?`,
  );
  const technicalConstraint = firstMeaningfulValue(
    assumptions.slice(1),
    `Assumption: Reuse the current repo workflow surfaces while implementing ${sharedTitle}.`,
  );
  const productConstraint = firstMeaningfulValue(
    decisions,
    `Decision: Keep the first slice bounded to the approved context for ${sharedTitle}.`,
  );
  const operationalConstraint = firstMeaningfulValue(
    decisions.slice(1),
    "Decision: Preserve artifact-first approvals before deeper automation.",
  );

  return `# ${title}

## Approval

- Status: draft
- Approved by:
- Approved at:
- Source context: ${contextPath}
- Source context status: approved

## Problem

- Shared context title: ${sharedTitle}
- Primary assumptions to resolve: ${primaryAssumption}
- Primary unknown to reduce: ${primaryUnknown}

## User Value

- Domain language anchor: ${domainAnchor}
- Desired meaning or outcome: ${userOutcome}

## Scope

- In scope: ${inScope}
- Out of scope: ${outOfScope}

## Acceptance Criteria

- [ ] Capture the approved-context happy path without reconstructing intent from scratch.
- [ ] Resolve or explicitly defer the primary unknown from shared context.
- [ ] Preserve the key domain-language terms in implementation and QA.

## Constraints

- Technical constraints: ${technicalConstraint}
- Product constraints: ${productConstraint}
- Operational constraints: ${operationalConstraint}

## Risks

- Risk: ${primaryUnknown}
- Mitigation: Review the approved context artifact directly before narrowing scope.

## Open Questions

${unknowns.length > 0 ? unknowns.map((item) => `- ${item}`).join("\n") : "- None captured"}

## Notes For Issue Decomposition

- Context assumptions: ${assumptions.join(" | ") || "None captured"}
- Follow-up decisions: ${decisions.join(" | ") || "None captured"}
- Scope signals: ${scopeSignals.join(" | ") || "None captured"}
`;
}

export function parsePrdApproval(markdown) {
  const approval = parseKeyValueSection(markdown, "Approval");
  return {
    status: approval.status || "draft",
    approvedBy: approval["approved by"] || "",
    approvedAt: approval["approved at"] || "",
    sourceContext: approval["source context"] || "",
    sourceContextStatus: approval["source context status"] || "",
  };
}

export function validatePrdTightness(markdown, prdPath = "") {
  return buildValidationResult({
    markdown,
    prdPath,
    approval: parsePrdApproval(markdown),
  });
}

export function renderPrdTightnessReport(result) {
  const extracted = result.extracted || {};
  const renderedFailures = result.failures.length > 0
    ? result.failures.map((failure) => `- ${failure}`).join("\n")
    : "- None";
  const renderedSuggestions = result.suggestions.length > 0
    ? result.suggestions.map((item) => `- ${item}`).join("\n")
    : "- None";
  const renderedChecks = Object.entries(result.checks)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  return `# PRD Tightness Validation

## Summary

- Status: ${result.ok ? "pass" : "fail"}
- PRD: ${result.prd_path || result.prd_title}
- Title: ${result.prd_title}

## Checks

${renderedChecks}

## Failures

${renderedFailures}

## Suggested Next Actions

${renderedSuggestions}

## Extracted Signals

- User value: ${extracted.user_value?.join(" | ") || "None"}
- Acceptance criteria: ${extracted.acceptance_criteria?.join(" | ") || "None"}
- In scope: ${extracted.in_scope || "None"}
- Out of scope: ${extracted.out_of_scope || "None"}
- Tracer bullet candidates: ${extracted.tracer_bullet_candidates?.join(" | ") || "None"}
- Code-specific slicing: ${extracted.code_specific ? "yes" : "no"}
`;
}

export function approvePrd(markdown, { approvedBy, approvedAt }) {
  return normalizeText(markdown)
    .replace(/^- Status:\s*.*$/m, "- Status: approved")
    .replace(/^- Approved by:\s*.*$/m, `- Approved by: ${approvedBy}`)
    .replace(/^- Approved at:\s*.*$/m, `- Approved at: ${approvedAt}`) + "\n";
}

export function ensureApprovedPrd(markdown, prdPath = "") {
  const approval = parsePrdApproval(markdown);
  if (approval.status !== "approved") {
    const target = prdPath || "PRD";
    throw new Error(
      `Issue planning requires an approved PRD. ${target} is ${approval.status || "draft"}. Approve it with \`pnpm ops prd-approve -- --prd ${prdPath || "<prd.md>"} --approved-by <operator>\`.`,
    );
  }
  if (approval.sourceContextStatus && approval.sourceContextStatus !== "approved") {
    throw new Error(`Issue planning requires a PRD derived from approved context. ${prdPath || "PRD"} references source context status ${approval.sourceContextStatus}.`);
  }
  return approval;
}
