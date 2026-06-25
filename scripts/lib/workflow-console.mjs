import { execFile } from "node:child_process";
import http from "node:http";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { enrichDagWithQuality } from "./dag-quality.mjs";
import { synthesizeDagToGithubPreview } from "./dag-github-sync.mjs";
import { compileLoopSpecFromDagNode } from "./dag-loop-spec-compiler.mjs";
import { expectedTestDimensionsForNode } from "./completion-evidence.mjs";
import { orchestrateStagedSingleRun } from "./provider-runner.mjs";
import { applyQaDecision, applyReviewDecision, renderFollowUpBugArtifact, renderGateDecisionArtifact } from "./review-plane.mjs";
import { applyRalphRunAction, buildRalphRunSnapshot } from "./ralph-runner.mjs";
import { inspectSetupPlane } from "./setup-plane.mjs";
import { ensureWorktreePath } from "./runtime-host.mjs";
import { reclaimDispatchArtifact, validateClaimedDispatchForRun } from "./workflow-core.mjs";

const execFileAsync = promisify(execFile);

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function nowDate() {
  return new Date().toISOString().slice(0, 10);
}

async function commandAvailable(command, args = [], options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      timeout: options.timeout ?? 8000,
      maxBuffer: 1024 * 1024,
    });
    return { available: true, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  } catch (error) {
    return {
      available: false,
      stdout: String(error.stdout || "").trim(),
      stderr: String(error.stderr || error.message || "").trim(),
    };
  }
}

async function loadJson(fullPath) {
  return JSON.parse(await readFile(fullPath, "utf8"));
}

async function listArtifacts(root, relativeDir, extensions = [".md"]) {
  const dir = path.join(root, relativeDir);
  let entries = [];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const items = await Promise.all(
    entries
      .filter((entry) => extensions.includes(path.extname(entry)))
      .map(async (entry) => {
        const fullPath = path.join(dir, entry);
        const info = await stat(fullPath);
        return {
          name: entry,
          path: fullPath,
          relativePath: path.relative(root, fullPath).replace(/\\/g, "/"),
          mtimeMs: info.mtimeMs,
          mtime: info.mtime.toISOString(),
          size: info.size,
        };
      }),
  );

  return items.sort((left, right) => right.mtimeMs - left.mtimeMs);
}

async function readArtifactPreview(fullPath, maxLength = 320) {
  try {
    const content = await readFile(fullPath, "utf8");
    const preview = content.replace(/\s+/g, " ").trim();
    return preview.length <= maxLength ? preview : `${preview.slice(0, maxLength - 1)}...`;
  } catch {
    return "";
  }
}

async function enrichArtifacts(items) {
  return Promise.all(items.map(async (item) => ({
    ...item,
    preview: await readArtifactPreview(item.path),
  })));
}

async function latestJson(root, relativeDir) {
  const entries = await listArtifacts(root, relativeDir, [".json"]);
  if (entries.length === 0) {
    return null;
  }
  const latest = entries[0];
  return {
    artifact: latest,
    data: await loadJson(latest.path),
  };
}

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function issueKey(value) {
  return normalizeText(value).replace(/^#/, "");
}

function deriveWorktreePath(root, artifact) {
  const seed = `${issueKey(artifact?.issue_id) || "dispatch"}-${slugify(artifact?.title || artifact?.dispatch_id || "work")}`;
  return path.join(root, ".worktrees", seed);
}

function blockedReasonSummary(node, dag) {
  const reasons = [];
  const unmet = (Array.isArray(node?.depends_on) ? node.depends_on : []).filter(
    (dependencyId) => !(dag?.progression?.completed_nodes || []).includes(dependencyId),
  );
  if (unmet.length > 0) {
    reasons.push(`Dependencies: ${unmet.join(", ")}`);
  }
  if (normalizeText(node?.state?.progression_reason || node?.progression_reason)) {
    reasons.push(normalizeText(node?.state?.progression_reason || node?.progression_reason));
  }
  if (Array.isArray(node?.quality?.execution_eligibility?.reasons) && node.quality.execution_eligibility.reasons.length > 0) {
    reasons.push(...node.quality.execution_eligibility.reasons.map((entry) => normalizeText(entry)).filter(Boolean));
  }
  return [...new Set(reasons.filter(Boolean))];
}

function buildBlockedNodeReasons(dag) {
  if (!dag || !Array.isArray(dag.nodes)) {
    return [];
  }
  return dag.nodes
    .filter((node) => !["ready_for_handoff", "done"].includes(normalizeText(node?.state?.progression_status || node?.status)))
    .map((node) => ({
      node_id: node.id,
      title: normalizeText(node.title),
      reasons: blockedReasonSummary(node, dag),
    }));
}

function buildRepairDecisionSummary(dag) {
  return Array.isArray(dag?.progression?.repair_decisions) ? dag.progression.repair_decisions : [];
}

function currentQueueSummary(queue) {
  const items = Array.isArray(queue) ? queue : [];
  const dispatchable = items.filter((item) =>
    normalizeText(item?.stage).toLowerCase() === "ready for handoff"
    && (Array.isArray(item?.labels) ? item.labels : []).includes("ready-for-agent")
  );
  return {
    total: items.length,
    dispatchable: dispatchable.length,
    items,
  };
}

async function latestRalphRun(root) {
  const latest = await latestJson(root, path.join(".ai", "ralph-runs"));
  if (!latest) {
    return null;
  }

  const planPath = normalizeText(latest.data?.source_plan);
  if (!planPath) {
    return {
      artifact: latest.artifact,
      state: latest.data,
      plan: null,
      snapshot: null,
    };
  }

  const fullPlanPath = path.isAbsolute(planPath) ? planPath : path.join(root, planPath);
  try {
    const plan = await loadJson(fullPlanPath);
    return {
      artifact: latest.artifact,
      state: latest.data,
      plan,
      snapshot: buildRalphRunSnapshot(plan, latest.data),
    };
  } catch {
    return {
      artifact: latest.artifact,
      state: latest.data,
      plan: null,
      snapshot: null,
    };
  }
}

function buildOnboardingChecks({ setup, config, queueSummary, graph, dispatches, ralph }) {
  return [
    {
      label: "GitHub config",
      ready: setup.github.config_ready === true,
      detail: setup.github.config_ready ? "Configured" : "Missing owner/repo/project reference.",
    },
    {
      label: "Project schema",
      ready: Boolean(config?.projectSchema),
      detail: Boolean(config?.projectSchema) ? "Schema config present" : "Project schema config missing.",
    },
    {
      label: "gh auth",
      ready: setup.prerequisites?.gh?.available === true,
      detail: setup.prerequisites?.gh?.available ? "gh detected" : "gh not available from this workspace.",
    },
    {
      label: "Queue export",
      ready: queueSummary.total > 0,
      detail: queueSummary.total > 0 ? `${queueSummary.total} queue item(s)` : "No queue snapshot loaded.",
    },
    {
      label: "Dispatchable work",
      ready: queueSummary.dispatchable > 0 || (graph?.progression?.runnable_nodes?.length || 0) > 0,
      detail: queueSummary.dispatchable > 0
        ? `${queueSummary.dispatchable} queue item(s) dispatchable`
        : `${graph?.progression?.runnable_nodes?.length || 0} runnable graph node(s)`,
    },
    {
      label: "Dispatch artifacts",
      ready: dispatches.filter((item) => item.path.endsWith(".json")).length > 0,
      detail: `${dispatches.filter((item) => item.path.endsWith(".json")).length} dispatch artifact(s)`,
    },
    {
      label: "Ralph state",
      ready: Boolean(ralph?.snapshot),
      detail: ralph?.snapshot ? `Current wave ${ralph.snapshot.current_wave?.wave_id || "complete"}` : "No Ralph run state loaded.",
    },
  ];
}

function summarizeRuns(runs) {
  return {
    total: runs.length,
    active: runs.filter((run) => run.status === "running").length,
    blocked: runs.filter((run) => run.status === "blocked").length,
    succeeded: runs.filter((run) => run.status === "succeeded").length,
    cancelled: runs.filter((run) => run.status === "cancelled").length,
  };
}

function buildWaveExecutionPreview(dag) {
  if (!dag || !Array.isArray(dag.nodes)) {
    return {
      runnableNow: [],
      blockedNow: [],
      launchableNodeIds: [],
      ineligibleNodeIds: [],
      loopSpecPreview: [],
    };
  }

  const nodeById = new Map(dag.nodes.map((node) => [node.id, node]));
  const runnableNow = Array.isArray(dag.progression?.runnable_nodes) ? dag.progression.runnable_nodes : [];
  const blockedNow = Array.isArray(dag.progression?.blocked_nodes) ? dag.progression.blocked_nodes : [];
  const loopSpecPreview = [];
  const launchableNodeIds = [];
  const ineligibleNodeIds = [];

  for (const nodeId of runnableNow) {
    try {
      const loopSpec = compileLoopSpecFromDagNode({ dag, nodeId });
      loopSpecPreview.push({
        node_id: nodeId,
        loop_spec_id: loopSpec.loop_spec_id,
        issue_id: loopSpec.issue_id,
        queue_class: loopSpec.tracer_bullet?.queue_class || "",
        tracer_bullet: loopSpec.tracer_bullet?.is_tracer_bullet === true,
        retry_budget: loopSpec.execution_contract?.retry_budget ?? 1,
        owned_surface: loopSpec.owned_surface || [],
        stop_conditions: loopSpec.execution_contract?.stop_conditions || [],
      });
      launchableNodeIds.push(nodeId);
    } catch {
      ineligibleNodeIds.push(nodeId);
    }
  }

  return {
    runnableNow,
    blockedNow,
    launchableNodeIds,
    ineligibleNodeIds,
    loopSpecPreview,
  };
}

export async function loadWorkflowConsoleState(root) {
  const configPath = path.join(root, ".ai", "ops.config.json");
  const config = await loadJson(configPath).catch(() => ({}));
  const [
    setup,
    contexts,
    prds,
    dagEntry,
    queueEntry,
    ralphRun,
    dispatches,
    providerRuns,
    completions,
    reviews,
    qaArtifacts,
    feedbackArtifacts,
  ] = await Promise.all([
    inspectSetupPlane({
      cwd: root,
      config,
      commandAvailable,
      loadJson: async (relativePath) => loadJson(path.join(root, relativePath)),
      applyInit: false,
    }),
    enrichArtifacts(await listArtifacts(root, path.join("docs", "agents", "contexts"))),
    enrichArtifacts(await listArtifacts(root, path.join("docs", "PRDs"))),
    latestJson(root, "issues"),
    loadJson(path.join(root, ".ai", "queue.json")).catch(() => null),
    latestRalphRun(root),
    enrichArtifacts(await listArtifacts(root, path.join("docs", "agents", "dispatches"), [".json", ".md"])),
    enrichArtifacts(await listArtifacts(root, path.join(".ai", "provider-runs"), [".json", ".txt", ".log"])),
    enrichArtifacts(await listArtifacts(root, path.join("docs", "agents", "completions"))),
    enrichArtifacts(await listArtifacts(root, path.join("docs", "agents", "reviews"))),
    enrichArtifacts(await listArtifacts(root, path.join("docs", "QA"))),
    enrichArtifacts(await listArtifacts(root, path.join("docs", "agents", "feedback"), [".md", ".json"])),
  ]);

  const runMetadata = [];
  for (const run of providerRuns.filter((item) => item.path.endsWith(".json")).slice(0, 12)) {
    try {
      runMetadata.push({
        ...run,
        data: await loadJson(run.path),
      });
    } catch {
      // Ignore malformed run metadata in the console summary.
    }
  }

  const enrichedGraph = dagEntry
    ? enrichDagWithQuality({
        ...dagEntry.data,
        source_prd: dagEntry.data.source_prd || prds[0]?.relativePath || "",
        source_prd_status: dagEntry.data.source_prd_status || "approved",
      })
    : null;
  const syncPreview = enrichedGraph ? synthesizeDagToGithubPreview(enrichedGraph) : null;
  const waveExecution = enrichedGraph ? buildWaveExecutionPreview(enrichedGraph) : null;
  const queueSummary = currentQueueSummary(queueEntry);
  const blockedReasons = enrichedGraph ? buildBlockedNodeReasons(enrichedGraph) : [];
  const repairDecisions = enrichedGraph ? buildRepairDecisionSummary(enrichedGraph) : [];
  const onboarding = buildOnboardingChecks({
    setup,
    config,
    queueSummary,
    graph: enrichedGraph,
    dispatches,
    ralph: ralphRun,
  });

  return {
    generatedAt: new Date().toISOString(),
    workspace: root,
    setup,
    onboarding,
    contexts,
    prds,
    queue: queueSummary,
    graph: enrichedGraph
      ? {
          artifact: dagEntry.artifact,
          data: enrichedGraph,
          quality: enrichedGraph.quality || null,
          syncPreview,
          waveExecution,
          blockedReasons,
          repairDecisions,
        }
      : null,
    ralph: ralphRun
      ? {
          artifact: ralphRun.artifact,
          state: ralphRun.state,
          plan: ralphRun.plan,
          snapshot: ralphRun.snapshot,
        }
      : null,
    dispatches,
    execution: {
      providerRuns: runMetadata,
      summary: summarizeRuns(runMetadata.map((item) => item.data)),
    },
    review: {
      completions,
      reviews,
      qaArtifacts,
      feedbackArtifacts,
    },
  };
}

function latestEditablePaths(state) {
  return [
    state.contexts[0]?.relativePath,
    state.prds[0]?.relativePath,
    state.graph?.artifact.relativePath,
    state.review.completions[0]?.relativePath,
    state.review.reviews[0]?.relativePath,
  ].filter(Boolean);
}

export function buildWorkflowConsoleHtml(state, { host, port } = {}) {
  const latestDag = state.graph?.data;
  const quality = state.graph?.quality;
  const syncPreview = state.graph?.syncPreview;
  const waveExecution = state.graph?.waveExecution;
  const blockedReasonCards = state.graph?.blockedReasons?.map((entry) => `
    <article class="wave-card">
      <h4>${escapeHtml(entry.node_id)} <span>${escapeHtml(entry.title)}</span></h4>
      <p>${escapeHtml(entry.reasons.join(" | ") || "No explicit blockers recorded.")}</p>
    </article>
  `).join("") || "<p class=\"muted\">No blocked-node reasons available.</p>";
  const repairCards = state.graph?.repairDecisions?.map((entry) => `
    <article class="wave-card">
      <h4>${escapeHtml(entry.node_id)}</h4>
      <p><strong>Action:</strong> ${escapeHtml(entry.action || "N/A")}</p>
      <p><strong>Reason code:</strong> ${escapeHtml(entry.reason_code || "N/A")}</p>
      <p><strong>Repair node:</strong> ${escapeHtml(entry.repair_node_id || "N/A")}</p>
      <p>${escapeHtml(entry.reason || "")}</p>
    </article>
  `).join("") || "<p class=\"muted\">No repair decisions recorded.</p>";
  const onboardingCards = (state.onboarding || []).map((check) => `
    <article class="wave-card status-${check.ready ? "succeeded" : "blocked"}">
      <h4>${escapeHtml(check.label)}</h4>
      <p><strong>Status:</strong> ${escapeHtml(check.ready ? "ready" : "needs attention")}</p>
      <p>${escapeHtml(check.detail)}</p>
    </article>
  `).join("");
  const queueSummary = state.queue || { total: 0, dispatchable: 0 };
  const ralphSnapshot = state.ralph?.snapshot || null;
  const ralphRunnableCards = ralphSnapshot?.runnable?.map((issue) => `
    <article class="wave-card">
      <h4>#${escapeHtml(issue.issue_id)} ${escapeHtml(issue.title)}</h4>
      <p><strong>Status:</strong> ${escapeHtml(issue.status)}</p>
      <p><strong>Mode:</strong> ${escapeHtml(issue.worker_mode || "single")}</p>
      <p><strong>Attempts:</strong> ${escapeHtml(String(issue.attempts))}/${escapeHtml(String(issue.retry_budget))}</p>
    </article>
  `).join("") || "<p class=\"muted\">No Ralph run state loaded.</p>";
  const dependencyEdges = latestDag?.edges?.map((edge) => `<li><code>${escapeHtml(edge.from)}</code> -> <code>${escapeHtml(edge.to)}</code></li>`).join("") || "<li>No DAG loaded.</li>";
  const waveCards = latestDag?.waves?.map((wave) => `
    <article class="wave-card">
      <h4>Wave ${wave.wave}</h4>
      <p><strong>Runnable:</strong> ${escapeHtml(wave.runnable_nodes.join(", ") || "None")}</p>
      <p><strong>Blocked:</strong> ${escapeHtml(wave.blocked_nodes.join(", ") || "None")}</p>
      <p>${escapeHtml(wave.reason)}</p>
    </article>
  `).join("") || "<p class=\"muted\">No execution waves available.</p>";
  const graphNodes = latestDag?.nodes?.map((node) => `
    <article class="node-card risk-${escapeHtml(node.risk)}">
      <h4>${escapeHtml(node.id)} <span>${escapeHtml(node.title)}</span></h4>
      <p><strong>Status:</strong> ${escapeHtml(node.status)} / review ${escapeHtml(node.review_status)} / qa ${escapeHtml(node.qa_status)}</p>
      <p><strong>Layer:</strong> ${escapeHtml(node.layer || node.layer_kind || node.type || "unknown")}</p>
      <p><strong>Write surface:</strong> ${escapeHtml(node.write_surface.join(" | "))}</p>
      <p><strong>Conflict:</strong> ${escapeHtml(node.conflict_surface)} (${escapeHtml(node.conflict_reasoning)})</p>
      <p><strong>Depends on:</strong> ${escapeHtml(node.depends_on.join(", ") || "None")}</p>
      <p><strong>Eligibility:</strong> ${escapeHtml(node.quality?.execution_eligibility?.status || (node.execution_eligible ? "eligible" : "unknown"))}</p>
      <p><strong>Quality:</strong> ambiguity ${escapeHtml(node.quality?.ambiguity?.level || "n/a")}, oversize ${escapeHtml(node.quality?.oversize_risk?.level || "n/a")}, ownership ${escapeHtml(node.quality?.ownership_strength?.level || "n/a")}</p>
    </article>
  `).join("") || "<p class=\"muted\">No graph nodes available.</p>";
  const qualityCards = quality?.nodes?.map((entry) => `
    <article class="wave-card">
      <h4>${escapeHtml(entry.id)}</h4>
      <p><strong>Eligibility:</strong> ${escapeHtml(entry.quality.execution_eligibility.status)}</p>
      <p><strong>Ambiguity:</strong> ${escapeHtml(entry.quality.ambiguity.level)}</p>
      <p><strong>Oversize:</strong> ${escapeHtml(entry.quality.oversize_risk.level)}</p>
      <p><strong>Ownership:</strong> ${escapeHtml(entry.quality.ownership_strength.level)}</p>
    </article>
  `).join("") || "<p class=\"muted\">No graph quality analysis available.</p>";
  const syncCards = syncPreview?.issues?.map((issue) => `
    <article class="wave-card">
      <h4>${escapeHtml(issue.node_id)} -> ${escapeHtml(issue.title)}</h4>
      <p><strong>Labels:</strong> ${escapeHtml(issue.labels.join(", "))}</p>
      <p><strong>Stage:</strong> ${escapeHtml(issue.project_fields["Execution Stage"] || "N/A")}</p>
      <p><strong>Lane:</strong> ${escapeHtml(issue.project_fields["Execution Lane"] || "N/A")}</p>
      <p><strong>Queue:</strong> ${escapeHtml(issue.project_fields["Queue Class"] || "N/A")}</p>
    </article>
  `).join("") || "<p class=\"muted\">No sync preview available.</p>";
  const launchPreviewCards = waveExecution?.loopSpecPreview?.map((entry) => `
    <article class="wave-card">
      <h4>${escapeHtml(entry.node_id)}</h4>
      <p><strong>Loop Spec:</strong> ${escapeHtml(entry.loop_spec_id)}</p>
      <p><strong>Queue class:</strong> ${escapeHtml(entry.queue_class || "N/A")}</p>
      <p><strong>Tracer bullet:</strong> ${escapeHtml(entry.tracer_bullet ? "yes" : "no")}</p>
      <p><strong>Owned surface:</strong> ${escapeHtml(entry.owned_surface.join(" | ") || "None")}</p>
    </article>
  `).join("") || "<p class=\"muted\">No launchable nodes available from the current graph state.</p>";
  const runCards = state.execution.providerRuns.map((run) => `
    <article class="run-card status-${escapeHtml(run.data.status)}">
      <h4>${escapeHtml(run.data.run_id)}</h4>
      <p><strong>Provider:</strong> ${escapeHtml(run.data.provider)} (${escapeHtml(run.data.adapter_mode)})</p>
      <p><strong>Status:</strong> ${escapeHtml(run.data.status)}</p>
      <p><strong>Isolation:</strong> ${escapeHtml(run.data.execution?.isolation_mode || "unknown")}</p>
      <p><strong>Issue:</strong> ${escapeHtml(run.data.issue_id)}</p>
      <p><strong>Logs:</strong> <code>${escapeHtml(run.data.stdout_log_path || "N/A")}</code></p>
      <button data-open-artifact="${escapeHtml(run.data.stdout_log_path || "")}">Open stdout</button>
      <button data-open-artifact="${escapeHtml(run.data.stderr_log_path || "")}">Open stderr</button>
    </article>
  `).join("") || "<p class=\"muted\">No provider runs yet.</p>";
  const fileOptions = latestEditablePaths(state)
    .map((relativePath) => `<option value="${escapeHtml(relativePath)}">${escapeHtml(relativePath)}</option>`)
    .join("");
  const dispatchOptions = state.dispatches
    .filter((item) => item.path.endsWith(".json"))
    .map((item) => `<option value="${escapeHtml(item.relativePath)}">${escapeHtml(item.relativePath)}</option>`)
    .join("");
  const queuedDispatchOptions = state.dispatches
    .filter((item) => item.path.endsWith(".json"))
    .map((item) => `<option value="${escapeHtml(item.relativePath)}">${escapeHtml(item.relativePath)}</option>`)
    .join("");
  const dagPath = state.graph?.artifact.relativePath || "";
  const nodeOptions = latestDag?.nodes?.map((node) => `<option value="${escapeHtml(node.id)}">${escapeHtml(node.id)} - ${escapeHtml(node.title)}</option>`).join("") || "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AutoPocock Workflow Console</title>
  <style>
    :root {
      --bg: #f2ebde;
      --ink: #17242b;
      --panel: #fffaf1;
      --line: #d2c2a6;
      --accent: #0f766e;
      --accent-2: #c2410c;
      --ok: #2f855a;
      --warn: #b45309;
      --bad: #9f1239;
      --shadow: rgba(23, 36, 43, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background:
        radial-gradient(circle at top right, rgba(194, 65, 12, 0.12), transparent 28%),
        linear-gradient(180deg, #efe4cf, var(--bg));
      color: var(--ink);
    }
    header {
      padding: 28px 32px 18px;
      border-bottom: 1px solid var(--line);
      background: rgba(255,250,241,0.88);
      backdrop-filter: blur(8px);
      position: sticky;
      top: 0;
      z-index: 5;
    }
    header h1 { margin: 0; font-size: 32px; letter-spacing: 0.02em; }
    header p { margin: 8px 0 0; max-width: 920px; }
    .meta { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 14px; font-size: 14px; }
    .meta span { padding: 6px 10px; background: #fff; border: 1px solid var(--line); border-radius: 999px; }
    nav {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 10px;
      padding: 18px 32px 0;
    }
    nav button, .panel button {
      font: inherit;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
      padding: 10px 12px;
      border-radius: 12px;
      cursor: pointer;
      box-shadow: 0 4px 12px var(--shadow);
    }
    nav button.active { background: var(--accent); color: #fff; border-color: var(--accent); }
    main { padding: 20px 32px 40px; }
    .view { display: none; }
    .view.active { display: block; }
    .grid { display: grid; gap: 18px; }
    .grid.two { grid-template-columns: 1.35fr 1fr; }
    .grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      box-shadow: 0 12px 28px var(--shadow);
    }
    .panel h2, .panel h3, .panel h4 { margin-top: 0; }
    .muted { color: #5d6b72; }
    .artifact-list { display: grid; gap: 10px; max-height: 360px; overflow: auto; }
    .artifact-item { padding: 12px; border: 1px solid var(--line); border-radius: 14px; background: rgba(255,255,255,0.65); }
    .artifact-item code, code { font-family: "Cascadia Code", Consolas, monospace; font-size: 0.92em; }
    textarea, input, select {
      width: 100%;
      font: inherit;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px 12px;
      background: #fff;
      color: var(--ink);
    }
    textarea { min-height: 320px; resize: vertical; }
    .node-grid, .run-grid, .wave-grid { display: grid; gap: 14px; }
    .node-grid { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    .run-grid, .wave-grid { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .node-card, .run-card, .wave-card {
      border: 1px solid var(--line);
      border-left: 6px solid var(--accent);
      border-radius: 14px;
      background: rgba(255,255,255,0.85);
      padding: 14px;
    }
    .risk-medium { border-left-color: var(--warn); }
    .risk-high, .status-blocked, .status-cancelled { border-left-color: var(--bad); }
    .status-succeeded { border-left-color: var(--ok); }
    .status-running { border-left-color: var(--accent); }
    .form-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .form-grid .full { grid-column: 1 / -1; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
    .status-line { padding: 10px 12px; border-radius: 12px; background: #fff; border: 1px solid var(--line); min-height: 44px; }
    @media (max-width: 900px) {
      nav { grid-template-columns: repeat(2, minmax(0, 1fr)); padding-inline: 18px; }
      main { padding-inline: 18px; }
      .grid.two, .grid.three, .form-grid { grid-template-columns: 1fr; }
      header { padding-inline: 18px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Workflow Console</h1>
    <p>Artifact-first console for Setup, Context, PRD, Graph, Execution, and Review. It sits on top of the same markdown and JSON contracts the CLI uses, so the UI never becomes the only source of truth.</p>
    <div class="meta">
      <span>Workspace: <code>${escapeHtml(state.workspace)}</code></span>
      <span>Generated: <code>${escapeHtml(state.generatedAt)}</code></span>
      <span>Console: <code>http://${escapeHtml(host || "127.0.0.1")}:${escapeHtml(String(port || ""))}</code></span>
    </div>
  </header>
  <nav>
    <button class="active" data-view-button="setup">Setup</button>
    <button data-view-button="context">Context</button>
    <button data-view-button="prd">PRD</button>
    <button data-view-button="graph">Graph</button>
    <button data-view-button="execution">Execution</button>
    <button data-view-button="review">Review</button>
  </nav>
  <main>
    <section class="view active" data-view="setup">
      <div class="grid two">
        <article class="panel">
          <h2>Readiness Snapshot</h2>
          <p><strong>Host:</strong> ${escapeHtml(state.setup.host.os)} / ${escapeHtml(state.setup.host.shell)}</p>
          <p><strong>GitHub config ready:</strong> ${escapeHtml(state.setup.github.config_ready ? "yes" : "no")}</p>
          <p><strong>Providers:</strong> ${escapeHtml(state.setup.providers.map((provider) => `${provider.name}:${provider.availability.ready ? "ready" : "not-ready"}`).join(", "))}</p>
          <ul>
            ${Object.entries(state.setup.prerequisites).map(([name, info]) => `<li><strong>${escapeHtml(name)}:</strong> ${escapeHtml(info.available ? "ready" : "missing")}</li>`).join("")}
          </ul>
        </article>
        <article class="panel">
          <h2>Workflow Structure</h2>
          <div class="artifact-list">
            ${state.setup.directories.map((item) => `<div class="artifact-item"><strong>${escapeHtml(item.path)}</strong><br /><span class="muted">${escapeHtml(item.present ? "present" : "missing")}</span></div>`).join("")}
          </div>
        </article>
        <article class="panel">
          <h2>Onboarding Checks</h2>
          <p><strong>Queue items:</strong> ${escapeHtml(String(queueSummary.total))}</p>
          <p><strong>Dispatchable now:</strong> ${escapeHtml(String(queueSummary.dispatchable))}</p>
          <div class="wave-grid">${onboardingCards}</div>
        </article>
      </div>
    </section>

    <section class="view" data-view="context">
      <div class="grid two">
        <article class="panel">
          <h2>Context Artifacts</h2>
          <div class="artifact-list">
            ${state.contexts.map((item) => `<div class="artifact-item"><strong>${escapeHtml(item.name)}</strong><br /><code>${escapeHtml(item.relativePath)}</code><p>${escapeHtml(item.preview)}</p><button data-open-artifact="${escapeHtml(item.relativePath)}">Open for edit</button></div>`).join("") || "<p class=\"muted\">No context artifacts found.</p>"}
          </div>
        </article>
        <article class="panel">
          <h2>Direct Artifact Editing</h2>
          <label for="artifact-picker">Artifact path</label>
          <select id="artifact-picker">${fileOptions}</select>
          <div class="actions">
            <button id="load-artifact">Load</button>
            <button id="save-artifact">Save</button>
          </div>
          <p class="muted">This edits the underlying file directly. The UI is a console over the artifact layer, not a shadow copy.</p>
          <textarea id="artifact-editor" placeholder="Select an artifact and load it."></textarea>
          <div class="status-line" id="artifact-status">Ready.</div>
        </article>
      </div>
    </section>

    <section class="view" data-view="prd">
      <div class="grid two">
        <article class="panel">
          <h2>PRD Artifacts</h2>
          <div class="artifact-list">
            ${state.prds.map((item) => `<div class="artifact-item"><strong>${escapeHtml(item.name)}</strong><br /><code>${escapeHtml(item.relativePath)}</code><p>${escapeHtml(item.preview)}</p><button data-open-artifact="${escapeHtml(item.relativePath)}">Open PRD</button></div>`).join("") || "<p class=\"muted\">No PRDs found.</p>"}
          </div>
        </article>
        <article class="panel">
          <h2>Planning Chain</h2>
          <p><strong>Latest context:</strong> <code>${escapeHtml(state.contexts[0]?.relativePath || "N/A")}</code></p>
          <p><strong>Latest PRD:</strong> <code>${escapeHtml(state.prds[0]?.relativePath || "N/A")}</code></p>
          <p><strong>Latest Issue DAG:</strong> <code>${escapeHtml(state.graph?.artifact.relativePath || "N/A")}</code></p>
          <p class="muted">The UI keeps these artifacts inspectable and editable instead of hiding them behind view-only cards.</p>
        </article>
      </div>
    </section>

    <section class="view" data-view="graph">
      <div class="grid">
        <article class="panel">
          <h2>Issue DAG</h2>
          <p><strong>Artifact:</strong> <code>${escapeHtml(state.graph?.artifact.relativePath || "N/A")}</code></p>
          <p><strong>Progression:</strong> completed ${escapeHtml(String(latestDag?.progression?.completed_nodes?.length || 0))}, runnable ${escapeHtml(String(latestDag?.progression?.runnable_nodes?.length || 0))}, blocked ${escapeHtml(String(latestDag?.progression?.blocked_nodes?.length || 0))}</p>
          <div class="wave-grid">${waveCards}</div>
        </article>
        <article class="panel">
          <h3>Graph Quality</h3>
          <p><strong>Eligible nodes:</strong> ${escapeHtml(String(quality?.summary?.eligible_nodes || 0))} / ${escapeHtml(String(quality?.summary?.total_nodes || 0))}</p>
          <p><strong>Ineligible nodes:</strong> ${escapeHtml(String(quality?.summary?.ineligible_nodes || 0))}</p>
          <div class="wave-grid">${qualityCards}</div>
        </article>
        <article class="panel">
          <h3>GitHub Sync Preview</h3>
          <p><strong>Mode:</strong> ${escapeHtml(syncPreview?.mode || "N/A")}</p>
          <p><strong>Feature track:</strong> ${escapeHtml(syncPreview?.feature_track || "N/A")}</p>
          <div class="wave-grid">${syncCards}</div>
        </article>
        <article class="panel">
          <h3>Dependency Edges</h3>
          <ul>${dependencyEdges}</ul>
        </article>
        <article class="panel">
          <h3>Conflict Surfaces</h3>
          <div class="node-grid">${graphNodes}</div>
        </article>
        <article class="panel">
          <h3>Wave Controls</h3>
          <p><strong>Runnable now:</strong> ${escapeHtml(waveExecution?.runnableNow?.join(", ") || "None")}</p>
          <p><strong>Launchable previews:</strong> ${escapeHtml(waveExecution?.launchableNodeIds?.join(", ") || "None")}</p>
          <p><strong>Graph-blocked:</strong> ${escapeHtml(waveExecution?.blockedNow?.join(", ") || "None")}</p>
          <p><strong>Control stance:</strong> The console previews graph-driven launch candidates and underlying Loop Specs; execution still flows through the durable CLI/runtime contracts.</p>
          <div class="wave-grid">${launchPreviewCards}</div>
        </article>
        <article class="panel">
          <h3>Why Blocked</h3>
          <p class="muted">Dependency blockers, progression blockers, and eligibility reasons from graph truth.</p>
          <div class="wave-grid">${blockedReasonCards}</div>
        </article>
        <article class="panel">
          <h3>Repair Decisions</h3>
          <p class="muted">Repair insertion versus escalation is surfaced directly from graph progression.</p>
          <div class="wave-grid">${repairCards}</div>
        </article>
      </div>
    </section>

    <section class="view" data-view="execution">
      <div class="grid">
        <article class="panel">
          <h2>Run Summary</h2>
          <p><strong>Total:</strong> ${escapeHtml(String(state.execution.summary.total))}</p>
          <p><strong>Active:</strong> ${escapeHtml(String(state.execution.summary.active))}</p>
          <p><strong>Succeeded:</strong> ${escapeHtml(String(state.execution.summary.succeeded))}</p>
          <p><strong>Blocked:</strong> ${escapeHtml(String(state.execution.summary.blocked))}</p>
          <p><strong>Cancelled:</strong> ${escapeHtml(String(state.execution.summary.cancelled))}</p>
        </article>
        <article class="panel">
          <h2>Dispatches</h2>
          <div class="artifact-list">
            ${state.dispatches.filter((item) => item.path.endsWith(".json")).slice(0, 8).map((item) => `<div class="artifact-item"><code>${escapeHtml(item.relativePath)}</code><p>${escapeHtml(item.preview)}</p></div>`).join("") || "<p class=\"muted\">No dispatches found.</p>"}
          </div>
        </article>
        <article class="panel">
          <h2>Isolation and Logs</h2>
          <p class="muted">Execution view exposes provider assignment, isolation mode, run status, and direct log access.</p>
          <div class="run-grid">${runCards}</div>
        </article>
        <article class="panel">
          <h2>Happy Path</h2>
          <div class="artifact-list">
            <div class="artifact-item"><strong>1. Choose issue</strong><p>Use the graph and queue to pick a runnable, dispatchable node.</p></div>
            <div class="artifact-item"><strong>2. Validate readiness</strong><p>Use Setup and Onboarding Checks to confirm GitHub, queue, and runner readiness.</p></div>
            <div class="artifact-item"><strong>3. Locate handoff</strong><p>Open the linked handoff, completion, and review artifacts directly from the console.</p></div>
            <div class="artifact-item"><strong>4. Dispatch and claim</strong><p>Claim queued work, prepare the worktree, and keep the dispatch metadata visible.</p></div>
            <div class="artifact-item"><strong>5. Preflight and run</strong><p>Use wave approval plus staged run actions to inspect withheld reasons or progress safe work.</p></div>
            <div class="artifact-item"><strong>6. Review and QA</strong><p>Record review/QA decisions and inspect resulting graph progression from the same surface.</p></div>
          </div>
        </article>
        <article class="panel">
          <h2>Execution Control</h2>
          <div class="form-grid">
            <div class="full"><strong>Claim dispatch</strong></div>
            <select id="claim-dispatch">${queuedDispatchOptions}</select>
            <input id="claim-runner" value="solo-operator" placeholder="Claimed by" />
            <input id="claim-isolation" value="worktree" placeholder="Isolation mode" />
            <div class="actions full"><button id="submit-claim">Claim dispatch</button></div>
            <div class="full"><strong>Prepare worktree</strong></div>
            <select id="prepare-dispatch">${dispatchOptions}</select>
            <div class="actions full"><button id="submit-prepare">Prepare worktree</button></div>
            <div class="full"><strong>Staged run preview</strong></div>
            <input id="staged-dag" value="${escapeHtml(dagPath)}" placeholder="DAG path" class="full" />
            <input id="staged-bundle" value="${escapeHtml(state.ralph?.snapshot?.current_wave?.bundle_json_path || "")}" placeholder="Approved bundle path" class="full" />
            <input id="staged-plan" value="${escapeHtml(state.ralph?.state?.source_plan || "")}" placeholder="Ralph plan path" class="full" />
            <input id="staged-state" value="${escapeHtml(state.ralph?.artifact?.relativePath || "")}" placeholder="Ralph state path" class="full" />
            <select id="staged-node">${nodeOptions}</select>
            <select id="staged-outcome">
              <option value="succeeded">succeeded</option>
              <option value="blocked">blocked</option>
            </select>
            <input id="staged-issue" placeholder="Issue id" />
            <div class="actions full"><button id="submit-staged-run">Run this node</button></div>
          </div>
          <div class="status-line" id="execution-status">No execution control applied yet.</div>
        </article>
        <article class="panel">
          <h2>Ralph Run</h2>
          <p><strong>Global status:</strong> ${escapeHtml(ralphSnapshot?.global_status || "N/A")}</p>
          <p><strong>Current wave:</strong> ${escapeHtml(ralphSnapshot?.current_wave?.wave_id || "N/A")}</p>
          <p><strong>Wave approval:</strong> ${escapeHtml(ralphSnapshot?.current_wave?.approval_status || "N/A")}</p>
          <p><strong>Paused branches:</strong> ${escapeHtml((ralphSnapshot?.blocked || []).map((issue) => issue.issue_id).join(", ") || "None")}</p>
          <p><strong>Freeze reason code:</strong> ${escapeHtml(ralphSnapshot?.global_reason_code || "N/A")}</p>
          <div class="wave-grid">${ralphRunnableCards}</div>
          <div class="actions">
            <button id="submit-approve-wave">Approve current wave</button>
          </div>
        </article>
      </div>
    </section>

    <section class="view" data-view="review">
      <div class="grid two">
        <article class="panel">
          <h2>Completion / QA / Review Artifacts</h2>
          <div class="artifact-list">
            ${[...state.review.completions.slice(0, 4), ...state.review.reviews.slice(0, 4), ...state.review.qaArtifacts.slice(0, 4), ...state.review.feedbackArtifacts.slice(0, 4)].map((item) => `<div class="artifact-item"><strong>${escapeHtml(item.name)}</strong><br /><code>${escapeHtml(item.relativePath)}</code><p>${escapeHtml(item.preview)}</p><button data-open-artifact="${escapeHtml(item.relativePath)}">Open</button></div>`).join("") || "<p class=\"muted\">No review artifacts found.</p>"}
          </div>
        </article>
        <article class="panel">
          <h2>Approval and Reclaim Controls</h2>
          <div class="form-grid">
            <div class="full"><strong>Review decision</strong></div>
            <input id="review-issue" value="32" placeholder="Issue id" />
            <input id="review-approved-by" value="solo-operator" placeholder="Approved by" />
            <input id="review-dag" value="${escapeHtml(dagPath)}" placeholder="DAG path" class="full" />
            <select id="review-node">${nodeOptions}</select>
            <select id="review-decision"><option value="approve">approve</option><option value="reject">reject</option></select>
            <input id="review-reason" class="full" placeholder="Reason" />
            <div class="actions full"><button id="submit-review">Apply review decision</button></div>
            <div class="full"><strong>QA decision</strong></div>
            <input id="qa-issue" value="32" placeholder="Issue id" />
            <input id="qa-approved-by" value="solo-operator" placeholder="Approved by" />
            <input id="qa-dag" value="${escapeHtml(dagPath)}" placeholder="DAG path" class="full" />
            <select id="qa-node">${nodeOptions}</select>
            <select id="qa-decision"><option value="pass">pass</option><option value="fail">fail</option></select>
            <input id="qa-reason" class="full" placeholder="Reason" />
            <div class="actions full"><button id="submit-qa">Apply QA decision</button></div>
            <div class="full"><strong>Reclaim dispatch</strong></div>
            <select id="reclaim-dispatch">${dispatchOptions}</select>
            <input id="reclaim-approved-by" value="solo-operator" placeholder="Approved by" />
            <input id="reclaim-reason" class="full" placeholder="Reason" value="Operator reclaimed from console" />
            <div class="actions full"><button id="submit-reclaim">Reclaim dispatch</button></div>
          </div>
          <div class="status-line" id="control-status">No gate action applied yet.</div>
        </article>
      </div>
    </section>
  </main>
  <script>
    const stateUrl = "/api/state";
    const artifactPicker = document.getElementById("artifact-picker");
    const editor = document.getElementById("artifact-editor");
    const artifactStatus = document.getElementById("artifact-status");
    const controlStatus = document.getElementById("control-status");
    const executionStatus = document.getElementById("execution-status");

    function setStatus(target, message) {
      target.textContent = message;
    }

    async function postJson(url, payload) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }
      return data;
    }

    document.querySelectorAll("[data-view-button]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-view-button]").forEach((item) => item.classList.remove("active"));
        document.querySelectorAll("[data-view]").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        document.querySelector('[data-view="' + button.dataset.viewButton + '"]').classList.add("active");
      });
    });

    document.querySelectorAll("[data-open-artifact]").forEach((button) => {
      button.addEventListener("click", async () => {
        const artifactPath = button.dataset.openArtifact;
        if (!artifactPath) {
          return;
        }
        artifactPicker.value = artifactPath.replace(/\\\\/g, "/");
        const result = await fetch("/api/artifact?path=" + encodeURIComponent(artifactPicker.value));
        const data = await result.json();
        editor.value = data.content || "";
        setStatus(artifactStatus, "Loaded " + artifactPicker.value);
      });
    });

    document.getElementById("load-artifact").addEventListener("click", async () => {
      const result = await fetch("/api/artifact?path=" + encodeURIComponent(artifactPicker.value));
      const data = await result.json();
      editor.value = data.content || "";
      setStatus(artifactStatus, "Loaded " + artifactPicker.value);
    });

    document.getElementById("save-artifact").addEventListener("click", async () => {
      try {
        const data = await postJson("/api/artifact", { path: artifactPicker.value, content: editor.value });
        setStatus(artifactStatus, "Saved " + data.path);
      } catch (error) {
        setStatus(artifactStatus, error.message);
      }
    });

    document.getElementById("submit-review").addEventListener("click", async () => {
      try {
        const data = await postJson("/api/review-decision", {
          dag: document.getElementById("review-dag").value,
          issue: document.getElementById("review-issue").value,
          node: document.getElementById("review-node").value,
          decision: document.getElementById("review-decision").value,
          approvedBy: document.getElementById("review-approved-by").value,
          reason: document.getElementById("review-reason").value,
        });
        setStatus(controlStatus, "Review decision written: " + data.artifactPath);
      } catch (error) {
        setStatus(controlStatus, error.message);
      }
    });

    document.getElementById("submit-qa").addEventListener("click", async () => {
      try {
        const data = await postJson("/api/qa-decision", {
          dag: document.getElementById("qa-dag").value,
          issue: document.getElementById("qa-issue").value,
          node: document.getElementById("qa-node").value,
          decision: document.getElementById("qa-decision").value,
          approvedBy: document.getElementById("qa-approved-by").value,
          reason: document.getElementById("qa-reason").value,
        });
        setStatus(controlStatus, "QA decision written: " + data.artifactPath);
      } catch (error) {
        setStatus(controlStatus, error.message);
      }
    });

    document.getElementById("submit-reclaim").addEventListener("click", async () => {
      try {
        const data = await postJson("/api/reclaim", {
          dispatch: document.getElementById("reclaim-dispatch").value,
          approvedBy: document.getElementById("reclaim-approved-by").value,
          reason: document.getElementById("reclaim-reason").value,
        });
        setStatus(controlStatus, "Dispatch reclaimed: " + data.path);
      } catch (error) {
        setStatus(controlStatus, error.message);
      }
    });

    document.getElementById("submit-claim").addEventListener("click", async () => {
      try {
        const data = await postJson("/api/claim", {
          dispatch: document.getElementById("claim-dispatch").value,
          claimedBy: document.getElementById("claim-runner").value,
          isolationMode: document.getElementById("claim-isolation").value,
        });
        setStatus(executionStatus, "Dispatch claimed: " + data.path);
      } catch (error) {
        setStatus(executionStatus, error.message);
      }
    });

    document.getElementById("submit-prepare").addEventListener("click", async () => {
      try {
        const data = await postJson("/api/prepare-worktree", {
          dispatch: document.getElementById("prepare-dispatch").value,
        });
        setStatus(executionStatus, "Worktree prepared: " + data.worktreePath);
      } catch (error) {
        setStatus(executionStatus, error.message);
      }
    });

    document.getElementById("submit-approve-wave").addEventListener("click", async () => {
      try {
        const data = await postJson("/api/approve-wave", {});
        setStatus(executionStatus, "Approved wave: " + data.waveId);
      } catch (error) {
        setStatus(executionStatus, error.message);
      }
    });

    document.getElementById("submit-staged-run").addEventListener("click", async () => {
      try {
        const data = await postJson("/api/staged-run", {
          dag: document.getElementById("staged-dag").value,
          approvedBundle: document.getElementById("staged-bundle").value,
          plan: document.getElementById("staged-plan").value,
          state: document.getElementById("staged-state").value,
          nodeId: document.getElementById("staged-node").value,
          issueId: document.getElementById("staged-issue").value,
          executionOutcome: document.getElementById("staged-outcome").value,
        });
        setStatus(executionStatus, "Staged run: " + data.executionStatus + " / progression " + data.progressionStatus);
      } catch (error) {
        setStatus(executionStatus, error.message);
      }
    });
  </script>
</body>
</html>`;
}

function safePath(root, relativeOrAbsolutePath) {
  const resolved = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(root, relativeOrAbsolutePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path escapes the workspace.");
  }
  return resolved;
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function applyReviewAction(root, payload) {
  const dagPath = safePath(root, payload.dag);
  const dag = await loadJson(dagPath);
  const updated = applyReviewDecision(dag, {
    nodeId: payload.node,
    decision: payload.decision,
    approvedBy: payload.approvedBy,
    reason: payload.reason || "",
  });
  await writeFile(dagPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  const artifactPath = path.join(root, "docs", "agents", "reviews", `${nowDate()}-${slugify(`${payload.issue}-${payload.node}-${payload.decision}-review`)}.md`);
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, renderGateDecisionArtifact({
    kind: "review",
    issue: payload.issue,
    nodeId: payload.node,
    decision: payload.decision,
    approvedBy: payload.approvedBy,
    reason: payload.reason || "",
    dagPath,
  }), "utf8");
  return { dagPath, artifactPath };
}

async function applyQaAction(root, payload) {
  const dagPath = safePath(root, payload.dag);
  const dag = await loadJson(dagPath);
  const node = dag.nodes.find((entry) => entry.id === payload.node);
  const evidence = payload.evidence && typeof payload.evidence === "object"
    ? payload.evidence
    : node
      ? {
          changed_outputs: Array.isArray(node.write_surface) ? node.write_surface : [],
          verification_commands: [
            ...(Array.isArray(node.verification_plan?.automated) ? node.verification_plan.automated : []),
            ...(Array.isArray(node.verification_plan?.manual) ? node.verification_plan.manual : []),
          ],
          verification_results: [
            payload.reason || "Console QA decision recorded.",
          ],
          acceptance_criteria_evidence: (Array.isArray(node.acceptance_criteria) ? node.acceptance_criteria : []).map((criterion) => ({
            criterion,
            evidence: payload.reason || "Console QA confirmed the acceptance criterion.",
          })),
          test_evidence: expectedTestDimensionsForNode(node).map((dimension) => ({
            dimension,
            status: payload.decision === "validation-fail" ? "failed" : "passed",
            summary: payload.reason || `Console QA ${payload.decision} recorded for ${dimension}.`,
          })),
        }
      : {};
  const updated = applyQaDecision(dag, {
    nodeId: payload.node,
    decision: payload.decision,
    approvedBy: payload.approvedBy,
    reason: payload.reason || "",
    evidence,
  });
  await writeFile(dagPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  const artifactPath = path.join(root, "docs", "QA", `${nowDate()}-${slugify(`${payload.issue}-${payload.node}-${payload.decision}-qa`)}.md`);
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, renderGateDecisionArtifact({
    kind: "qa",
    issue: payload.issue,
    nodeId: payload.node,
    decision: payload.decision,
    approvedBy: payload.approvedBy,
    reason: payload.reason || "",
    dagPath,
  }), "utf8");

  let followUp = null;
  if (payload.decision === "fail") {
    const bug = renderFollowUpBugArtifact({
      issue: payload.issue,
      nodeId: payload.node,
      approvedBy: payload.approvedBy,
      reason: payload.reason || "",
    });
    const base = `${nowDate()}-${slugify(`${payload.issue}-${payload.node}-follow-up-bug`)}`;
    const jsonPath = path.join(root, "docs", "agents", "feedback", `${base}.json`);
    const markdownPath = path.join(root, "docs", "agents", "feedback", `${base}.md`);
    await mkdir(path.dirname(jsonPath), { recursive: true });
    await writeFile(jsonPath, `${JSON.stringify(bug.json, null, 2)}\n`, "utf8");
    await writeFile(markdownPath, bug.markdown, "utf8");
    followUp = { jsonPath, markdownPath };
  }

  return { dagPath, artifactPath, followUp };
}

async function reclaimDispatch(root, payload) {
  const dispatchPath = safePath(root, payload.dispatch);
  const artifact = await loadJson(dispatchPath);
  const next = reclaimDispatchArtifact(artifact, {
    reclaimed_at: new Date().toISOString(),
    reclaimed_by: payload.approvedBy,
    reason: payload.reason,
    previous_claim: artifact.claim,
  });
  await writeFile(dispatchPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return { path: dispatchPath };
}

async function claimDispatch(root, payload) {
  const dispatchPath = safePath(root, payload.dispatch);
  const artifact = await loadJson(dispatchPath);
  if (artifact.status !== "queued") {
    throw new Error(`Dispatch ${artifact.dispatch_id} is ${artifact.status}, not queued.`);
  }
  artifact.status = "claimed";
  artifact.claim = {
    claimed_by: normalizeText(payload.claimedBy) || "solo-operator",
    claimed_at: new Date().toISOString(),
    isolation_mode: normalizeText(payload.isolationMode || artifact.isolation_mode || "worktree"),
  };
  artifact.isolation_mode = artifact.isolation_mode || artifact.claim.isolation_mode;
  if (artifact.isolation_mode === "worktree" && !normalizeText(artifact.worktree_path)) {
    artifact.worktree_path = deriveWorktreePath(root, artifact);
  }
  await writeFile(dispatchPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return { path: dispatchPath, worktreePath: artifact.worktree_path || "" };
}

async function prepareDispatchWorktree(root, payload) {
  const dispatchPath = safePath(root, payload.dispatch);
  const artifact = await loadJson(dispatchPath);
  const errors = validateClaimedDispatchForRun(artifact);
  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
  if (artifact.isolation_mode !== "worktree") {
    throw new Error("Worktree preparation requires a worktree-isolated dispatch.");
  }
  const worktreePath = normalizeText(artifact.worktree_path || deriveWorktreePath(root, artifact));
  await ensureWorktreePath(worktreePath);
  artifact.worktree_path = worktreePath;
  await writeFile(dispatchPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return { path: dispatchPath, worktreePath };
}

async function approveWave(root) {
  const ralph = await latestRalphRun(root);
  if (!ralph?.snapshot?.current_wave?.wave_id || !ralph.plan) {
    throw new Error("No Ralph run state with a current wave is available.");
  }
  const waveId = ralph.snapshot.current_wave.wave_id;
  const nextState = applyRalphRunAction(ralph.plan, ralph.state, {
    kind: "approve_wave",
    wave_id: waveId,
    actor: "solo-operator",
    bundle_json_path: normalizeText(ralph.snapshot.current_wave.bundle_json_path),
    bundle_markdown_path: normalizeText(ralph.snapshot.current_wave.bundle_markdown_path),
    reason: "Approved from workflow console.",
  });
  await writeFile(ralph.artifact.path, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
  return { statePath: ralph.artifact.path, waveId };
}

async function stagedRunPreview(root, payload) {
  const dag = await loadJson(safePath(root, payload.dag));
  const approvedBundle = await loadJson(safePath(root, payload.approvedBundle));
  const plan = normalizeText(payload.plan) ? await loadJson(safePath(root, payload.plan)) : null;
  const statePath = normalizeText(payload.state) ? safePath(root, payload.state) : "";
  const state = statePath ? await loadJson(statePath) : null;
  const run = orchestrateStagedSingleRun({
    dag,
    approvedBundle,
    reconciliation: { mappings: [], drift: [] },
    loopSpecs: Array.isArray(approvedBundle.selected_nodes) ? approvedBundle.selected_nodes.map((entry) => entry.loop_spec).filter(Boolean) : [],
    graph: dag,
    plan,
    state,
    nodeId: payload.nodeId,
    issueId: payload.issueId,
    actor: "solo-operator",
    executionResult: {
      executionOutcome: payload.executionOutcome || "succeeded",
      reason: `Console staged run preview for ${payload.nodeId || payload.issueId || "selected node"}.`,
    },
  });
  if (statePath && run.artifacts?.state) {
    await writeFile(statePath, `${JSON.stringify(run.artifacts.state, null, 2)}\n`, "utf8");
  }
  return {
    executionStatus: run.stages.execution.status,
    progressionStatus: run.stages.progression.status,
    decisionScope: run.stages.failure_policy.decision_scope,
  };
}

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(payload)}\n`);
}

export async function startWorkflowConsole({ cwd, port = 4173, host = "127.0.0.1" }) {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${host}:${port}`);
      if (request.method === "GET" && url.pathname === "/api/state") {
        jsonResponse(response, 200, await loadWorkflowConsoleState(cwd));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/artifact") {
        const requestedPath = url.searchParams.get("path");
        if (!requestedPath) {
          jsonResponse(response, 400, { error: "Artifact path is required." });
          return;
        }
        const fullPath = safePath(cwd, requestedPath);
        jsonResponse(response, 200, { path: fullPath, content: await readFile(fullPath, "utf8") });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/artifact") {
        const payload = JSON.parse(await readRequestBody(request));
        const fullPath = safePath(cwd, payload.path);
        await mkdir(path.dirname(fullPath), { recursive: true });
        await writeFile(fullPath, payload.content ?? "", "utf8");
        jsonResponse(response, 200, { ok: true, path: fullPath });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/review-decision") {
        jsonResponse(response, 200, await applyReviewAction(cwd, JSON.parse(await readRequestBody(request))));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/qa-decision") {
        jsonResponse(response, 200, await applyQaAction(cwd, JSON.parse(await readRequestBody(request))));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/claim") {
        jsonResponse(response, 200, await claimDispatch(cwd, JSON.parse(await readRequestBody(request))));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/prepare-worktree") {
        jsonResponse(response, 200, await prepareDispatchWorktree(cwd, JSON.parse(await readRequestBody(request))));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/reclaim") {
        jsonResponse(response, 200, await reclaimDispatch(cwd, JSON.parse(await readRequestBody(request))));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/approve-wave") {
        jsonResponse(response, 200, await approveWave(cwd));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/staged-run") {
        jsonResponse(response, 200, await stagedRunPreview(cwd, JSON.parse(await readRequestBody(request))));
        return;
      }

      if (request.method === "GET" && url.pathname === "/") {
        const address = server.address();
        const resolvedPort = typeof address === "object" && address ? address.port : port;
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(buildWorkflowConsoleHtml(await loadWorkflowConsoleState(cwd), { host, port: resolvedPort }));
        return;
      }

      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found\n");
    } catch (error) {
      jsonResponse(response, 500, { error: error.message || String(error) });
    }
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  return {
    server,
    host,
    port: typeof address === "object" && address ? address.port : port,
  };
}
