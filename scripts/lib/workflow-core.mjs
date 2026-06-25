import path from "node:path";

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
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
  return normalizeText(nextHeadingIndex === -1 ? rest : rest.slice(0, nextHeadingIndex));
}

function listSectionItems(markdown, heading) {
  return sectionBody(markdown, heading)
    .split("\n")
    .map((line) => line.match(/^\s*-\s+(.*)$/)?.[1] || "")
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

function listNestedItems(markdown, heading, label) {
  const body = sectionBody(markdown, heading);
  if (!body) {
    return [];
  }

  const lines = body.split("\n");
  const labelPrefix = `- ${label}:`;
  const items = [];
  let collecting = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ");
    const trimmed = line.trim();

    if (!collecting) {
      if (trimmed.toLowerCase().startsWith(labelPrefix.toLowerCase())) {
        collecting = true;
        const inlineValue = normalizeText(trimmed.slice(labelPrefix.length));
        if (inlineValue) {
          items.push(inlineValue);
        }
      }
      continue;
    }

    if (/^-\s+/.test(line)) {
      break;
    }

    const nested = line.match(/^\s{2,}-\s+(.*)$/)?.[1];
    if (nested) {
      items.push(normalizeText(nested));
    }
  }

  return items.filter(Boolean);
}

export function providerRunLifecycle(status) {
  switch (String(status || "").toLowerCase()) {
    case "running":
      return "active";
    case "succeeded":
      return "completed";
    case "blocked":
      return "blocked";
    case "cancelled":
      return "cancelled";
    default:
      return "unknown";
  }
}

export function suggestedStageForResultStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "blocked" || normalized === "cancelled") {
    return "Ready for Handoff";
  }
  if (normalized === "needs human review" || normalized === "success") {
    return "Human Review";
  }
  return "Human Review";
}

export function validateClaimedDispatchForRun(artifact) {
  const errors = [];

  if (artifact.status !== "claimed") {
    errors.push(`Dispatch ${artifact.dispatch_id} is ${artifact.status}, not claimed.`);
  }
  if (!artifact.claim?.claimed_by || !artifact.claim?.claimed_at || !artifact.claim?.isolation_mode) {
    errors.push("Claimed dispatch is missing claimed_by, claimed_at, or isolation_mode.");
  }
  if (!artifact.isolation_mode) {
    errors.push("Dispatch is missing isolation_mode.");
  }
  if (artifact.claim?.isolation_mode && artifact.isolation_mode && artifact.claim.isolation_mode !== artifact.isolation_mode) {
    errors.push("Claimed dispatch isolation mode does not match dispatch isolation_mode.");
  }
  if (artifact.isolation_mode === "worktree" && !artifact.worktree_path) {
    errors.push("Worktree dispatch is missing worktree_path.");
  }
  if (artifact.isolation_mode === "docker") {
    if (!artifact.worktree_path) {
      errors.push("Docker dispatch is missing worktree_path.");
    }
    if (!artifact.docker?.image || !artifact.docker?.workspace) {
      errors.push("Docker dispatch is missing docker image or workspace.");
    }
  }
  if (!Array.isArray(artifact.forbidden_actions) || artifact.forbidden_actions.length === 0) {
    errors.push("Dispatch is missing forbidden_actions.");
  }

  return errors;
}

export function reclaimDispatchArtifact(artifact, historyEntry) {
  const next = {
    ...artifact,
    claim_history: Array.isArray(artifact.claim_history) ? [...artifact.claim_history, historyEntry] : [historyEntry],
    claim: null,
    status: "queued",
  };
  return next;
}

export function deriveLoopSpecPath({ cwd, dispatchId, loopSpecPath = "" }) {
  if (loopSpecPath) {
    return path.isAbsolute(loopSpecPath) ? loopSpecPath : path.join(cwd, loopSpecPath);
  }
  return path.join(cwd, "docs", "agents", "loop-specs", `${dispatchId}-loop-spec.json`);
}

export function buildLoopSpec({ dispatch, handoffMarkdown }) {
  const goal = listSectionItems(handoffMarkdown, "Goal")[0] || "";
  const acceptanceCriteria = listSectionItems(handoffMarkdown, "Acceptance Criteria");
  const automatedVerification = listNestedItems(handoffMarkdown, "Verification", "Automated");
  const manualVerification = listNestedItems(handoffMarkdown, "Verification", "Manual");
  const evidenceExpected = listNestedItems(handoffMarkdown, "Verification", "Evidence expected");
  const inScope = listNestedItems(handoffMarkdown, "Boundaries", "In scope");
  const outOfScope = listNestedItems(handoffMarkdown, "Boundaries", "Out of scope");
  const ownedSurface = listNestedItems(handoffMarkdown, "Boundaries", "Likely touched areas");
  const reportBack = listNestedItems(handoffMarkdown, "Completion", "Report back");
  const artifactsToUpdate = listNestedItems(handoffMarkdown, "Completion", "Artifacts to update");

  return {
    schema_version: "loop-spec/v1",
    loop_spec_id: `loop-spec-${slugify(dispatch.dispatch_id)}`,
    dispatch_id: dispatch.dispatch_id,
    issue_id: dispatch.issue_id,
    title: dispatch.title,
    goal,
    owned_surface: ownedSurface,
    acceptance_criteria: acceptanceCriteria,
    verification_plan: {
      automated: automatedVerification,
      manual: manualVerification,
      evidence_expected: evidenceExpected,
    },
    context_artifacts: {
      handoff_artifact: dispatch.handoff_artifact,
    },
    boundaries: {
      in_scope: inScope,
      out_of_scope: outOfScope,
      forbidden_actions: dispatch.forbidden_actions || [],
      allowed_commands: dispatch.allowed_commands || [],
    },
    execution_contract: {
      isolation_mode: dispatch.isolation_mode,
      expected_branch: dispatch.expected_branch,
      worktree_path: dispatch.worktree_path || "",
      docker: dispatch.docker || null,
      claimed_by: dispatch.claim?.claimed_by || "",
      retry_budget: 1,
      escalation_rules: [
        "Escalate when required context artifacts are missing or incomplete.",
        "Escalate when work exceeds the declared owned surface or touches forbidden areas.",
        "Escalate when verification cannot run or acceptance criteria remain ambiguous.",
      ],
      stop_conditions: [
        "Acceptance criteria are satisfied and verification is complete.",
        "The provider reports a blocked, cancelled, or timed-out result.",
        "The run exceeds the owned surface or forbidden actions boundary.",
        "Solo Operator approval is required before progression.",
      ],
    },
    completion_contract: {
      report_back: reportBack,
      artifacts_to_update: artifactsToUpdate,
      completion_report_target: dispatch.completion_report_target,
    },
    source: {
      handoff_artifact: dispatch.handoff_artifact,
      dispatch_source: dispatch.source,
      created_from_scheduler_plan: dispatch.created_from_scheduler_plan || "",
    },
  };
}
