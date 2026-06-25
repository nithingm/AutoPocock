import path from "node:path";

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function issueKey(value) {
  return normalizeText(value).replace(/^#/, "");
}

function normalizeIssueList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => issueKey(item)).filter(Boolean);
}

function normalizeVerificationShape(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function normalizePolicyCode(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function findIssueRecord(plan, issueId) {
  const target = issueKey(issueId);
  for (const wave of Array.isArray(plan?.waves) ? plan.waves : []) {
    for (const issue of Array.isArray(wave?.issues) ? wave.issues : []) {
      if (issueKey(issue.issue_id) === target) {
        return {
          wave,
          issue,
        };
      }
    }
  }

  throw new Error(`Issue ${target} was not found in Ralph run plan ${plan?.plan_id || "<unknown>"}.`);
}

export function validateRalphRunPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object") {
    errors.push("Ralph run plan must be an object.");
    return errors;
  }

  if (normalizeText(plan.schema_version) !== "ralph-run-plan/v1") {
    errors.push(`Unsupported Ralph run plan schema: ${normalizeText(plan.schema_version) || "<empty>"}`);
  }
  if (!normalizeText(plan.plan_id)) {
    errors.push("Ralph run plan is missing plan_id.");
  }
  if (!Array.isArray(plan.waves) || plan.waves.length === 0) {
    errors.push("Ralph run plan must contain at least one wave.");
    return errors;
  }

  const seenIssues = new Set();
  for (const wave of plan.waves) {
    if (!normalizeText(wave.wave_id)) {
      errors.push("Each wave must define wave_id.");
    }
    if (!Array.isArray(wave.issues) || wave.issues.length === 0) {
      errors.push(`Wave ${normalizeText(wave.wave_id) || "<unknown>"} must contain at least one issue.`);
      continue;
    }

    for (const issue of wave.issues) {
      const key = issueKey(issue.issue_id);
      if (!key) {
        errors.push(`Wave ${normalizeText(wave.wave_id) || "<unknown>"} contains an issue without issue_id.`);
        continue;
      }
      if (seenIssues.has(key)) {
        errors.push(`Issue ${key} appears multiple times in the Ralph run plan.`);
      }
      seenIssues.add(key);
    }
  }

  return errors;
}

export function createRalphRunState(plan, overrides = {}) {
  const errors = validateRalphRunPlan(plan);
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  const issueStates = {};
  const waveApprovals = {};
  for (const wave of plan.waves) {
    const waveId = normalizeText(wave.wave_id);
    waveApprovals[waveId] = {
      status: "pending",
      approved_by: "",
      approved_at: "",
      bundle_json_path: "",
      bundle_markdown_path: "",
    };
    for (const issue of wave.issues) {
      const key = issueKey(issue.issue_id);
      issueStates[key] = {
        status: "pending",
        attempts: 0,
        updated_at: "",
        reason: "",
        reason_code: "",
        failure_kind: "",
        decision_scope: "",
        shared_foundation_kind: "",
      };
    }
  }

  return {
    schema_version: "ralph-run-state/v1",
    plan_id: plan.plan_id,
    source_plan: overrides.source_plan || "",
    created_at: overrides.created_at || nowIso(),
    updated_at: overrides.updated_at || overrides.created_at || nowIso(),
    global: {
      status: "active",
      reason: "",
      reason_code: "",
      decision_scope: "",
      shared_foundation_kind: "",
      issue_id: "",
    },
    issue_states: issueStates,
    wave_approvals: waveApprovals,
    history: [],
  };
}

function waveIsComplete(wave, state) {
  return wave.issues.every((issue) => state.issue_states[issueKey(issue.issue_id)]?.status === "completed");
}

function formatIssueStatus(issueState) {
  return normalizeText(issueState?.status) || "pending";
}

export function getCurrentWave(plan, state) {
  const waves = Array.isArray(plan?.waves) ? plan.waves : [];
  for (const wave of waves) {
    if (!waveIsComplete(wave, state)) {
      return wave;
    }
  }
  return null;
}

function issueSummary(issue, issueState) {
  return {
    issue_id: issueKey(issue.issue_id),
    title: normalizeText(issue.title),
    worker_mode: normalizeText(issue.worker_mode),
    retry_budget: Number.isFinite(Number(issue.retry_budget)) ? Number(issue.retry_budget) : 0,
    status: formatIssueStatus(issueState),
    attempts: Number(issueState?.attempts || 0),
    reason: normalizeText(issueState?.reason),
    reason_code: normalizePolicyCode(issueState?.reason_code),
    failure_kind: normalizePolicyCode(issueState?.failure_kind),
    decision_scope: normalizePolicyCode(issueState?.decision_scope),
    shared_foundation_kind: normalizePolicyCode(issueState?.shared_foundation_kind),
    verification_shape: normalizeVerificationShape(issue.verification_shape),
    dag_node_id: normalizeText(issue?.dag_node_id),
  };
}

function sharedFoundationTriggerCodes(plan) {
  return new Set(
    normalizeVerificationShape(plan?.control_policy?.shared_foundation_triggers).map((item) => normalizePolicyCode(item)),
  );
}

function classifySharedFoundationFailure(plan, action) {
  const triggers = sharedFoundationTriggerCodes(plan);
  const explicitKind = normalizePolicyCode(action?.shared_foundation_kind);
  if (explicitKind && triggers.has(explicitKind)) {
    return explicitKind;
  }

  const reasonCode = normalizePolicyCode(action?.reason_code);
  if (reasonCode && triggers.has(reasonCode)) {
    return reasonCode;
  }

  return "";
}

function clearGlobalDecision(globalState) {
  globalState.reason = "";
  globalState.reason_code = "";
  globalState.decision_scope = "";
  globalState.shared_foundation_kind = "";
  globalState.issue_id = "";
}

function clearIssueDecision(issueState) {
  issueState.reason_code = "";
  issueState.failure_kind = "";
  issueState.decision_scope = "";
  issueState.shared_foundation_kind = "";
}

function approvalUnit(plan) {
  return normalizeText(plan?.control_policy?.approval_unit) || "wave-bundle";
}

function waveApprovalRequired(plan, wave) {
  if (wave?.approval_required === false) {
    return false;
  }
  return approvalUnit(plan) === "wave-bundle";
}

function approvalStatus(state, waveId) {
  return normalizeText(state?.wave_approvals?.[normalizeText(waveId)]?.status) || "pending";
}

export function buildRalphRunSnapshot(plan, state) {
  const currentWave = getCurrentWave(plan, state);
  const globalStatus = normalizeText(state?.global?.status) || "active";
  const globalReason = normalizeText(state?.global?.reason);
  const globalReasonCode = normalizePolicyCode(state?.global?.reason_code);
  const globalDecisionScope = normalizePolicyCode(state?.global?.decision_scope);
  const globalSharedFoundationKind = normalizePolicyCode(state?.global?.shared_foundation_kind);
  const completedIssues = Object.entries(state?.issue_states || {})
    .filter(([, issueState]) => issueState.status === "completed")
    .map(([issueId]) => issueId)
    .sort((left, right) => Number(left) - Number(right));

  const blockedIssues = Object.entries(state?.issue_states || {})
    .filter(([, issueState]) => issueState.status === "blocked")
    .map(([issueId]) => issueId)
    .sort((left, right) => Number(left) - Number(right));

  if (!currentWave) {
    return {
      schema_version: "ralph-run-snapshot/v1",
      plan_id: plan.plan_id,
      global_status: globalStatus,
      global_reason: globalReason,
      global_reason_code: globalReasonCode,
      global_decision_scope: globalDecisionScope,
      global_shared_foundation_kind: globalSharedFoundationKind,
      finished: true,
      current_wave: null,
      runnable: [],
      blocked: blockedIssues,
      completed: completedIssues,
    };
  }

  const issues = currentWave.issues.map((issue) => issueSummary(issue, state.issue_states[issueKey(issue.issue_id)]));
  const runnable = globalStatus === "frozen"
    ? []
    : issues.filter((issue) => issue.status === "pending" || issue.status === "in_progress");
  const blocked = issues.filter((issue) => issue.status === "blocked");

  return {
    schema_version: "ralph-run-snapshot/v1",
    plan_id: plan.plan_id,
    global_status: globalStatus,
    global_reason: globalReason,
    global_reason_code: globalReasonCode,
    global_decision_scope: globalDecisionScope,
    global_shared_foundation_kind: globalSharedFoundationKind,
    finished: false,
    current_wave: {
      wave_id: normalizeText(currentWave.wave_id),
      parallel: currentWave.parallel === true,
      rationale: normalizeText(currentWave.rationale),
      approval_required: waveApprovalRequired(plan, currentWave),
      approval_status: approvalStatus(state, currentWave.wave_id),
      bundle_json_path: normalizeText(state?.wave_approvals?.[normalizeText(currentWave.wave_id)]?.bundle_json_path),
      bundle_markdown_path: normalizeText(state?.wave_approvals?.[normalizeText(currentWave.wave_id)]?.bundle_markdown_path),
      branch_local_pause_on: Array.isArray(currentWave.branch_local_pause_on)
        ? currentWave.branch_local_pause_on.map((item) => normalizeText(item)).filter(Boolean)
        : [],
    },
    runnable,
    blocked,
    completed: completedIssues,
  };
}

function ensureIssueExists(state, issueId) {
  const key = issueKey(issueId);
  if (!state.issue_states[key]) {
    throw new Error(`Issue ${key} is not tracked in this Ralph run state.`);
  }
  return key;
}

function waveForIssue(plan, issueId) {
  return findIssueRecord(plan, issueId).wave;
}

function ensureWaveApproved(plan, state, issueId) {
  const wave = waveForIssue(plan, issueId);
  if (!waveApprovalRequired(plan, wave)) {
    return;
  }
  const waveId = normalizeText(wave?.wave_id);
  if (approvalStatus(state, waveId) !== "approved") {
    throw new Error(
      `Wave ${waveId} has not been approved. Approve it with \`pnpm ops ralph -- --plan <plan.json> --approve-wave ${waveId} --approved-by <operator>\` before starting execution.`,
    );
  }
}

function pushHistory(state, entry) {
  state.history.push({
    at: nowIso(),
    ...entry,
  });
}

export function applyRalphRunAction(plan, stateInput, action) {
  const state = clone(stateInput);
  const kind = normalizeText(action?.kind);
  const reason = normalizeText(action?.reason);
  const actor = normalizeText(action?.actor) || "solo-operator";

  if (kind === "status") {
    return state;
  }

  if (kind === "freeze") {
    state.global.status = "frozen";
    state.global.reason = reason;
    state.global.reason_code = normalizePolicyCode(action?.reason_code);
    state.global.decision_scope = normalizePolicyCode(action?.decision_scope) || "manual_freeze";
    state.global.shared_foundation_kind = normalizePolicyCode(action?.shared_foundation_kind);
    state.global.issue_id = issueKey(action?.issue_id);
    state.updated_at = nowIso();
    pushHistory(state, {
      kind,
      actor,
      reason,
      reason_code: state.global.reason_code,
      decision_scope: state.global.decision_scope,
      shared_foundation_kind: state.global.shared_foundation_kind,
      issue_id: state.global.issue_id,
    });
    return state;
  }

  if (kind === "unfreeze") {
    state.global.status = "active";
    clearGlobalDecision(state.global);
    state.updated_at = nowIso();
    pushHistory(state, { kind, actor, reason });
    return state;
  }

  if (kind === "approve_wave") {
    const waveId = normalizeText(action?.wave_id);
    if (!state.wave_approvals?.[waveId]) {
      throw new Error(`Wave ${waveId} is not tracked in this Ralph run state.`);
    }
    state.wave_approvals[waveId] = {
      ...state.wave_approvals[waveId],
      status: "approved",
      approved_by: actor,
      approved_at: nowIso(),
      bundle_json_path: normalizeText(action?.bundle_json_path),
      bundle_markdown_path: normalizeText(action?.bundle_markdown_path),
    };
    state.updated_at = nowIso();
    pushHistory(state, {
      kind,
      wave_id: waveId,
      actor,
      reason,
      bundle_json_path: normalizeText(action?.bundle_json_path),
      bundle_markdown_path: normalizeText(action?.bundle_markdown_path),
    });
    return state;
  }

  const key = ensureIssueExists(state, action?.issue_id);
  const issueState = state.issue_states[key];

  if (kind === "start") {
    ensureWaveApproved(plan, state, key);
    issueState.status = "in_progress";
    issueState.attempts += 1;
    issueState.updated_at = nowIso();
    issueState.reason = reason;
    clearIssueDecision(issueState);
    state.updated_at = issueState.updated_at;
    pushHistory(state, { kind, issue_id: key, actor, reason });
    return state;
  }

  if (kind === "complete") {
    issueState.status = "completed";
    issueState.updated_at = nowIso();
    issueState.reason = reason;
    clearIssueDecision(issueState);
    state.updated_at = issueState.updated_at;
    pushHistory(state, { kind, issue_id: key, actor, reason });
    return state;
  }

  if (kind === "block") {
    issueState.status = "blocked";
    issueState.updated_at = nowIso();
    issueState.reason = reason;
    clearIssueDecision(issueState);
    state.updated_at = issueState.updated_at;
    pushHistory(state, { kind, issue_id: key, actor, reason });
    return state;
  }

  if (kind === "failure_policy") {
    const failureKind = normalizePolicyCode(action?.failure_kind);
    const reasonCode = normalizePolicyCode(action?.reason_code);
    const sharedFoundationKind = classifySharedFoundationFailure(plan, action);
    const decisionScope = sharedFoundationKind ? "full_run_freeze" : "branch_local_pause";

    issueState.status = "blocked";
    issueState.updated_at = nowIso();
    issueState.reason = reason;
    issueState.reason_code = reasonCode;
    issueState.failure_kind = failureKind;
    issueState.decision_scope = decisionScope;
    issueState.shared_foundation_kind = sharedFoundationKind;
    state.updated_at = issueState.updated_at;

    if (sharedFoundationKind) {
      state.global.status = "frozen";
      state.global.reason = reason;
      state.global.reason_code = reasonCode || sharedFoundationKind;
      state.global.decision_scope = decisionScope;
      state.global.shared_foundation_kind = sharedFoundationKind;
      state.global.issue_id = key;
    }

    pushHistory(state, {
      kind,
      issue_id: key,
      actor,
      reason,
      reason_code: reasonCode,
      failure_kind: failureKind,
      decision_scope: decisionScope,
      shared_foundation_kind: sharedFoundationKind,
    });
    return state;
  }

  if (kind === "resume") {
    issueState.status = "pending";
    issueState.updated_at = nowIso();
    issueState.reason = reason;
    clearIssueDecision(issueState);
    state.updated_at = issueState.updated_at;
    pushHistory(state, { kind, issue_id: key, actor, reason });
    return state;
  }

  if (kind === "reset") {
    issueState.status = "pending";
    issueState.attempts = 0;
    issueState.updated_at = nowIso();
    issueState.reason = reason;
    clearIssueDecision(issueState);
    state.updated_at = issueState.updated_at;
    pushHistory(state, { kind, issue_id: key, actor, reason });
    return state;
  }

  throw new Error(
    `Unsupported Ralph action: ${kind}. Use start, complete, block, resume, reset, approve_wave, freeze, unfreeze, failure_policy, or status.`,
  );
}

export function renderRalphRunSnapshot(plan, state, snapshot) {
  const lines = [
    "# Ralph Run",
    "",
    `Plan ID: ${plan.plan_id}`,
    `Parent issue: #${normalizeText(plan.parent_issue) || "N/A"}`,
    `Global status: ${snapshot.global_status}`,
    `Completed issues: ${snapshot.completed.join(", ") || "None"}`,
    `Blocked issues: ${snapshot.blocked.map((issue) => issue.issue_id || issue).join(", ") || "None"}`,
  ];

  if (snapshot.global_status === "frozen") {
    lines.push(`Freeze reason: ${normalizeText(state?.global?.reason) || "None recorded"}`);
    if (snapshot.global_reason_code) {
      lines.push(`Freeze reason code: ${snapshot.global_reason_code}`);
    }
    if (snapshot.global_shared_foundation_kind) {
      lines.push(`Shared foundation trigger: ${snapshot.global_shared_foundation_kind}`);
    }
  }

  if (snapshot.finished) {
    lines.push("", "Run status: COMPLETE");
    return `${lines.join("\n")}\n`;
  }

  lines.push("");
  lines.push(`Current wave: ${snapshot.current_wave.wave_id}`);
  lines.push(`Parallel wave: ${snapshot.current_wave.parallel ? "yes" : "no"}`);
  lines.push(`Wave approval required: ${snapshot.current_wave.approval_required ? "yes" : "no"}`);
  lines.push(`Wave approval status: ${snapshot.current_wave.approval_status}`);
  lines.push(`Wave rationale: ${snapshot.current_wave.rationale || "None recorded"}`);
  if (snapshot.current_wave.bundle_json_path) {
    lines.push(`Wave approval bundle: ${snapshot.current_wave.bundle_json_path}`);
  }
  if (snapshot.current_wave.bundle_markdown_path) {
    lines.push(`Wave approval preview: ${snapshot.current_wave.bundle_markdown_path}`);
  }

  if (snapshot.current_wave.branch_local_pause_on.length > 0) {
    lines.push("Branch-local pause triggers:");
    for (const item of snapshot.current_wave.branch_local_pause_on) {
      lines.push(`- ${item}`);
    }
  }

  lines.push("");
  lines.push("Runnable issues:");
  if (snapshot.runnable.length === 0) {
    lines.push("- None");
  } else {
    for (const issue of snapshot.runnable) {
      lines.push(`- #${issue.issue_id} ${issue.title} [${issue.worker_mode || "single"}] attempts ${issue.attempts}/${issue.retry_budget}${issue.dag_node_id ? ` node ${issue.dag_node_id}` : ""}`);
      for (const check of issue.verification_shape) {
        lines.push(`  verification: ${check}`);
      }
    }
  }

  lines.push("");
  lines.push("Wave-blocked issues:");
  if (snapshot.blocked.length === 0) {
    lines.push("- None");
  } else {
    for (const issue of snapshot.blocked) {
      const policyBits = [issue.decision_scope, issue.reason_code].filter(Boolean).join(" ");
      lines.push(`- #${issue.issue_id} ${issue.title} (${issue.reason || issue.status}${policyBits ? `: ${policyBits}` : ""})`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function defaultRalphRunStatePath({ cwd, plan, planPath }) {
  const planId = normalizeText(plan?.plan_id) || path.basename(planPath, path.extname(planPath));
  return path.join(cwd, ".ai", "ralph-runs", `${planId}.json`);
}
