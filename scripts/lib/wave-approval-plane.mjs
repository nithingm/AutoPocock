import path from "node:path";

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  const text = normalizeText(value);
  return text ? [text] : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function nowIso() {
  return new Date().toISOString();
}

function issueKey(value) {
  return normalizeText(value).replace(/^#/, "");
}

function findWave(plan, waveId = "") {
  const waves = Array.isArray(plan?.waves) ? plan.waves : [];
  const target = normalizeText(waveId);
  if (target) {
    const matched = waves.find((wave) => normalizeText(wave?.wave_id) === target);
    if (!matched) {
      throw new Error(`Wave ${target} was not found in plan ${normalizeText(plan?.plan_id) || "<unknown>"}.`);
    }
    return matched;
  }
  if (waves.length === 0) {
    throw new Error("Wave approval requires a plan with at least one wave.");
  }
  return waves[0];
}

function issueApprovalTreatment(issue) {
  return {
    level: normalizeText(issue?.approval_treatment) || "default",
    reason: normalizeText(issue?.approval_reason),
  };
}

function issueLoopSpec(issue, controlPolicy) {
  const loopSpec = issue?.loop_spec || issue?.execution_shape || {};
  const automatedChecks = normalizeList(
    loopSpec?.verification_plan?.automated?.length ? loopSpec.verification_plan.automated : issue?.verification_shape,
  );
  const manualChecks = normalizeList(loopSpec?.verification_plan?.manual);
  const stopConditions = normalizeList(loopSpec?.execution_contract?.stop_conditions);
  const escalationRules = normalizeList(loopSpec?.execution_contract?.escalation_rules);

  return {
    loop_spec_id: normalizeText(loopSpec?.loop_spec_id || issue?.loop_spec_id),
    goal: normalizeText(loopSpec?.goal || issue?.goal),
    owned_surface: normalizeList(loopSpec?.owned_surface || issue?.write_surface),
    automated_checks: automatedChecks,
    manual_checks: manualChecks,
    stop_conditions: stopConditions.length > 0
      ? stopConditions
      : normalizeList(controlPolicy?.default_stop_conditions),
    escalation_rules: escalationRules.length > 0
      ? escalationRules
      : normalizeList(controlPolicy?.default_escalation_conditions),
  };
}

function dependencyJustification(issue, wave) {
  return normalizeText(issue?.dependency_justification)
    || normalizeText(wave?.rationale)
    || "Selected from the current topologically valid wave frontier.";
}

function parallelismJustification(issue, wave, controlPolicy) {
  if (normalizeText(issue?.parallelism_justification)) {
    return normalizeText(issue.parallelism_justification);
  }
  if (wave?.parallel) {
    const maxParallel = Number(controlPolicy?.max_parallel_agents) || 1;
    return `Selected inside an approved parallel wave with max parallel ${maxParallel}.`;
  }
  return "Single-issue wave; no same-wave parallelism is required.";
}

function selectedNodeRecord(issue, wave, controlPolicy) {
  const loopSpec = issueLoopSpec(issue, controlPolicy);
  return {
    issue_id: issueKey(issue?.issue_id),
    dag_node_id: normalizeText(issue?.dag_node_id),
    title: normalizeText(issue?.title),
    depends_on: normalizeList(issue?.depends_on),
    dependency_justification: dependencyJustification(issue, wave),
    parallelism_justification: parallelismJustification(issue, wave, controlPolicy),
    feasibility_checks: normalizeList(issue?.feasibility_checks),
    acceptance_checks: normalizeList(issue?.acceptance_checks || issue?.verification_shape),
    approval_treatment: issueApprovalTreatment(issue),
    loop_spec: loopSpec,
  };
}

function aggregateChecks(selectedNodes, field) {
  return unique(selectedNodes.flatMap((node) => normalizeList(node[field])));
}

function aggregateLoopChecks(selectedNodes, field) {
  return unique(selectedNodes.flatMap((node) => normalizeList(node?.loop_spec?.[field])));
}

export function defaultWaveApprovalArtifactPaths({ cwd, plan, wave }) {
  const baseName = `${slugify(plan?.plan_id || "plan")}-${slugify(wave?.wave_id || "wave")}-approval-bundle`;
  const dir = path.join(cwd, "docs", "agents", "approvals");
  return {
    json: path.join(dir, `${baseName}.json`),
    markdown: path.join(dir, `${baseName}.md`),
  };
}

export function buildWaveApprovalBundle({
  plan,
  state = {},
  waveId = "",
  sourcePlanPath = "",
  generatedAt = nowIso(),
} = {}) {
  if (!plan || typeof plan !== "object") {
    throw new Error("A Ralph run plan is required to build a wave approval bundle.");
  }

  const wave = findWave(plan, waveId);
  const controlPolicy = plan?.control_policy || {};
  const selectedNodes = (Array.isArray(wave?.issues) ? wave.issues : []).map((issue) =>
    selectedNodeRecord(issue, wave, controlPolicy)
  );
  const waveApproval = state?.wave_approvals?.[normalizeText(wave.wave_id)] || {};
  const feasibilityChecks = unique([
    ...selectedNodes.flatMap((node) => node.feasibility_checks),
    ...normalizeList(wave?.branch_local_pause_on),
  ]);
  const expectedAcceptanceChecks = aggregateChecks(selectedNodes, "acceptance_checks");
  const stopConditions = aggregateLoopChecks(selectedNodes, "stop_conditions");
  const escalationConditions = aggregateLoopChecks(selectedNodes, "escalation_rules");
  const heightenedNodes = selectedNodes
    .filter((node) => normalizeText(node.approval_treatment.level) !== "default")
    .map((node) => ({
      issue_id: node.issue_id,
      dag_node_id: node.dag_node_id,
      level: node.approval_treatment.level,
      reason: node.approval_treatment.reason,
    }));

  return {
    schema_version: "wave-approval-bundle/v1",
    bundle_id: `wave-approval-${slugify(plan?.plan_id)}-${slugify(wave?.wave_id)}`,
    approval_unit: normalizeText(controlPolicy?.approval_unit) || "wave-bundle",
    plan_id: normalizeText(plan?.plan_id),
    parent_issue: normalizeText(plan?.parent_issue),
    source_plan: normalizeText(sourcePlanPath || state?.source_plan),
    generated_at: generatedAt,
    approval: {
      status: normalizeText(waveApproval.status) || "pending",
      unit: normalizeText(controlPolicy?.approval_unit) || "wave-bundle",
      approved_by: normalizeText(waveApproval.approved_by),
      approved_at: normalizeText(waveApproval.approved_at),
    },
    wave: {
      wave_id: normalizeText(wave?.wave_id),
      rationale: normalizeText(wave?.rationale),
      parallel: wave?.parallel === true,
      selected_issue_ids: selectedNodes.map((node) => node.issue_id),
      selected_node_ids: selectedNodes.map((node) => node.dag_node_id).filter(Boolean),
    },
    selected_nodes: selectedNodes,
    dependency: {
      justification: unique(selectedNodes.map((node) => node.dependency_justification)),
    },
    parallelism: {
      parallel_wave: wave?.parallel === true,
      max_parallel: Number(controlPolicy?.max_parallel_agents) || 1,
      justification: unique(selectedNodes.map((node) => node.parallelism_justification)),
    },
    feasibility_and_conflict_checks: feasibilityChecks,
    expected_acceptance_checks: expectedAcceptanceChecks,
    stop_and_escalation_conditions: {
      stop: stopConditions,
      escalation: escalationConditions,
    },
    heightened_approval_nodes: heightenedNodes,
  };
}

export function approveWaveBundle(bundle, { approvedBy, approvedAt = nowIso() } = {}) {
  if (!normalizeText(approvedBy)) {
    throw new Error("Wave bundle approval requires approvedBy.");
  }
  return {
    ...bundle,
    approval: {
      ...bundle.approval,
      status: "approved",
      approved_by: normalizeText(approvedBy),
      approved_at: normalizeText(approvedAt),
    },
  };
}

export function renderWaveApprovalBundle(bundle) {
  const lines = [
    "# Wave Approval Bundle",
    "",
    `Plan ID: ${bundle.plan_id}`,
    `Wave ID: ${bundle.wave.wave_id}`,
    `Approval unit: ${bundle.approval_unit}`,
    `Approval status: ${bundle.approval.status}`,
    `Generated at: ${bundle.generated_at}`,
    "",
    "## Wave",
    "",
    `- Parallel: ${bundle.wave.parallel ? "yes" : "no"}`,
    `- Rationale: ${bundle.wave.rationale || "None recorded"}`,
    `- Selected issues: ${bundle.wave.selected_issue_ids.join(", ") || "None"}`,
    `- Selected DAG nodes: ${bundle.wave.selected_node_ids.join(", ") || "None"}`,
    "",
    "## Dependency Justification",
    "",
    ...bundle.dependency.justification.map((item) => `- ${item}`),
    "",
    "## Parallelism Justification",
    "",
    `- Max parallel: ${bundle.parallelism.max_parallel}`,
    ...bundle.parallelism.justification.map((item) => `- ${item}`),
    "",
    "## Selected Nodes",
    "",
  ];

  for (const node of bundle.selected_nodes) {
    lines.push(`- ${node.issue_id ? `#${node.issue_id}` : node.dag_node_id || "<node>"} ${node.title}`);
    lines.push(`  dag_node_id: ${node.dag_node_id || "N/A"}`);
    lines.push(`  loop_spec_id: ${node.loop_spec.loop_spec_id || "N/A"}`);
    lines.push(`  dependency_justification: ${node.dependency_justification}`);
    lines.push(`  parallelism_justification: ${node.parallelism_justification}`);
    if (node.feasibility_checks.length > 0) {
      lines.push(`  feasibility_checks: ${node.feasibility_checks.join(" | ")}`);
    }
    if (node.acceptance_checks.length > 0) {
      lines.push(`  acceptance_checks: ${node.acceptance_checks.join(" | ")}`);
    }
    if (node.approval_treatment.level !== "default") {
      lines.push(`  approval_treatment: ${node.approval_treatment.level}${node.approval_treatment.reason ? ` - ${node.approval_treatment.reason}` : ""}`);
    }
  }

  lines.push("", "## Wave Checks", "");
  for (const item of bundle.feasibility_and_conflict_checks) {
    lines.push(`- ${item}`);
  }
  lines.push("", "## Stop Conditions", "");
  for (const item of bundle.stop_and_escalation_conditions.stop) {
    lines.push(`- ${item}`);
  }
  lines.push("", "## Escalation Conditions", "");
  for (const item of bundle.stop_and_escalation_conditions.escalation) {
    lines.push(`- ${item}`);
  }

  if (bundle.approval.status === "approved") {
    lines.push("", "## Approval", "", `- Approved by: ${bundle.approval.approved_by}`, `- Approved at: ${bundle.approval.approved_at}`);
  }

  return `${lines.join("\n")}\n`;
}
