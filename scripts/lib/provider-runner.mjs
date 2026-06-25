import path from "node:path";
import { suggestedStageForResultStatus } from "./workflow-core.mjs";
import { preflightApprovedWaveBundle } from "./dag-wave-orchestrator.mjs";
import {
  applyAutomaticBugLoopRepair,
  applyCompletionEvidence,
  applyExecutionOutcome,
  applyQaOutcome,
  applyReviewOutcome,
  recomputeGraphProgression,
} from "./graph-progression.mjs";
import {
  applyRalphRunAction,
  createRalphRunState,
} from "./ralph-runner.mjs";

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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeIssueId(value) {
  return String(value || "").replace(/^#/, "").trim();
}

function latestRepairDecision(graph, nodeId) {
  return (graph?.progression?.repair_decisions || []).find((entry) => normalizeText(entry?.node_id) === normalizeText(nodeId)) || null;
}

function approvedBundleEntryForTarget(approvedBundle, { nodeId, issueId }) {
  const normalizedNodeId = normalizeText(nodeId);
  const normalizedIssueId = normalizeIssueId(issueId);
  const selectedNodes = Array.isArray(approvedBundle?.selected_nodes) ? approvedBundle.selected_nodes : [];

  if (normalizedNodeId) {
    const byNode = selectedNodes.find((entry) => normalizeText(entry?.dag_node_id) === normalizedNodeId);
    if (byNode) {
      return byNode;
    }
  }

  if (normalizedIssueId) {
    const byIssue = selectedNodes.find((entry) => normalizeIssueId(entry?.issue_id) === normalizedIssueId);
    if (byIssue) {
      return byIssue;
    }
  }

  return selectedNodes[0] || null;
}

function approvalPaths(approvedBundle) {
  return {
    bundle_json_path: normalizeText(approvedBundle?.artifacts?.bundle_json_path),
    bundle_markdown_path: normalizeText(approvedBundle?.artifacts?.bundle_markdown_path),
  };
}

function normalizeFailurePolicy(failurePolicy = {}) {
  return {
    reason: normalizeText(failurePolicy.reason),
    reason_code: normalizeText(failurePolicy.reason_code),
    shared_foundation_kind: normalizeText(failurePolicy.shared_foundation_kind),
  };
}

function applyRepairAndPolicy({
  graph,
  plan,
  state,
  issueId,
  nodeId,
  repair,
  actor,
  failurePolicy,
}) {
  const repairedGraph = applyAutomaticBugLoopRepair(graph, {
    nodeId,
    sourceNodeIds: repair?.sourceNodeIds || [],
    primarySourceNodeId: repair?.primarySourceNodeId || "",
    failureKind: repair?.failureKind || failurePolicy.reason_code || "validation_fail",
    failedWaveId: repair?.failedWaveId || "",
    failedAcceptanceCriteria: repair?.failedAcceptanceCriteria || [],
    title: repair?.title || "",
    goal: repair?.goal || "",
    acceptanceCriteria: repair?.acceptanceCriteria || [],
    verificationPlan: repair?.verificationPlan || {},
    writeSurface: repair?.writeSurface || [],
    conflictReasoning: repair?.conflictReasoning || "",
    actor,
    reason: repair?.reason || failurePolicy.reason,
  });

  const repairDecision = latestRepairDecision(repairedGraph, nodeId);
  let nextState = state;
  if (plan && state && issueId) {
    nextState = applyRalphRunAction(plan, state, {
      kind: "failure_policy",
      issue_id: issueId,
      actor,
      failure_kind: repairDecision?.failure_kind || repair?.failureKind || "validation_fail",
      reason_code: failurePolicy.reason_code || repairDecision?.reason_code || "repair_created",
      shared_foundation_kind: failurePolicy.shared_foundation_kind,
      reason: failurePolicy.reason || repairDecision?.reason || "Automatic repair or escalation was recorded for the failed single-run stage.",
    });
  }

  return {
    graph: repairedGraph,
    state: nextState,
    repair_decision: repairDecision,
  };
}

export function orchestrateStagedSingleRun({
  dag,
  approvedBundle,
  reconciliation = {},
  loopSpecs = [],
  graph = null,
  plan = null,
  state = null,
  nodeId = "",
  issueId = "",
  actor = "solo-operator",
  executionResult = {},
} = {}) {
  if (!dag || !approvedBundle) {
    throw new Error("A DAG and approved wave bundle are required.");
  }

  const preflight = preflightApprovedWaveBundle({
    dag,
    approvedBundle,
    reconciliation,
    loopSpecs,
  });
  const bundleEntry = approvedBundleEntryForTarget(approvedBundle, { nodeId, issueId });
  const resolvedNodeId = normalizeText(nodeId || bundleEntry?.dag_node_id);
  const resolvedIssueId = normalizeIssueId(issueId || bundleEntry?.issue_id);
  const withheld = preflight.withheld.find((entry) => normalizeText(entry?.node_id) === resolvedNodeId) || null;
  const launchable = preflight.launchable.entries.find((entry) => normalizeText(entry?.node_id) === resolvedNodeId) || null;

  let nextGraph = graph ? recomputeGraphProgression(graph) : null;
  let nextState = plan ? clone(state || createRalphRunState(plan)) : null;
  const approval = approvalPaths(approvedBundle);

  if (plan && nextState && normalizeText(approvedBundle?.wave?.wave_id) && nextState.wave_approvals?.[normalizeText(approvedBundle.wave.wave_id)]?.status !== "approved") {
    nextState = applyRalphRunAction(plan, nextState, {
      kind: "approve_wave",
      wave_id: normalizeText(approvedBundle.wave.wave_id),
      actor: normalizeText(approvedBundle?.approval?.approved_by) || actor,
      bundle_json_path: approval.bundle_json_path,
      bundle_markdown_path: approval.bundle_markdown_path,
      reason: "Approved wave bundle imported into the staged single-run path.",
    });
  }

  if (withheld) {
    if (plan && nextState && resolvedIssueId) {
      nextState = applyRalphRunAction(plan, nextState, {
        kind: "block",
        issue_id: resolvedIssueId,
        actor,
        reason: `Preflight withheld ${resolvedNodeId}: ${withheld.durable_reasons.join(" | ")}`,
      });
    }

    return {
      schema_version: "provider-staged-single-run/v1",
      wave_id: preflight.wave_id,
      graph_id: preflight.graph_id,
      node_id: resolvedNodeId,
      issue_id: resolvedIssueId,
      stages: {
        intake: {
          approval_status: normalizeText(approvedBundle?.approval?.status).toLowerCase(),
          selected_node_ids: preflight.reconciled_wave.selected_node_ids,
          withheld_node_ids: preflight.reconciled_wave.withheld_node_ids,
        },
        preflight: {
          status: "withheld",
          launchable: false,
          durable_reasons: withheld.durable_reasons,
        },
        execution: {
          status: "not_started",
        },
        progression: {
          status: "unchanged",
          runnable_nodes: nextGraph?.progression?.runnable_nodes || [],
        },
        failure_policy: {
          decision_scope: "",
          global_status: nextState?.global?.status || "",
        },
      },
      artifacts: {
        preflight,
        graph: nextGraph,
        state: nextState,
      },
    };
  }

  if (!launchable) {
    throw new Error(`Node ${resolvedNodeId || "<unknown>"} is neither launchable nor withheld in the approved bundle preflight.`);
  }

  if (plan && nextState && resolvedIssueId) {
    nextState = applyRalphRunAction(plan, nextState, {
      kind: "start",
      issue_id: resolvedIssueId,
      actor,
      reason: `Starting staged single run for ${resolvedNodeId}.`,
    });
  }

  const executionOutcome = normalizeText(executionResult.executionOutcome || executionResult.outcome || "succeeded").toLowerCase();
  const failurePolicy = normalizeFailurePolicy(executionResult.failurePolicy);
  let progressionStatus = "";
  let repairDecision = null;

  if (nextGraph) {
    nextGraph = applyExecutionOutcome(nextGraph, {
      nodeId: resolvedNodeId,
      outcome: executionOutcome,
      actor,
      reason: normalizeText(executionResult.reason),
    });

    if (executionOutcome === "succeeded" && executionResult.completionEvidence) {
      nextGraph = applyCompletionEvidence(nextGraph, {
        nodeId: resolvedNodeId,
        evidence: executionResult.completionEvidence,
        actor,
        reason: normalizeText(executionResult.reason),
      });
    }

    const currentNode = nextGraph.nodes.find((node) => normalizeText(node?.id) === resolvedNodeId);
    progressionStatus = normalizeText(currentNode?.state?.progression_status);

    if (progressionStatus === "validation_failed" && executionResult.repair) {
      const repaired = applyRepairAndPolicy({
        graph: nextGraph,
        plan,
        state: nextState,
        issueId: resolvedIssueId,
        nodeId: resolvedNodeId,
        repair: executionResult.repair,
        actor,
        failurePolicy: {
          ...failurePolicy,
          reason: failurePolicy.reason || normalizeText(executionResult.reason),
          reason_code: failurePolicy.reason_code || "repair_created",
        },
      });
      nextGraph = repaired.graph;
      nextState = repaired.state;
      repairDecision = repaired.repair_decision;
    } else if (progressionStatus === "review" && executionResult.reviewOutcome) {
      nextGraph = applyReviewOutcome(nextGraph, {
        nodeId: resolvedNodeId,
        outcome: executionResult.reviewOutcome,
        actor,
        reason: normalizeText(executionResult.reason),
      });

      if (normalizeText(executionResult.reviewOutcome).toLowerCase() === "approved" && executionResult.qaOutcome) {
        nextGraph = applyQaOutcome(nextGraph, {
          nodeId: resolvedNodeId,
          outcome: executionResult.qaOutcome,
          actor,
          reason: normalizeText(executionResult.reason),
        });
      }
    } else if (["bug_loop", "validation_failed"].includes(progressionStatus) && executionResult.repair) {
      const repaired = applyRepairAndPolicy({
        graph: nextGraph,
        plan,
        state: nextState,
        issueId: resolvedIssueId,
        nodeId: resolvedNodeId,
        repair: executionResult.repair,
        actor,
        failurePolicy: {
          ...failurePolicy,
          reason: failurePolicy.reason || normalizeText(executionResult.reason),
          reason_code: failurePolicy.reason_code || "repair_created",
        },
      });
      nextGraph = repaired.graph;
      nextState = repaired.state;
      repairDecision = repaired.repair_decision;
    } else if (executionOutcome !== "succeeded" && plan && nextState && resolvedIssueId) {
      nextState = applyRalphRunAction(plan, nextState, {
        kind: "failure_policy",
        issue_id: resolvedIssueId,
        actor,
        failure_kind: executionOutcome,
        reason_code: failurePolicy.reason_code || executionOutcome,
        shared_foundation_kind: failurePolicy.shared_foundation_kind,
        reason: failurePolicy.reason || normalizeText(executionResult.reason) || `Execution ${executionOutcome} for ${resolvedNodeId}.`,
      });
    }

    const finalNode = nextGraph.nodes.find((node) => normalizeText(node?.id) === resolvedNodeId);
    progressionStatus = normalizeText(finalNode?.state?.progression_status);
    if (progressionStatus === "done" && plan && nextState && resolvedIssueId) {
      nextState = applyRalphRunAction(plan, nextState, {
        kind: "complete",
        issue_id: resolvedIssueId,
        actor,
        reason: `Completed staged single run for ${resolvedNodeId}.`,
      });
    }
  }

  return {
    schema_version: "provider-staged-single-run/v1",
    wave_id: preflight.wave_id,
    graph_id: preflight.graph_id,
    node_id: resolvedNodeId,
    issue_id: resolvedIssueId,
    stages: {
      intake: {
        approval_status: normalizeText(approvedBundle?.approval?.status).toLowerCase(),
        selected_node_ids: preflight.reconciled_wave.selected_node_ids,
        withheld_node_ids: preflight.reconciled_wave.withheld_node_ids,
      },
      preflight: {
        status: "launchable",
        launchable: true,
        durable_reasons: [],
      },
      execution: {
        status: executionOutcome,
      },
      progression: {
        status: progressionStatus,
        runnable_nodes: nextGraph?.progression?.runnable_nodes || [],
        repair_decision: repairDecision,
      },
      failure_policy: {
        decision_scope: normalizeText(nextState?.issue_states?.[resolvedIssueId]?.decision_scope || ""),
        global_status: normalizeText(nextState?.global?.status || ""),
        reason_code: normalizeText(nextState?.issue_states?.[resolvedIssueId]?.reason_code || nextState?.global?.reason_code || ""),
      },
    },
    artifacts: {
      preflight,
      graph: nextGraph,
      state: nextState,
    },
  };
}

function listSectionItems(markdown, heading) {
  const text = normalizeText(markdown);
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingMatch = new RegExp(`^##\\s+${escaped}\\s*$`, "m").exec(text);
  if (!headingMatch) {
    return [];
  }

  const start = headingMatch.index + headingMatch[0].length;
  const rest = text.slice(start).replace(/^\n+/, "");
  const nextHeadingIndex = rest.search(/^##\s+/m);
  const body = nextHeadingIndex === -1 ? rest : rest.slice(0, nextHeadingIndex);

  return body
    .split("\n")
    .map((line) => line.match(/^\s*-\s+(.*)$/)?.[1] || "")
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

export function createProviderRunId(dispatchId, nowIso) {
  const timestamp = String(nowIso || "").replace(/[:.]/g, "-");
  return `provider-run-${timestamp}-${slugify(dispatchId)}`;
}

export function buildProviderRunBundle({ dispatch, loopSpec, provider = "codex", loopSpecPath = "" }) {
  return {
    schema_version: "provider-run-bundle/v2",
    provider,
    dispatch_id: dispatch.dispatch_id,
    issue_id: dispatch.issue_id,
    title: dispatch.title,
    loop_spec_id: loopSpec.loop_spec_id,
    loop_spec_path: loopSpecPath,
    goal: loopSpec.goal || "",
    acceptance_criteria: loopSpec.acceptance_criteria || [],
    handoff_artifact: dispatch.handoff_artifact,
    completion_report_target: dispatch.completion_report_target,
    execution: {
      isolation_mode: loopSpec.execution_contract?.isolation_mode || dispatch.isolation_mode,
      expected_branch: loopSpec.execution_contract?.expected_branch || dispatch.expected_branch,
      worktree_path: loopSpec.execution_contract?.worktree_path || dispatch.worktree_path || "",
      claimed_by: loopSpec.execution_contract?.claimed_by || dispatch.claim?.claimed_by || "",
      retry_budget: loopSpec.execution_contract?.retry_budget ?? 1,
      stop_conditions: loopSpec.execution_contract?.stop_conditions || [],
      escalation_rules: loopSpec.execution_contract?.escalation_rules || [],
    },
    boundaries: {
      owned_surface: loopSpec.owned_surface || [],
      forbidden_actions: loopSpec.boundaries?.forbidden_actions || dispatch.forbidden_actions || [],
      allowed_commands: loopSpec.boundaries?.allowed_commands || dispatch.allowed_commands || [],
      in_scope: loopSpec.boundaries?.in_scope || [],
      out_of_scope: loopSpec.boundaries?.out_of_scope || [],
    },
    verification: {
      automated: loopSpec.verification_plan?.automated || [],
      manual: loopSpec.verification_plan?.manual || [],
      evidence_expected: loopSpec.verification_plan?.evidence_expected || [],
    },
    source: dispatch.source,
    created_from_scheduler_plan: dispatch.created_from_scheduler_plan || "",
  };
}

export function buildRuntimeBlockedResult({
  bundle,
  verificationCommand,
  summary,
  gap,
  stopCondition,
  escalationReason,
}) {
  return {
    providerRunStatus: "blocked",
    runtime: {
      stop_condition: stopCondition,
      escalation_reason: escalationReason,
    },
    result: {
      status: "blocked",
      summary,
      changedAreas: ["docs/agents/completions", ".ai/provider-runs"],
      verificationCommands: [verificationCommand],
      verificationResults: [
        `Loaded claimed dispatch ${bundle.dispatch_id}.`,
        `Loaded Loop Spec ${path.basename(bundle.loop_spec_path || "loop-spec.json")}.`,
        `Assembled provider-neutral run bundle for provider ${bundle.provider}.`,
        `Runtime stop condition triggered: ${stopCondition}`,
      ],
      gaps: [gap],
      risks: ["Runtime preflight blocked execution before provider work began."],
      followUps: [escalationReason],
      artifactsUpdated: ["Provider Run metadata", "Completion Report"],
    },
  };
}

export function executeCodexStub({ bundle, stubResult = "success" }) {
  const supported = new Set(["success", "blocked"]);
  if (!supported.has(stubResult)) {
    throw new Error(`Unsupported stub result: ${stubResult}. Use success or blocked.`);
  }

  const sharedVerification = [
    `Loaded claimed dispatch ${bundle.dispatch_id}.`,
    `Loaded Loop Spec ${path.basename(bundle.loop_spec_path || "loop-spec.json")}.`,
    `Loaded handoff artifact ${path.basename(bundle.handoff_artifact)}.`,
    `Assembled provider-neutral run bundle for provider ${bundle.provider}.`,
  ];

  if (stubResult === "blocked") {
    return {
      status: "blocked",
      summary: "Provider execution blocked after bundle assembly. The Codex adapter boundary exists, but this run remained stub-backed and did not apply code changes.",
      changedAreas: ["None"],
      verificationCommands: ["pnpm ops run -- --dispatch <dispatch> --execute --stub-result blocked"],
      verificationResults: sharedVerification.concat("Persisted blocked Provider Run metadata and wrote a blocked Completion Report."),
      gaps: [
        "No live Codex provider invocation occurred.",
        "No code changes were applied from the execution boundary.",
      ],
      risks: [
        "Provider execution is still stub-backed.",
        "A live Codex adapter is still required before AFK code execution is real.",
      ],
      followUps: [
        "Implement a live Codex adapter behind the provider contract.",
      ],
      artifactsUpdated: ["Provider Run metadata", "Completion Report"],
    };
  }

  return {
    status: "needs human review",
    summary: "Provider execution path succeeded through the Codex stub boundary. The runner loaded the claimed dispatch and handoff, assembled a provider-neutral bundle, persisted Provider Run metadata, and wrote a real Completion Report.",
    changedAreas: [
      "docs/agents/completions",
      ".ai/provider-runs",
    ],
    verificationCommands: ["pnpm ops run -- --dispatch <dispatch> --execute"],
    verificationResults: sharedVerification.concat("Persisted successful Provider Run metadata and wrote a Completion Report."),
    gaps: [
      "No live Codex provider invocation occurred.",
      "No implementation changes were applied beyond execution artifacts.",
    ],
    risks: [
      "The execution boundary is still stub-backed.",
    ],
    followUps: [
      "Replace the stub boundary with a live Codex adapter.",
    ],
    artifactsUpdated: ["Provider Run metadata", "Completion Report"],
  };
}

export function renderExecutionCompletionReport({
  dispatch,
  providerRun,
  result,
  loopSpecPath,
  bundlePath,
  metadataPath,
}) {
  const suggestedStage = suggestedStageForResultStatus(result.status);
  return `# Completion Report

## Result

- Status: ${result.status}
- Summary: ${result.summary}

## Changes

- Files or areas changed: ${result.changedAreas.join(", ")}
- Reason: Executed dispatch ${dispatch.dispatch_id} through the provider-run boundary and persisted the resulting workflow artifacts.

## Verification

- Commands run: ${result.verificationCommands.join(" | ")}
- Results: ${result.verificationResults.join(" | ")}
- Gaps: ${result.gaps.join(" | ")}

## Risks

- Residual risks: ${result.risks.join(" | ")}

## Follow-ups

- Bugs: None
- Issues: ${result.followUps.join(" | ")}

## Artifacts

- Updated: ${dispatch.handoff_artifact}, ${loopSpecPath || "N/A"}, ${bundlePath}, ${metadataPath}

## Next Stage

- Suggested stage: ${suggestedStage}

## Issue

- Tracker: ${dispatch.issue_id}
`;
}

export function parseCodexFinalMessage(message) {
  const text = normalizeText(message);
  if (!text) {
    return {
      status: "blocked",
      summary: "Codex returned no final message.",
      verification: ["No final message captured from Codex."],
      followUps: ["Inspect the Provider Run metadata and Codex stdout/stderr."],
      gaps: ["Codex final message was empty."],
      risks: ["Live provider output was empty."],
    };
  }

  const lines = text.split("\n");
  const pick = (label) =>
    normalizeText(
      lines.find((line) => line.toLowerCase().startsWith(`${label.toLowerCase()}:`))?.slice(label.length + 1) || "",
    );

  const verification = lines
    .filter((line) => line.toLowerCase().startsWith("verification:"))
    .map((line) => normalizeText(line.slice("verification:".length + 1)))
    .filter(Boolean);

  const followUps = lines
    .filter((line) => line.toLowerCase().startsWith("follow-up:"))
    .map((line) => normalizeText(line.slice("follow-up:".length + 1)))
    .filter(Boolean);

  const status = pick("Status") || "needs human review";
  const summary = pick("Summary") || clipMessage(text, 500);

  return {
    status,
    summary,
    verification: verification.length > 0 ? verification : [clipMessage(text, 500)],
    followUps: followUps.length > 0 ? followUps : ["Review the Codex final message for next steps."],
    gaps: status === "blocked" ? ["Codex reported a blocked execution outcome."] : ["No code changes were applied automatically by this adapter path."],
    risks: ["Live Codex execution remains lightly structured and should be reviewed by the Solo Operator."],
  };
}

export function buildLiveProviderSuccessResult({
  bundle,
  handoffArtifact,
  parsed,
  verificationCommand,
}) {
  return {
    providerRunStatus: parsed.status === "success" ? "succeeded" : "blocked",
    result: {
      status: parsed.status === "success" ? "needs human review" : "blocked",
      summary: parsed.summary,
      changedAreas: ["docs/agents/completions", ".ai/provider-runs"],
      verificationCommands: [verificationCommand],
      verificationResults: [
        `Loaded claimed dispatch ${bundle.dispatch_id}.`,
        `Loaded Loop Spec ${path.basename(bundle.loop_spec_path || "loop-spec.json")}.`,
        `Loaded handoff artifact ${path.basename(handoffArtifact)}.`,
        `Assembled provider-neutral run bundle for provider ${bundle.provider}.`,
        ...parsed.verification,
      ],
      gaps: parsed.gaps,
      risks: parsed.risks,
      followUps: parsed.followUps,
      artifactsUpdated: ["Provider Run metadata", "Completion Report"],
    },
  };
}

export function buildLiveProviderFailureResult({
  bundle,
  handoffArtifact,
  timeoutMs,
  verificationCommand,
  error,
  finalMessage = "",
}) {
  const timedOut = /timed out/i.test(`${error?.message || ""}`) || error?.killed === true;
  return {
    providerRunStatus: "blocked",
    commandStderr: `${error?.stderr || error?.message || error}`,
    result: {
      status: "blocked",
      summary: timedOut
        ? `Live ${bundle.provider} execution exceeded the timeout budget of ${timeoutMs} ms.`
        : `Live ${bundle.provider} execution failed before producing a successful bounded result.`,
      changedAreas: ["docs/agents/completions", ".ai/provider-runs"],
      verificationCommands: [verificationCommand],
      verificationResults: [
        `Loaded claimed dispatch ${bundle.dispatch_id}.`,
        `Loaded Loop Spec ${path.basename(bundle.loop_spec_path || "loop-spec.json")}.`,
        `Loaded handoff artifact ${path.basename(handoffArtifact)}.`,
        `Assembled provider-neutral run bundle for provider ${bundle.provider}.`,
        timedOut
          ? `${bundle.provider} execution was stopped after exceeding ${timeoutMs} ms.`
          : `${bundle.provider} execution failed before a successful bounded result was captured.`,
        finalMessage ? `Captured ${bundle.provider} final message: ${finalMessage}` : `No ${bundle.provider} final message was captured.`,
      ],
      gaps: [
        timedOut ? `Live ${bundle.provider} execution hit the configured timeout budget.` : `Live ${bundle.provider} execution did not complete successfully.`,
        `${error?.stderr || error?.message || error}`,
      ],
      risks: [`The live ${bundle.provider} adapter path is still brittle and requires review.`],
      followUps: ["Inspect the Provider Run metadata and provider output, then retry or narrow the slice."],
      artifactsUpdated: ["Provider Run metadata", "Completion Report"],
    },
  };
}

function clipMessage(value, max = 500) {
  const text = normalizeText(value).replace(/\s+/g, " ");
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1).trimEnd()}...`;
}
