import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createRalphRunState } from "../scripts/lib/ralph-runner.mjs";
import { buildWorkflowConsoleHtml, loadWorkflowConsoleState, startWorkflowConsole } from "../scripts/lib/workflow-console.mjs";

async function makeWorkspace() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "autopocock-console-"));
  await mkdir(path.join(cwd, ".ai"), { recursive: true });
  await mkdir(path.join(cwd, "docs", "agents", "contexts"), { recursive: true });
  await mkdir(path.join(cwd, "docs", "agents", "reviews"), { recursive: true });
  await mkdir(path.join(cwd, "docs", "agents", "completions"), { recursive: true });
  await mkdir(path.join(cwd, "docs", "agents", "dispatches"), { recursive: true });
  await mkdir(path.join(cwd, "docs", "agents", "approvals"), { recursive: true });
  await mkdir(path.join(cwd, "docs", "QA"), { recursive: true });
  await mkdir(path.join(cwd, "docs", "PRDs"), { recursive: true });
  await mkdir(path.join(cwd, "issues"), { recursive: true });
  await mkdir(path.join(cwd, ".ai", "provider-runs"), { recursive: true });
  await mkdir(path.join(cwd, ".ai", "ralph-runs"), { recursive: true });
  await writeFile(path.join(cwd, ".ai", "ops.config.json"), `${JSON.stringify({
    tracker: "github",
    github: { owner: "nithingm", repo: "AutoPocock", projectNumber: "1" },
    labels: { category: ["enhancement"], state: ["ready-for-agent"] },
    projectSchema: { requiredFields: [], recommendedViews: [] },
    queueFile: ".ai/queue.json",
  }, null, 2)}\n`);
  await writeFile(path.join(cwd, ".ai", "queue.json"), `${JSON.stringify([
    {
      id: "#32",
      title: "Workflow console",
      stage: "Ready for Handoff",
      labels: ["enhancement", "ready-for-agent"],
    },
  ], null, 2)}\n`);
  await writeFile(path.join(cwd, "docs", "agents", "contexts", "2026-05-14-sample-context.md"), "# Context\n\n## Approval\n\n- Status: approved\n");
  await writeFile(path.join(cwd, "docs", "PRDs", "2026-05-14-sample-prd.md"), "# PRD\n\n## Approval\n\n- Status: approved\n");
  await writeFile(path.join(cwd, "issues", "2026-05-14-sample-issues.json"), `${JSON.stringify({
    schema_version: "issue-dag/v1",
    dag_model: "layered-dag/v1",
    source_prd: "docs/PRDs/2026-05-14-sample-prd.md",
    source_prd_status: "approved",
    nodes: [
      {
        id: "node-1",
        title: "Foundation",
        layer: "tracer_bullet",
        type: "foundation",
        goal: "Ship the first slice",
        depends_on: [],
        acceptance_criteria: ["Foundation complete"],
        verification_plan: { automated: ["node --test"], manual: ["Inspect"], evidence_expected: ["Passing test output"] },
        write_surface: ["scripts/**"],
        risk: "medium",
        conflict_surface: "medium",
        provider_eligible: true,
        human_gate_required: false,
        parallelizable: false,
        status: "ready_for_handoff",
        review_status: "pending",
        qa_status: "pending",
        conflict_reasoning: "Foundational node",
      },
      {
        id: "node-2",
        title: "Follow-on",
        layer: "implementation_slice",
        type: "implementation",
        goal: "Continue",
        depends_on: ["node-1"],
        acceptance_criteria: ["Continue complete"],
        verification_plan: { automated: ["node --test"], manual: ["Inspect"], evidence_expected: ["Manual validation note"] },
        write_surface: ["docs/**"],
        risk: "low",
        conflict_surface: "low",
        provider_eligible: true,
        human_gate_required: false,
        parallelizable: true,
        status: "blocked_dependency",
        review_status: "pending",
        qa_status: "pending",
        conflict_reasoning: "Depends on node-1",
      },
    ],
    edges: [{ from: "node-1", to: "node-2" }],
    waves: [
      { wave: 1, runnable_nodes: ["node-1"], blocked_nodes: [], reason: "Foundation." },
      { wave: 2, runnable_nodes: ["node-2"], blocked_nodes: [], reason: "After foundation." },
    ],
    progression: {
      completed_nodes: [],
      runnable_nodes: ["node-1"],
      blocked_nodes: ["node-2"],
    },
  }, null, 2)}\n`);
  await writeFile(path.join(cwd, "docs", "agents", "dispatches", "dispatch-1.json"), `${JSON.stringify({
    dispatch_id: "dispatch-1",
    issue_id: "32",
    title: "Workflow console",
    status: "queued",
    source: "manual",
    isolation_mode: "worktree",
    worktree_path: path.join(cwd, ".worktrees", "32-workflow-console"),
    handoff_artifact: path.join(cwd, "docs", "agents", "handoffs", "32.md"),
    completion_report_target: path.join(cwd, "docs", "agents", "completions", "dispatch-1-completion.md"),
    forbidden_actions: ["merge PR"],
    claim: {
      claimed_by: "runner-name",
      claimed_at: "2026-05-14T20:00:00.000Z",
      isolation_mode: "worktree",
    },
  }, null, 2)}\n`);
  const plan = {
    schema_version: "ralph-run-plan/v1",
    plan_id: "plan-32",
    parent_issue: "32",
    control_policy: {
      approval_unit: "wave-bundle",
      shared_foundation_triggers: ["unstable shared contracts"],
    },
    waves: [
      {
        wave_id: "wave-1",
        parallel: true,
        branch_local_pause_on: ["Canonical node fields drift underneath scheduling."],
        issues: [
          {
            issue_id: "32",
            title: "Workflow console",
            worker_mode: "single",
            retry_budget: 2,
            verification_shape: ["node --test tests/workflow-console.test.mjs"],
            dag_node_id: "node-1",
          },
        ],
      },
    ],
  };
  const planPath = path.join(cwd, "docs", "agents", "approvals", "plan-32.json");
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  let ralphState = createRalphRunState(plan, { source_plan: planPath });
  ralphState = {
    ...ralphState,
    wave_approvals: {
      "wave-1": {
        status: "pending",
        approved_by: "",
        approved_at: "",
        bundle_json_path: "docs/agents/approvals/wave-1.json",
        bundle_markdown_path: "docs/agents/approvals/wave-1.md",
      },
    },
  };
  await writeFile(path.join(cwd, ".ai", "ralph-runs", "plan-32.json"), `${JSON.stringify(ralphState, null, 2)}\n`);
  await writeFile(path.join(cwd, "docs", "agents", "approvals", "wave-1.json"), `${JSON.stringify({
    schema_version: "wave-approval-bundle/v1",
    approval_unit: "wave-bundle",
    wave: {
      wave_id: "wave-1",
      parallel: true,
      selected_node_ids: ["node-1"],
    },
    approval: {
      status: "approved",
      approved_by: "solo-operator",
      approved_at: "2026-05-14T20:00:00.000Z",
      unit: "wave-bundle",
    },
    artifacts: {
      bundle_json_path: "docs/agents/approvals/wave-1.json",
      bundle_markdown_path: "docs/agents/approvals/wave-1.md",
    },
    selected_nodes: [
      {
        issue_id: "32",
        dag_node_id: "node-1",
        title: "Workflow console",
        loop_spec: {
          loop_spec_id: "loop-spec-node-1",
          dag_node_id: "node-1",
          title: "Workflow console",
          owned_surface: ["scripts/**"],
          verification_plan: {
            automated: ["node --test"],
          },
          dependencies: {
            depends_on: [],
            wave: 1,
          },
          execution_contract: {
            provider_eligible: true,
            human_gate_required: false,
          },
        },
      },
    ],
  }, null, 2)}\n`);
  await writeFile(path.join(cwd, ".ai", "provider-runs", "provider-run-1.json"), `${JSON.stringify({
    run_id: "provider-run-1",
    provider: "codex",
    adapter_mode: "live",
    dispatch_id: "dispatch-1",
    issue_id: "32",
    status: "running",
    execution: { isolation_mode: "worktree" },
    stdout_log_path: path.join(cwd, ".ai", "provider-runs", "provider-run-1.log"),
    stderr_log_path: path.join(cwd, ".ai", "provider-runs", "provider-run-1.err"),
  }, null, 2)}\n`);
  await writeFile(path.join(cwd, "docs", "agents", "completions", "2026-05-14-32-completion.md"), "# Completion Report\n");
  await writeFile(path.join(cwd, "docs", "agents", "reviews", "2026-05-14-32-review-prep.md"), "# Review Prep\n");
  await writeFile(path.join(cwd, "docs", "QA", "2026-05-14-32-qa.md"), "# QA Decision\n");
  return cwd;
}

test("workflow console state loads the six workflow planes from durable artifacts", async () => {
  const cwd = await makeWorkspace();
  const state = await loadWorkflowConsoleState(cwd);

  assert.equal(state.contexts.length, 1);
  assert.equal(state.prds.length, 1);
  assert.equal(state.graph.data.nodes.length, 2);
  assert.equal(state.graph.quality.summary.total_nodes, 2);
  assert.equal(state.graph.syncPreview.issues.length, 2);
  assert.equal(state.graph.waveExecution.launchableNodeIds[0], "node-1");
  assert.equal(state.onboarding.length >= 5, true);
  assert.equal(state.queue.dispatchable, 1);
  assert.equal(state.ralph.snapshot.current_wave.wave_id, "wave-1");
  assert.equal(state.execution.summary.active, 1);
  assert.equal(state.review.completions.length, 1);
});

test("workflow console HTML exposes setup, context, PRD, graph, execution, and review views", async () => {
  const cwd = await makeWorkspace();
  const state = await loadWorkflowConsoleState(cwd);
  const html = buildWorkflowConsoleHtml(state, { host: "127.0.0.1", port: 4173 });

  assert.match(html, /Workflow Console/);
  assert.match(html, /data-view="setup"/);
  assert.match(html, /data-view="context"/);
  assert.match(html, /data-view="prd"/);
  assert.match(html, /data-view="graph"/);
  assert.match(html, /data-view="execution"/);
  assert.match(html, /data-view="review"/);
  assert.match(html, /Graph Quality/);
  assert.match(html, /GitHub Sync Preview/);
  assert.match(html, /Wave Controls/);
  assert.match(html, /Onboarding Checks/);
  assert.match(html, /Why Blocked/);
  assert.match(html, /Repair Decisions/);
  assert.match(html, /Execution Control/);
  assert.match(html, /Happy Path/);
  assert.match(html, /Ralph Run/);
  assert.match(html, /Launchable previews:/);
  assert.match(html, /Apply review decision/);
  assert.match(html, /Apply QA decision/);
  assert.match(html, /Reclaim dispatch/);
});

test("workflow console server supports artifact editing, execution controls, review\/qa decisions, and reclaim controls", async () => {
  const cwd = await makeWorkspace();
  const { server, port } = await startWorkflowConsole({ cwd, host: "127.0.0.1", port: 0 });
  try {
    const base = `http://127.0.0.1:${port}`;

    const stateResponse = await fetch(`${base}/api/state`);
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json();
    assert.equal(state.graph.data.nodes[0].id, "node-1");

    const claimResponse = await fetch(`${base}/api/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dispatch: "docs/agents/dispatches/dispatch-1.json",
        claimedBy: "runner-32",
        isolationMode: "worktree",
      }),
    });
    assert.equal(claimResponse.status, 200);

    const prepareResponse = await fetch(`${base}/api/prepare-worktree`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dispatch: "docs/agents/dispatches/dispatch-1.json",
      }),
    });
    assert.equal(prepareResponse.status, 200);

    const approveWaveResponse = await fetch(`${base}/api/approve-wave`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(approveWaveResponse.status, 200);

    const editPath = "docs/agents/contexts/2026-05-14-sample-context.md";
    const saveResponse = await fetch(`${base}/api/artifact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: editPath, content: "# Updated Context\n" }),
    });
    assert.equal(saveResponse.status, 200);
    assert.equal(await readFile(path.join(cwd, editPath), "utf8"), "# Updated Context\n");

    const reviewResponse = await fetch(`${base}/api/review-decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dag: "issues/2026-05-14-sample-issues.json",
        issue: "32",
        node: "node-1",
        decision: "approve",
        approvedBy: "solo-operator",
        reason: "Looks good",
      }),
    });
    assert.equal(reviewResponse.status, 200);

    const qaResponse = await fetch(`${base}/api/qa-decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dag: "issues/2026-05-14-sample-issues.json",
        issue: "32",
        node: "node-1",
        decision: "pass",
        approvedBy: "solo-operator",
        reason: "Tests passed",
      }),
    });
    assert.equal(qaResponse.status, 200);
    const dag = JSON.parse(await readFile(path.join(cwd, "issues", "2026-05-14-sample-issues.json"), "utf8"));
    assert.equal(dag.nodes[0].status, "done");
    assert.equal(dag.nodes[1].status, "ready_for_handoff");

    const stagedRunResponse = await fetch(`${base}/api/staged-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dag: "issues/2026-05-14-sample-issues.json",
        approvedBundle: "docs/agents/approvals/wave-1.json",
        plan: "docs/agents/approvals/plan-32.json",
        state: ".ai/ralph-runs/plan-32.json",
        nodeId: "node-1",
        issueId: "32",
        executionOutcome: "succeeded",
      }),
    });
    assert.equal(stagedRunResponse.status, 200);

    const reclaimResponse = await fetch(`${base}/api/reclaim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dispatch: "docs/agents/dispatches/dispatch-1.json",
        approvedBy: "solo-operator",
        reason: "Reclaim from console",
      }),
    });
    assert.equal(reclaimResponse.status, 200);
    const dispatch = JSON.parse(await readFile(path.join(cwd, "docs", "agents", "dispatches", "dispatch-1.json"), "utf8"));
    assert.equal(dispatch.status, "queued");
    assert.equal(dispatch.claim, null);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
