import { execFile, spawn } from "node:child_process";
import { access, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { buildReviewPrep, parseCompletionReport } from "./lib/review-gate.mjs";
import { createGitHubBootstrapReport } from "./lib/github-init.mjs";
import {
  applyMemoryProposalToText,
  createMemoryProposal,
  decideMemoryProposal,
  markMemoryProposalApplied,
  writeMemoryProposalArtifact,
} from "./lib/memory-proposals.mjs";
import { buildMirrorComment, findMirroredComment, mirrorCommentMarker, renderMirrorPlan } from "./lib/artifact-mirror.mjs";
import { classifyFeedback, createFeedbackArtifactSuggestion, renderFeedbackClassification } from "./lib/feedback-classifier.mjs";
import {
  approveContextArtifact,
  latestArtifactPath,
  renderContextArtifact,
} from "./lib/context-plane.mjs";
import { approvePrd } from "./lib/prd-plane.mjs";
import {
  applyQaDecision,
  applyReviewDecision,
  renderFollowUpBugArtifact,
  renderGateDecisionArtifact,
} from "./lib/review-plane.mjs";
import { inspectSetupPlane, renderSetupPlaneReport } from "./lib/setup-plane.mjs";
import {
  buildProviderRunBundle,
  buildRuntimeBlockedResult,
  createProviderRunId,
  executeCodexStub,
  renderExecutionCompletionReport,
} from "./lib/provider-runner.mjs";
import {
  buildLoopSpec,
  deriveLoopSpecPath,
  providerRunLifecycle,
  reclaimDispatchArtifact,
  validateClaimedDispatchForRun,
} from "./lib/workflow-core.mjs";
import {
  applyRalphRunAction,
  buildRalphRunSnapshot,
  createRalphRunState,
  defaultRalphRunStatePath,
  renderRalphRunSnapshot,
  validateRalphRunPlan,
} from "./lib/ralph-runner.mjs";
import {
  approveWaveBundle,
  buildWaveApprovalBundle,
  defaultWaveApprovalArtifactPaths,
  renderWaveApprovalBundle,
} from "./lib/wave-approval-plane.mjs";
import { getProvider } from "./lib/providers/index.mjs";
import {
  commandAvailable,
  ensureDirectories,
  ensureWorktreePath,
  pathExists,
  resolveRepoPath,
  runCommand,
} from "./lib/runtime-host.mjs";
import { startWorkflowConsole } from "./lib/workflow-console.mjs";

const execFileAsync = promisify(execFile);
const cwd = process.cwd();
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const help = `agentic-repo-template ops

Usage:
  pnpm ops init
  pnpm ops setup
  pnpm ops context -- --title "Feature Name"
  pnpm ops context-approve -- --context docs/agents/contexts/file.md --approved-by solo-operator
  pnpm ops prd -- --title "Feature Name"
  pnpm ops prd-approve -- --prd docs/PRDs/file.md --approved-by solo-operator
  pnpm ops issues
  pnpm ops handoff -- --issue 123 --title "Implement slice"
  pnpm ops hitl -- --issue 123 --title "Provision API token"
  pnpm ops complete -- --issue 123 --status "needs human review"
  pnpm ops review-prep -- --issue 123 --pr 456
  pnpm ops review-decision -- --dag issues/file.json --node node-1 --decision approve --approved-by solo-operator
  pnpm ops qa-decision -- --dag issues/file.json --node node-1 --decision pass --approved-by solo-operator
  pnpm ops memory-propose -- --type workflow --title "Update workflow contract"
  pnpm ops memory-decision -- --proposal docs/agents/memory-proposals/file.json --decision approve --approved-by solo-operator --reason "Accepted"
  pnpm ops mirror -- --artifact docs/agents/handoffs/file.md --issue 123
  pnpm ops feedback -- --issue 123 --pr 456 --finding "QA finding text"
  pnpm ops dispatch -- --issue 123 --title "Implement slice" --source manual --override-reason "Solo Operator approved"
  pnpm ops claim -- --dispatch docs/agents/dispatches/dispatch-id.json --claimed-by runner-name --isolation-mode worktree
  pnpm ops claim -- --dispatch docs/agents/dispatches/dispatch-id.json --claimed-by runner-name --lease-hours 24
  pnpm ops claim -- --dispatch docs/agents/dispatches/dispatch-id.json --claimed-by runner-name --apply-tracker
  pnpm ops claim -- --dispatch docs/agents/dispatches/dispatch-id.json --claimed-by runner-name --apply-lock-ref
  pnpm ops claim-status -- --dispatch docs/agents/dispatches/dispatch-id.json --max-age-hours 24
  pnpm ops claim-locks
  pnpm ops claim-locks -- --apply --approved-by solo-operator --reason "Remove abandoned lock refs"
  pnpm ops reclaim -- --dispatch docs/agents/dispatches/dispatch-id.json --approved-by solo-operator --reason "Runner abandoned work"
  pnpm ops reclaim -- --dispatch docs/agents/dispatches/dispatch-id.json --approved-by solo-operator --reason "Runner abandoned work" --apply-tracker
  pnpm ops reclaim-expired -- --max-age-hours 24
  pnpm ops reclaim-expired -- --apply --approved-by solo-operator --reason "Lease expired" --apply-tracker --apply-lock-ref
  pnpm ops qa -- --issue 123 --pr 456
  pnpm ops qa
  pnpm ops board
  pnpm ops schedule -- --queue .ai/queue.example.json
  pnpm ops schedule -- --queue .ai/queue.json --infer-conflicts
  pnpm ops schedule -- --queue .ai/queue.json --apply
  pnpm ops schedule -- --queue .ai/queue.json --dispatch
  pnpm ops github:init
  pnpm ops github:init -- --apply --create-project --project-title "AutoPocock"
  pnpm ops github:init -- --apply --create-project-fields
  pnpm ops github:export
  pnpm ops ralph -- --plan docs/agents/loop-specs/plan.json
  pnpm ops ralph -- --plan docs/agents/loop-specs/plan.json --approve-wave wave-0 --approved-by solo-operator
  pnpm ops run -- --dispatch docs/agents/dispatches/dispatch-id.json
  pnpm ops run -- --dispatch docs/agents/dispatches/dispatch-id.json --prepare-worktree
  pnpm ops run -- --dispatch docs/agents/dispatches/dispatch-id.json --prepare-docker
  pnpm ops run -- --dispatch docs/agents/dispatches/dispatch-id.json --execute --execute-docker
  pnpm ops docker:validate -- --image node:22-bookworm --provider codex --require-command node,pnpm,git --docker-env CODEX_HOME
  pnpm ops dispatch -- --issue 123 --title "Docker slice" --source manual --override-reason "Solo Operator approved" --isolation-mode docker --docker-env CODEX_HOME --docker-volume codex-cache:/codex-cache
  pnpm ops run -- --dispatch docs/agents/dispatches/dispatch-id.json --execute
  pnpm ops console -- --port 4173 --host 127.0.0.1
  pnpm ops run-status -- --run .ai/provider-runs/provider-run-id.json
  pnpm ops run-cancel -- --run .ai/provider-runs/provider-run-id.json --approved-by solo-operator --reason "No longer needed"
  pnpm ops run-mirror -- --run .ai/provider-runs/provider-run-id.json --issue 23
  pnpm ops worktree-clean -- --max-age-hours 168

Guided Flow is the preferred UX. Manual Mode commands remain available as pnpm prd, pnpm issues, and pnpm qa.
`;

function argsWithoutSeparator(args) {
  return args.filter((arg) => arg !== "--");
}

function readOption(args, name, fallback = "") {
  const long = `--${name}`;
  const index = args.indexOf(long);
  if (index === -1) {
    return fallback;
  }
  return args[index + 1] || fallback;
}

function splitOptionList(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseAcceptanceEvidenceOption(value) {
  return splitOptionList(value).map((item) => {
    const [criterion, ...rest] = item.split("=>");
    return {
      criterion: String(criterion || "").trim(),
      evidence: rest.join("=>").trim(),
    };
  }).filter((entry) => entry.criterion || entry.evidence);
}

function parseTestEvidenceOption(value) {
  return splitOptionList(value).map((item) => {
    const [dimension = "", status = "", ...summaryParts] = item.split(":");
    return {
      dimension: dimension.trim(),
      status: status.trim(),
      summary: summaryParts.join(":").trim(),
    };
  }).filter((entry) => entry.dimension || entry.status || entry.summary);
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function deriveWorktreePath(issue, title) {
  const base = `${slugify(issue)}-${slugify(title)}` || "dispatch";
  return path.join(cwd, ".worktrees", base);
}

function dockerContainerName(issue, title) {
  return `autopocock-${`${slugify(issue)}-${slugify(title)}`.replace(/^-+|-+$/g, "").slice(0, 48) || "dispatch"}`;
}

function defaultDockerSpec({ issue, title, image = "", workspace = "", network = "", env = [], volumes = [] } = {}) {
  return {
    image: image || "node:22-bookworm",
    workspace: workspace || "/workspace",
    network: network || "bridge",
    container_name: dockerContainerName(issue, title),
    env: Array.isArray(env) ? env : splitOptionList(env),
    volumes: Array.isArray(volumes) ? volumes : splitOptionList(volumes),
  };
}

function dockerOverrideEntries(overrides = {}) {
  return Object.entries(overrides).filter(([, value]) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return Boolean(value);
  });
}

function dockerSpecForDispatch(artifact, overrides = {}) {
  return {
    ...defaultDockerSpec({
      issue: artifact.issue_id,
      title: artifact.title,
      image: overrides.image,
      workspace: overrides.workspace,
      network: overrides.network,
      env: overrides.env,
      volumes: overrides.volumes,
    }),
    ...(artifact.docker || {}),
    ...Object.fromEntries(dockerOverrideEntries(overrides)),
  };
}

function dockerRunPlanForDispatch(artifact, { provider = "codex", liveProvider = true } = {}) {
  const docker = dockerSpecForDispatch(artifact);
  const worktreePath = path.resolve(artifact.worktree_path || deriveWorktreePath(artifact.issue_id, artifact.title));
  const dispatchPath = artifact.dispatch_path ? path.resolve(artifact.dispatch_path) : "";
  const containerDispatchPath = dispatchPath && dispatchPath.startsWith(cwd)
    ? path.posix.join(docker.workspace, path.relative(cwd, dispatchPath).replace(/\\/g, "/"))
    : path.posix.join(docker.workspace, "docs", "agents", "dispatches", `${artifact.dispatch_id}.json`);
  const args = [
    "run",
    "--rm",
    "-t",
    "--name",
    docker.container_name,
    "--network",
    docker.network,
    ...((docker.env || []).flatMap((name) => ["-e", name])),
    "-v",
    `${worktreePath}:${docker.workspace}`,
    ...((docker.volumes || []).flatMap((volume) => ["-v", volume])),
    "-w",
    docker.workspace,
    docker.image,
    "pnpm",
    "ops",
    "run",
    "--",
    "--dispatch",
    containerDispatchPath,
    "--execute",
    "--inside-docker",
    ...(liveProvider ? ["--live-provider"] : []),
    "--provider",
    provider,
  ];

  return {
    image: docker.image,
    workspace: docker.workspace,
    network: docker.network,
    container_name: docker.container_name,
    env: docker.env || [],
    volumes: docker.volumes || [],
    worktree_path: worktreePath,
    command: "docker",
    args,
    rendered_command: ["docker", ...args].join(" "),
  };
}

function uniqueList(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function validateShellToken(value, label) {
  const text = String(value || "");
  if (!/^[A-Za-z0-9._-]+$/.test(text)) {
    throw new Error(`${label} contains unsupported characters: ${text}`);
  }
  return text;
}

function providerRequiredCommand(provider) {
  if (provider === "codex") {
    return "codex";
  }
  if (provider === "claude") {
    return "claude";
  }
  return "";
}

function dockerValidationScript({ commands = [], env = [] } = {}) {
  const checks = [
    "set -eu",
    ...commands.map((command) => `command -v ${validateShellToken(command, "Required command")} >/dev/null`),
    ...env.map((name) => `test -n "\${${validateShellToken(name, "Environment variable")}:-}"`),
  ];
  return checks.join(" && ");
}

function dockerValidationPlan({ image, provider = "", commands = [], env = [], volumes = [], network = "none" } = {}) {
  const providerCommand = providerRequiredCommand(provider);
  const requiredCommands = uniqueList([
    ...commands.map((command) => validateShellToken(command, "Required command")),
    ...(providerCommand ? [providerCommand] : []),
  ]);
  const envAllowlist = uniqueList(env.map((name) => validateShellToken(name, "Environment variable")));
  const extraVolumes = uniqueList(volumes);
  const args = [
    "run",
    "--rm",
    "--network",
    network || "none",
    ...envAllowlist.flatMap((name) => ["-e", name]),
    ...extraVolumes.flatMap((volume) => ["-v", volume]),
    image,
    "sh",
    "-lc",
    dockerValidationScript({ commands: requiredCommands, env: envAllowlist }),
  ];

  return {
    image,
    provider,
    requiredCommands,
    envAllowlist,
    extraVolumes,
    network: network || "none",
    args,
    rendered_command: ["docker", ...args].join(" "),
  };
}

function queueRecoveryMessage(queuePath) {
  return `Queue file not found: ${queuePath}. Recover it with \`pnpm ops github:export -- --output ${queuePath}\` or seed Guided Flow with \`pnpm ops schedule -- --queue .ai/queue.example.json\`.`;
}

function dispatchRecoveryMessage(dispatchPath) {
  return `Dispatch artifact not found: ${dispatchPath}. Generate Guided Flow dispatches with \`pnpm ops schedule -- --queue .ai/queue.json --dispatch\`.`;
}

function completionRecoveryMessage(completionPath, issue = "") {
  const issueValue = issue || "<issue>";
  return `Completion artifact not found: ${completionPath}. Generate it with \`pnpm ops complete -- --issue ${issueValue} --status "needs human review"\`.`;
}

function normalizeIssueRef(value) {
  return String(value || "").trim().replace(/^#/, "");
}

function formatIssueRef(value) {
  const normalized = normalizeIssueRef(value);
  return normalized ? `#${normalized}` : "";
}

function repoRelativePath(targetPath) {
  const resolved = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);
  return path.relative(cwd, resolved).replace(/\\/g, "/");
}

function resolveRepoContainedPath(targetPath) {
  const resolved = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);
  const relative = path.relative(cwd, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes the workspace: ${targetPath}`);
  }
  return resolved;
}

function formatReviewPrepCommand(issue, completionPath = "") {
  const base = `pnpm ops review-prep -- --issue ${issue}`;
  return completionPath ? `${base} --completion ${completionPath}` : base;
}

function renderCompletionResolutionGuidance(resolution) {
  if (resolution.kind === "ambiguous") {
    return [
      `Multiple completion artifacts match issue ${resolution.issue}.`,
      "Candidates:",
      ...resolution.candidates.map((candidate) => `- ${candidate}`),
      "Re-run with one of:",
      ...resolution.candidates.map((candidate) => formatReviewPrepCommand(resolution.issue, candidate)),
    ].join("\n");
  }

  return [
    `Completion artifact not found for issue ${resolution.issue}.`,
    `Expected under: ${resolution.completionDir}`,
    `Create one with: pnpm ops complete -- --issue ${resolution.issue} --status "needs human review"`,
    `Then re-run with: ${formatReviewPrepCommand(resolution.issue, "<path-to-completion-report.md>")}`,
  ].join("\n");
}

function renderExportIssueGuidance(issue, found) {
  const issueRef = formatIssueRef(issue);
  if (found) {
    return `Requested issue ${issueRef} is present in the exported queue snapshot.`;
  }

  return [
    `Requested issue ${issueRef} was not found in the exported queue snapshot.`,
    `Attach issue ${issueRef} to the configured GitHub Project or verify the project reference before scheduling.`,
    `Re-run the visibility check with: pnpm ops github:export -- --issue ${normalizeIssueRef(issue)}`,
  ].join("\n");
}

function formatScheduleRerunCommand(queuePath, issue, shouldDispatch) {
  const issueValue = normalizeIssueRef(issue);
  return `pnpm ops schedule -- --queue ${queuePath}${shouldDispatch ? " --dispatch" : ""} --issue ${issueValue}`;
}

function formatManualDispatchRecovery(item, issue) {
  const issueValue = normalizeIssueRef(issue);
  const title = item?.title || "<title>";
  return `pnpm ops dispatch -- --issue ${issueValue} --title "${title}" --source manual --override-reason "Solo Operator approved scheduler mismatch"`;
}

function renderSchedulerMismatchGuidance({ issue, queuePath, shouldDispatch, matchedItem, matchedDecision, dispatchedItems }) {
  const issueRef = formatIssueRef(issue);
  const lines = [`Requested issue ${issueRef} was not selected by this scheduler run.`];

  if (matchedItem && matchedDecision) {
    lines.push(`Current decision for ${issueRef}: ${matchedDecision.action.toUpperCase()} - ${matchedDecision.reason}`);
    lines.push(`Fix that gating reason and rerun: ${formatScheduleRerunCommand(queuePath, issue, shouldDispatch)}`);
    lines.push(`If you must proceed outside the scheduler, create a manual dispatch with: ${formatManualDispatchRecovery(matchedItem, issue)}`);
    return lines.join("\n");
  }

  lines.push(`${issueRef} is not present in ${queuePath}.`);
  lines.push(`Check project visibility with: pnpm ops github:export -- --issue ${normalizeIssueRef(issue)} --output ${queuePath}`);
  if (dispatchedItems.length > 0) {
    lines.push(`This run dispatched ${dispatchedItems.map((item) => item.id).join(", ")} instead. Stop and reconcile the active issue before claiming unrelated work.`);
  }
  return lines.join("\n");
}

function renderProviderRunMirrorComment({ metadata, issueRef, providerRunPath }) {
  const marker = mirrorCommentMarker({ artifactPath: providerRunPath, kind: "provider-run" });
  const lines = [
    marker,
    `Provider Run update for \`${metadata.run_id}\``,
    "",
    `- Issue: ${issueRef}`,
    `- Status: ${metadata.status}`,
    `- Lifecycle: ${providerRunLifecycle(metadata.status)}`,
    `- Provider: ${metadata.provider} (${metadata.adapter_mode})`,
    `- Dispatch: ${metadata.dispatch_id}`,
    `- Started: ${metadata.started_at || "N/A"}`,
    `- Completed: ${metadata.completed_at || "N/A"}`,
    `- Completion report: ${metadata.completion_report_target || "N/A"}`,
    `- Provider Run metadata: ${providerRunPath}`,
    `- Loop Spec: ${metadata.loop_spec_path || "N/A"}`,
  ];

  if (metadata.worker?.pid) {
    lines.push(`- Worker PID: ${metadata.worker.pid}`);
  }
  if (metadata.result?.summary) {
    lines.push(`- Summary: ${metadata.result.summary}`);
  }
  if (Array.isArray(metadata.result?.follow_ups) && metadata.result.follow_ups.length > 0) {
    lines.push(`- Follow-up: ${metadata.result.follow_ups.join(" | ")}`);
  }
  if (metadata.cancelled?.reason) {
    lines.push(`- Cancellation reason: ${metadata.cancelled.reason}`);
  }

  return {
    target: `issue #${issueRef}`,
    marker,
    body: lines.join("\n"),
  };
}

function removeOption(args, name) {
  const result = [];

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === `--${name}`) {
      index += 1;
      continue;
    }

    result.push(args[index]);
  }

  return result;
}

function formatDispatchFollowUpCommand(command, args, dispatchPath) {
  const remainingArgs = removeOption(removeOption(argsWithoutSeparator(args), "dispatch"), "issue");
  const renderedArgs = ["--dispatch", dispatchPath, ...remainingArgs];
  return `pnpm ops ${command} -- ${renderedArgs.join(" ")}`.trim();
}

function dispatchSelectionTimestamp(candidate, status) {
  const value = status === "claimed" ? candidate.artifact?.claim?.claimed_at || candidate.artifact?.created_at : candidate.artifact?.created_at;
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

async function listDispatchArtifacts() {
  const dispatchDir = path.join(cwd, "docs", "agents", "dispatches");
  let entries = [];

  try {
    entries = await readdir(dispatchDir);
  } catch {
    return [];
  }

  const artifacts = [];

  for (const entry of entries.filter((value) => value.endsWith(".json")).sort()) {
    const fullPath = path.join(dispatchDir, entry);

    try {
      artifacts.push({
        fullPath,
        artifact: JSON.parse(await readFile(fullPath, "utf8")),
      });
    } catch {
      // Ignore invalid artifacts during lookup so one bad file does not block the rest.
    }
  }

  return artifacts;
}

async function listProviderRunMetadata() {
  const providerRunDir = path.join(cwd, ".ai", "provider-runs");
  let entries = [];

  try {
    entries = await readdir(providerRunDir);
  } catch {
    return [];
  }

  const metadata = [];

  for (const entry of entries.filter((value) => value.endsWith(".json") && !value.endsWith("-bundle.json")).sort()) {
    const fullPath = path.join(providerRunDir, entry);

    try {
      metadata.push({
        fullPath,
        metadata: JSON.parse(await readFile(fullPath, "utf8")),
      });
    } catch {
      // Ignore invalid runtime metadata during cleanup planning.
    }
  }

  return metadata;
}

async function withDispatchArtifactLock(fullPath, callback) {
  const lockPath = `${fullPath}.lock`;

  try {
    await mkdir(lockPath);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(
        `Dispatch artifact is locked by another claim or reclaim operation: ${fullPath}. If no runner is active, remove ${lockPath} after inspection.`,
      );
    }

    throw error;
  }

  try {
    return await callback();
  } finally {
    await rm(lockPath, { recursive: true, force: true }).catch(() => {});
  }
}

function renderDispatchResolutionGuidance({ command, args, status, issue = "", candidates }) {
  const statusLabel = status === "claimed" ? "claimed" : "queued";

  if (candidates.length === 0) {
    if (issue) {
      return `No ${statusLabel} dispatch found for issue ${issue}.`;
    }

    return status === "queued"
      ? "No queued dispatch artifacts were found. Generate Guided Flow dispatches with `pnpm ops schedule -- --queue .ai/queue.json --dispatch`."
      : "No claimed dispatch artifacts were found.";
  }

  const qualifier = issue ? ` for issue ${issue}` : "";
  return [
    `Ambiguous dispatch resolution for ${command}${qualifier}.`,
    "Re-run with one of:",
    ...candidates.map((candidate) => formatDispatchFollowUpCommand(command, args, candidate.fullPath)),
  ].join("\n");
}

async function resolveDispatchArtifact(args, { command, status }) {
  const dispatchPath = readOption(args, "dispatch");

  if (dispatchPath) {
    const fullPath = path.isAbsolute(dispatchPath) ? dispatchPath : path.join(cwd, dispatchPath);
    if (!(await pathExists(fullPath))) {
      throw new Error(dispatchRecoveryMessage(dispatchPath));
    }

    return {
      fullPath,
      artifact: JSON.parse(await readFile(fullPath, "utf8")),
    };
  }

  const issue = readOption(args, "issue");
  const issueRef = normalizeIssueRef(issue);
  const allArtifacts = await listDispatchArtifacts();
  const candidates = allArtifacts.filter(({ artifact }) => {
    if (artifact?.status !== status) {
      return false;
    }

    if (status === "claimed" && !artifact?.claim) {
      return false;
    }

    if (!issueRef) {
      return true;
    }

    return normalizeIssueRef(artifact?.issue_id) === issueRef;
  });

  if (issueRef) {
    if (candidates.length === 1) {
      return candidates[0];
    }

    throw new Error(renderDispatchResolutionGuidance({ command, args, status, issue, candidates }));
  }

  if (candidates.length === 0) {
    throw new Error(renderDispatchResolutionGuidance({ command, args, status, candidates }));
  }

  const ranked = [...candidates].sort((left, right) => dispatchSelectionTimestamp(right, status) - dispatchSelectionTimestamp(left, status));
  if (ranked.length === 1) {
    return ranked[0];
  }

  const latestTimestamp = dispatchSelectionTimestamp(ranked[0], status);
  const secondTimestamp = dispatchSelectionTimestamp(ranked[1], status);
  if (latestTimestamp > secondTimestamp) {
    return ranked[0];
  }

  throw new Error(renderDispatchResolutionGuidance({ command, args, status, candidates: ranked }));
}

async function runNodeScript(script, args) {
  const result = await execFileAsync(process.execPath, [path.join(scriptDir, script), ...args], {
    cwd,
    windowsHide: true,
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}

async function runGh(args) {
  const candidates = process.platform === "win32" ? ["gh.cmd", "gh.exe", "gh.bat", "gh"] : ["gh"];
  let lastError = null;

  for (const candidate of candidates) {
    try {
      return await runCommand(candidate, args);
    } catch (error) {
      lastError = error;
      const detail = `${error.stderr || error.message || ""}`.toLowerCase();
      const missingCandidate = error.code === "ENOENT"
        || detail.includes("not recognized")
        || detail.includes("cannot find the path")
        || detail.includes("no such file");
      if (!missingCandidate) {
        throw error;
      }
    }
  }

  throw lastError || new Error("gh CLI command failed.");
}

async function withTemporaryGhBody(body, callback) {
  const tempPath = path.join(cwd, ".ai", `tmp-feedback-body-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  await mkdir(path.dirname(tempPath), { recursive: true });
  await writeFile(tempPath, body, "utf8");

  try {
    return await callback(tempPath);
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

async function listGitHubComments({ issue, pr }) {
  const result = issue
    ? await runGh(["issue", "view", issue, "--json", "comments"])
    : await runGh(["pr", "view", pr, "--json", "comments"]);
  const parsed = JSON.parse(result.stdout || "{}");
  return Array.isArray(parsed.comments) ? parsed.comments : [];
}

async function updateGitHubIssueComment(commentId, body) {
  if (!commentId) {
    throw new Error("Cannot update mirrored GitHub comment without a comment id.");
  }

  const mutation = "mutation($id: ID!, $body: String!) { updateIssueComment(input: {id: $id, body: $body}) { issueComment { id url } } }";
  return withTemporaryGhBody(body, (bodyPath) =>
    runGh(["api", "graphql", "-f", `query=${mutation}`, "-F", `id=${commentId}`, "-F", `body=@${bodyPath}`]));
}

async function killProcessTree(pid) {
  if (!Number.isFinite(pid) || pid <= 0) {
    throw new Error(`Invalid PID: ${pid}`);
  }

  if (process.platform === "win32") {
    await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      cwd,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      env: process.env,
    });
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    process.kill(pid, "SIGTERM");
  }
}

async function ensureInitStructure() {
  await ensureDirectories(cwd);
  process.stdout.write("Workflow structure is initialized. No workers or automations were started.\n");
}

async function setupPlane(args) {
  const applyInit = args.includes("--apply-init");
  const config = await loadJson(".ai/ops.config.json");
  const report = await inspectSetupPlane({
    cwd,
    config,
    commandAvailable,
    loadJson,
    applyInit,
  });
  process.stdout.write(renderSetupPlaneReport(report));
}

async function contextCommand(args) {
  const title = readOption(args, "title") || "Untitled Context";
  const source = readOption(args, "source", "manual");
  const contextPath = path.join(cwd, "CONTEXT.md");
  const contextMarkdown = (await pathExists(contextPath)) ? await readFile(contextPath, "utf8") : "";
  await writeArtifact("context", renderContextArtifact({ title, source, contextMarkdown }), args);
}

async function contextApproveCommand(args) {
  const contextArg = readOption(args, "context");
  const approvedBy = readOption(args, "approved-by");
  if (!approvedBy) {
    throw new Error("context-approve requires --approved-by.");
  }

  let target = contextArg ? (path.isAbsolute(contextArg) ? contextArg : path.join(cwd, contextArg)) : "";
  if (!target) {
    const contextDir = path.join(cwd, "docs", "agents", "contexts");
    const files = await readdir(contextDir).catch(() => []);
    target = latestArtifactPath(cwd, path.join("docs", "agents", "contexts"), files);
  }
  if (!target || !(await pathExists(target))) {
    throw new Error("Context artifact not found. Run `pnpm ops context -- --title \"Feature Name\"` first or pass --context.");
  }

  const markdown = await readFile(target, "utf8");
  const approved = approveContextArtifact(markdown, {
    approvedBy,
    approvedAt: nowIso(),
  });
  await writeFile(target, approved, "utf8");
  process.stdout.write(`${target}\n`);
}

async function prdApproveCommand(args) {
  const prdArg = readOption(args, "prd");
  const approvedBy = readOption(args, "approved-by");
  if (!approvedBy) {
    throw new Error("prd-approve requires --approved-by.");
  }

  let target = prdArg ? (path.isAbsolute(prdArg) ? prdArg : path.join(cwd, prdArg)) : "";
  if (!target) {
    const prdDir = path.join(cwd, "docs", "PRDs");
    const files = await readdir(prdDir).catch(() => []);
    target = latestArtifactPath(cwd, path.join("docs", "PRDs"), files);
  }
  if (!target || !(await pathExists(target))) {
    throw new Error("PRD artifact not found. Run `pnpm ops prd -- --context <approved-context.md>` first or pass --prd.");
  }

  const markdown = await readFile(target, "utf8");
  const approved = approvePrd(markdown, {
    approvedBy,
    approvedAt: nowIso(),
  });
  await writeFile(target, approved, "utf8");
  process.stdout.write(`${target}\n`);
}

function handoffMarkdown({ issue, title }) {
  return `# Context Handoff

## Issue

- Tracker: ${issue || "TBD"}
- Title: ${title || "TBD"}
- Labels:
- Execution stage: Ready for Handoff

## Goal

- One sentence outcome:

## Boundaries

- In scope:
- Out of scope:
- Likely touched areas:

## Context

- PRD:
- Workflow artifacts:
- Domain terms:
- ADRs:

## Dependencies

- Blockers:
- Related issues:
- Conflict risks:

## Verification

- Automated:
- Manual:
- Evidence expected:

## Completion

- Report back:
- Artifacts to update:
- PR or commit expectation:
- Next suggested stage: Human Review
`;
}

function completionMarkdown({ issue, status }) {
  return `# Completion Report

## Result

- Status: ${status || "TBD"}
- Summary: REQUIRED - replace with a concise outcome summary

## Changes

- Files or areas changed: REQUIRED - replace with explicit changed files or areas
- Reason: REQUIRED - replace with the reason for the change

## Verification

- Commands run: REQUIRED - replace with exact verification commands
- Results: REQUIRED - replace with observed verification results
- Gaps: REQUIRED - replace with explicit remaining gaps, or write None

## Risks

- Residual risks: REQUIRED - replace with explicit residual risks, or write None

## Follow-ups

- Bugs: OPTIONAL - link bugs found during implementation, or write None
- Issues: REQUIRED - replace with follow-up issues, or write None

## Artifacts

- Updated: OPTIONAL - list updated artifacts, or write None

## Next Stage

- Suggested stage: Human Review

## Issue

- Tracker: ${issue || "TBD"}
`;
}

function hitlMarkdown({ issue, title }) {
  return `# Prepared Human Step

## Why This Is HITL

- Reason:

## What To Do

- Step 1:
- Step 2:

## Where To Do It

- URL, dashboard, command, file, or setting path:

## Required Value

- Environment variable or config key:
- Secret value: never write secret values here

## How To Verify

- Command or observable result:

## What To Report Back

- Confirmation needed:

## What Becomes AFK After This

- Next issue or handoff:

## Issue

- Tracker: ${issue || "TBD"}
- Title: ${title || "TBD"}
`;
}

function reviewPrepMarkdown({ issue, pr }) {
  return `# Review Prep

## Issue And PR

- Issue: ${issue || "TBD"}
- PR: ${pr || "TBD"}
- Current stage: Human Review

## Boundary Check

- Declared boundaries:
- Changed areas:
- Possible boundary drift:

## Acceptance Criteria Check

- Criteria addressed:
- Missing or unclear:

## Verification Check

- Commands reported:
- Results:
- Gaps:

## Risk Summary

- Dependency changes:
- Local refactors:
- Conflict surface:
- Residual risks:

## Suggested Review Outcome

- Suggested next stage:
- Reason:

## Solo Operator Decisions Needed

- Same-PR fix decision:
- Memory update decision:
- Merge decision:
`;
}

function nowForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function nowIso() {
  return new Date().toISOString();
}

function parsePositiveNumber(value, fallback, label) {
  const parsed = Number.parseFloat(value ?? "");
  if (value == null || value === "") {
    return fallback;
  }
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return parsed;
}

function addHoursIso(startIso, hours) {
  const start = new Date(startIso);
  return new Date(start.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function inspectClaimAge(artifact, maxAgeHours = 24, now = new Date()) {
  const claimedAt = artifact?.claim?.claimed_at ? new Date(artifact.claim.claimed_at) : null;
  if (!claimedAt || Number.isNaN(claimedAt.getTime())) {
    return {
      hasClaim: false,
      claimedAt: "",
      expiresAt: "",
      ageHours: null,
      stale: false,
      maxAgeHours,
      leaseHours: null,
    };
  }

  const ageHours = (now.getTime() - claimedAt.getTime()) / (1000 * 60 * 60);
  const expiresAt = artifact?.claim?.expires_at ? new Date(artifact.claim.expires_at) : null;
  const hasValidExpiry = expiresAt && !Number.isNaN(expiresAt.getTime());
  return {
    hasClaim: true,
    claimedAt: artifact.claim.claimed_at,
    expiresAt: hasValidExpiry ? artifact.claim.expires_at : "",
    ageHours,
    stale: hasValidExpiry ? now.getTime() > expiresAt.getTime() : ageHours > maxAgeHours,
    maxAgeHours,
    leaseHours: Number.isFinite(artifact.claim.lease_hours) ? artifact.claim.lease_hours : null,
  };
}

async function findLatestHandoff(issue) {
  return findLatestFile(path.join("docs", "agents", "handoffs"), issue);
}

function issueFilenameTokens(issue) {
  const rawIssue = String(issue || "").trim();
  const normalizedIssue = normalizeIssueRef(issue);
  return [...new Set([rawIssue, normalizedIssue, normalizedIssue ? `#${normalizedIssue}` : ""])].filter(Boolean);
}

function fileMatchesIssueToken(file, issue) {
  const target = String(file || "").toLowerCase();
  const tokens = issueFilenameTokens(issue);
  if (tokens.length === 0) {
    return false;
  }

  return tokens.some((token) => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped.toLowerCase()}([^a-z0-9]|$)`).test(target);
  });
}

async function findLatestFile(dir, needle) {
  const targetDir = path.join(cwd, dir);
  let files = [];
  const rawNeedle = String(needle || "");
  const normalizedNeedle = normalizeIssueRef(needle);

  try {
    files = await readdir(targetDir);
  } catch {
    return "";
  }

  const match = files
    .filter(
      (file) =>
        file.endsWith(".md") &&
        (!needle || file.includes(rawNeedle) || (normalizedNeedle && file.includes(normalizedNeedle))),
    )
    .sort()
    .reverse()[0];

  return match ? path.join(targetDir, match) : "";
}

async function findExactIssueFiles(dir, issue) {
  const targetDir = path.join(cwd, dir);
  let files = [];

  try {
    files = await readdir(targetDir);
  } catch {
    return [];
  }

  return files
    .filter((file) => file.endsWith(".md") && fileMatchesIssueToken(file, issue))
    .sort()
    .reverse()
    .map((file) => path.join(targetDir, file));
}

function manualDispatchHandoffResolutionMessage(issue, candidates = []) {
  const normalizedIssue = normalizeIssueRef(issue);
  const lines = [
    `Manual dispatch requires a matching handoff artifact for issue ${normalizedIssue}.`,
    `Create one with: pnpm ops handoff -- --issue ${normalizedIssue} --title "Implement slice"`,
  ];

  if (candidates.length > 1) {
    lines.push("Multiple exact handoff artifacts matched this issue. Re-run dispatch with one of:");
    lines.push(...candidates.map((candidate) => `- --handoff ${candidate}`));
  } else {
    lines.push("Or re-run dispatch with: --handoff <exact-path-to-handoff.md>");
  }

  return lines.join("\n");
}

async function resolveManualDispatchHandoff(issue, handoffPath = "") {
  if (handoffPath) {
    const resolvedPath = path.isAbsolute(handoffPath) ? handoffPath : path.join(cwd, handoffPath);

    try {
      await access(resolvedPath);
    } catch {
      throw new Error(`Manual dispatch handoff not found: ${handoffPath}`);
    }

    if (!fileMatchesIssueToken(path.basename(resolvedPath), issue)) {
      throw new Error(`Manual dispatch handoff does not match issue ${normalizeIssueRef(issue)}: ${resolvedPath}`);
    }

    return resolvedPath;
  }

  const candidates = await findExactIssueFiles(path.join("docs", "agents", "handoffs"), issue);
  if (candidates.length !== 1) {
    throw new Error(manualDispatchHandoffResolutionMessage(issue, candidates));
  }

  return candidates[0];
}

async function resolveCompletionReportFromIssue(issue) {
  const normalizedIssue = normalizeIssueRef(issue);
  const completionDir = path.join(cwd, "docs", "agents", "completions");
  let files = [];

  try {
    files = await readdir(completionDir);
  } catch {
    return {
      ok: false,
      kind: "missing",
      issue: normalizedIssue,
      completionDir,
      candidates: [],
    };
  }

  const candidates = [];
  for (const file of files) {
    if (!file.endsWith(".md")) {
      continue;
    }

    const target = path.join(completionDir, file);
    const markdown = await readFile(target, "utf8");
    const parsed = parseCompletionReport(markdown);
    const trackerIssue = normalizeIssueRef(parsed.issue.tracker);
    const filenameIssue = file.match(/(?:^|[^0-9])issue-(\d+)(?:[^0-9]|$)/i)?.[1] || "";

    if (trackerIssue !== normalizedIssue && filenameIssue !== normalizedIssue) {
      continue;
    }

    const fileStat = await stat(target);
    candidates.push({
      path: target,
      mtimeMs: fileStat.mtimeMs,
    });
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      kind: "missing",
      issue: normalizedIssue,
      completionDir,
      candidates: [],
    };
  }

  const latestMtimeMs = Math.max(...candidates.map((candidate) => candidate.mtimeMs));
  const latestCandidates = candidates
    .filter((candidate) => candidate.mtimeMs === latestMtimeMs)
    .sort((left, right) => left.path.localeCompare(right.path));

  if (latestCandidates.length !== 1) {
    return {
      ok: false,
      kind: "ambiguous",
      issue: normalizedIssue,
      completionDir,
      candidates: latestCandidates.map((candidate) => candidate.path),
    };
  }

  return {
    ok: true,
    issue: normalizedIssue,
    path: latestCandidates[0].path,
  };
}

async function writeArtifact(kind, content, args) {
  const issue = readOption(args, "issue", "local");
  const title = readOption(args, "title", kind);
  const status = readOption(args, "status", "");
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(`${issue}-${title || status || kind}`) || kind;
  const dirs = {
    context: "docs/agents/contexts",
    handoff: "docs/agents/handoffs",
    completion: "docs/agents/completions",
    hitl: "docs/agents/hitl",
    "review-prep": "docs/agents/reviews",
  };
  const dir = dirs[kind];
  const target = path.join(cwd, dir, `${date}-${slug}.md`);

  await mkdir(path.join(cwd, dir), { recursive: true });
  await writeFile(target, content, "utf8");
  process.stdout.write(`${target}\n`);
}

async function writeNamedArtifact(relativeDir, filename, content) {
  const target = path.join(cwd, relativeDir, filename);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
  return target;
}

async function resolveDagPath(args) {
  const dag = readOption(args, "dag");
  if (!dag) {
    throw new Error("Command requires --dag.");
  }

  const fullPath = path.isAbsolute(dag) ? dag : path.join(cwd, dag);
  if (!(await pathExists(fullPath))) {
    throw new Error(`DAG artifact not found: ${dag}`);
  }

  return fullPath;
}

async function reviewDecisionCommand(args) {
  const dagPath = await resolveDagPath(args);
  const nodeId = readOption(args, "node");
  const decision = readOption(args, "decision");
  const approvedBy = readOption(args, "approved-by");
  const reason = readOption(args, "reason");
  const issue = readOption(args, "issue", "local");

  if (!nodeId) {
    throw new Error("review-decision requires --node.");
  }

  const dag = JSON.parse(await readFile(dagPath, "utf8"));
  const updated = applyReviewDecision(dag, {
    nodeId,
    decision,
    approvedBy,
    reason,
  });
  await writeFile(dagPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");

  const date = new Date().toISOString().slice(0, 10);
  const artifactPath = await writeNamedArtifact(
    path.join("docs", "agents", "reviews"),
    `${date}-${slugify(`${issue}-${nodeId}-${decision}-review`)}.md`,
    renderGateDecisionArtifact({
      kind: "review",
      issue,
      nodeId,
      decision,
      approvedBy,
      reason,
      dagPath,
    }),
  );

  process.stdout.write(`${dagPath}\n${artifactPath}\n`);
}

async function qaDecisionCommand(args) {
  const dagPath = await resolveDagPath(args);
  const nodeId = readOption(args, "node");
  const decision = readOption(args, "decision");
  const approvedBy = readOption(args, "approved-by");
  const reason = readOption(args, "reason");
  const issue = readOption(args, "issue", "local");

  if (!nodeId) {
    throw new Error("qa-decision requires --node.");
  }

  const dag = JSON.parse(await readFile(dagPath, "utf8"));
  const updated = applyQaDecision(dag, {
    nodeId,
    decision,
    approvedBy,
    reason,
    evidence: {
      changed_outputs: splitOptionList(readOption(args, "changed-outputs")),
      verification_commands: splitOptionList(readOption(args, "verification-commands")),
      verification_results: splitOptionList(readOption(args, "verification-results")),
      acceptance_criteria_evidence: parseAcceptanceEvidenceOption(readOption(args, "acceptance-evidence")),
      test_evidence: parseTestEvidenceOption(readOption(args, "test-evidence")),
    },
  });
  await writeFile(dagPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");

  const date = new Date().toISOString().slice(0, 10);
  const artifactPath = await writeNamedArtifact(
    path.join("docs", "QA"),
    `${date}-${slugify(`${issue}-${nodeId}-${decision}-qa`)}.md`,
    renderGateDecisionArtifact({
      kind: "qa",
      issue,
      nodeId,
      decision,
      approvedBy,
      reason,
      dagPath,
      evidenceSummary: readOption(args, "verification-results"),
    }),
  );

  process.stdout.write(`${dagPath}\n${artifactPath}\n`);

  if (decision === "fail") {
    const followUp = renderFollowUpBugArtifact({
      issue,
      nodeId,
      approvedBy,
      reason,
    });
    const bugBase = `${date}-${slugify(`${issue}-${nodeId}-follow-up-bug`)}`;
    const jsonPath = await writeNamedArtifact(
      path.join("docs", "agents", "feedback"),
      `${bugBase}.json`,
      `${JSON.stringify(followUp.json, null, 2)}\n`,
    );
    const markdownPath = await writeNamedArtifact(
      path.join("docs", "agents", "feedback"),
      `${bugBase}.md`,
      followUp.markdown,
    );
    process.stdout.write(`${jsonPath}\n${markdownPath}\n`);
  }
}

async function printBoard() {
  const boardPath = path.join(cwd, "docs", "agents", "board.md");
  const contents = await readFile(boardPath, "utf8");
  process.stdout.write(contents);
}

async function mirrorArtifact(args) {
  const artifact = readOption(args, "artifact");
  const issue = readOption(args, "issue");
  const pr = readOption(args, "pr");
  const apply = args.includes("--apply");
  const updateExisting = args.includes("--update-existing");
  const artifactPath = path.isAbsolute(artifact) ? artifact : path.join(cwd, artifact);
  const markdown = await readFile(artifactPath, "utf8");
  const comment = buildMirrorComment({ artifactPath: artifact, markdown, issue, pr });
  const plan = renderMirrorPlan({ artifactPath: artifact, issue, pr, comment, apply, updateExisting });

  process.stdout.write(plan);

  if (!apply) {
    return;
  }

  const ghVersion = await commandAvailable("gh");
  if (!ghVersion.available) {
    throw new Error("gh CLI is required for mirror -- --apply. Install it from https://cli.github.com/.");
  }

  const auth = await commandAvailable("gh", ["auth", "status"]);
  if (!auth.available) {
    throw new Error("GitHub authentication is required for mirror -- --apply. Run `gh auth login` first.");
  }

  if (updateExisting) {
    const existing = findMirroredComment(await listGitHubComments({ issue, pr }), comment.marker);
    if (existing) {
      await updateGitHubIssueComment(existing.id, comment.body);
      process.stdout.write(`GitHub mirror comment updated: ${existing.url || existing.id}.\n`);
      return;
    }
  }

  if (issue) {
    await withTemporaryGhBody(comment.body, (bodyPath) =>
      runGh(["issue", "comment", issue, "--body-file", bodyPath]));
    process.stdout.write(`GitHub mirror comment posted to issue #${issue}.\n`);
  } else {
    await withTemporaryGhBody(comment.body, (bodyPath) =>
      runGh(["pr", "comment", pr, "--body-file", bodyPath]));
    process.stdout.write(`GitHub mirror comment posted to PR #${pr}.\n`);
  }
}

async function feedbackCommand(args) {
  const apply = args.includes("--apply");
  const result = classifyFeedback({
    issue: readOption(args, "issue"),
    pr: readOption(args, "pr"),
    finding: readOption(args, "finding"),
  });
  let suggestion = result.artifact_suggestion;
  let githubResult = "";

  if (apply) {
    const ghVersion = await commandAvailable("gh");
    if (!ghVersion.available) {
      throw new Error("gh CLI is required for feedback -- --apply. Install it from https://cli.github.com/.");
    }

    const auth = await commandAvailable("gh", ["auth", "status"]);
    if (!auth.available) {
      throw new Error("GitHub authentication is required for feedback -- --apply. Run `gh auth login` first.");
    }

    const pendingSuggestion = createFeedbackArtifactSuggestion(result, {
      artifactId: suggestion.artifact_id,
      createdAt: suggestion.json_payload.created_at,
      mode: "apply",
      githubMutation: result.kind === "same-pr-fix" ? "pending-pr-comment" : "pending-issue-create",
      mutationMessage: "GitHub mutation requested by `feedback -- --apply`.",
    });

    if (result.kind === "same-pr-fix") {
      await withTemporaryGhBody(pendingSuggestion.markdown_payload, (bodyPath) =>
        runGh(["pr", "comment", result.pr, "--body-file", bodyPath]));
      githubResult = `GitHub PR comment posted to #${result.pr}.`;
      suggestion = createFeedbackArtifactSuggestion(result, {
        artifactId: suggestion.artifact_id,
        createdAt: suggestion.json_payload.created_at,
        mode: "apply",
        githubMutation: "posted-pr-comment",
        mutationMessage: githubResult,
      });
    } else {
      const created = await withTemporaryGhBody(pendingSuggestion.markdown_payload, (bodyPath) =>
        runGh([
          "issue",
          "create",
          "--title",
          result.bug_draft.title,
          "--body-file",
          bodyPath,
        ]));
      const createdUrl = created.stdout.trim().split(/\r?\n/).find(Boolean) || "";
      githubResult = createdUrl ? `GitHub issue created: ${createdUrl}` : "GitHub issue created.";
      suggestion = createFeedbackArtifactSuggestion(result, {
        artifactId: suggestion.artifact_id,
        createdAt: suggestion.json_payload.created_at,
        mode: "apply",
        githubMutation: "created-issue",
        mutationMessage: githubResult,
      });
    }
  }

  const feedbackDir = path.join(cwd, suggestion.dir);
  const jsonTarget = path.join(cwd, suggestion.json_path);
  const markdownTarget = path.join(cwd, suggestion.markdown_path);

  await mkdir(feedbackDir, { recursive: true });
  await writeFile(jsonTarget, `${JSON.stringify(suggestion.json_payload, null, 2)}\n`, "utf8");
  await writeFile(markdownTarget, suggestion.markdown_payload, "utf8");

  process.stdout.write(apply ? suggestion.markdown_payload : renderFeedbackClassification(result));
  if (githubResult) {
    process.stdout.write(`${githubResult}\n`);
  }
  process.stdout.write(`\n${jsonTarget}\n${markdownTarget}\n`);
}

async function memoryDecisionCommand(args) {
  const proposalPath = readOption(args, "proposal");
  const decision = readOption(args, "decision");
  const normalizedDecision = decision?.toLowerCase();
  const approvedBy = readOption(args, "approved-by");
  const reason = readOption(args, "reason");
  const apply = args.includes("--apply");

  if (!proposalPath) {
    throw new Error("memory-decision requires --proposal.");
  }

  if (apply && decision && normalizedDecision !== "approve") {
    throw new Error("memory-decision -- --apply is only valid with --decision approve.");
  }

  const jsonPath = resolveRepoContainedPath(proposalPath);
  const proposal = JSON.parse(await readFile(jsonPath, "utf8"));
  const canonicalJsonPath = path.join(cwd, "docs", "agents", "memory-proposals", `${proposal.proposal_id}.json`);
  const canonicalMarkdownPath = path.join(cwd, "docs", "agents", "memory-proposals", `${proposal.proposal_id}.md`);
  if (jsonPath !== canonicalJsonPath) {
    throw new Error(`Memory proposal path does not match proposal id ${proposal.proposal_id}: ${proposalPath}`);
  }

  if (apply && !decision && proposal.status === "applied") {
    process.stdout.write(`${jsonPath}\n${canonicalMarkdownPath}\n`);
    process.stdout.write(`Memory proposal ${proposal.proposal_id} is already applied.\n`);
    return;
  }

  if (apply && !decision && proposal.status !== "approved") {
    throw new Error("memory-decision -- --apply without --decision approve requires an already approved proposal.");
  }

  let next = proposal;

  if (decision) {
    next = decideMemoryProposal(proposal, {
      decision,
      by: approvedBy,
      reason,
    });
  }

  const appliedTargets = [];
  if (apply) {
    const approvedProposal = next.status === "approved"
      ? next
      : decideMemoryProposal(next, {
          decision: "approve",
          by: approvedBy,
          reason: reason || "Approved for apply.",
        });

    for (const targetFile of approvedProposal.target_files) {
      const targetPath = resolveRepoContainedPath(targetFile);
      if (!(await pathExists(targetPath))) {
        throw new Error(`Memory proposal target file not found: ${targetFile}`);
      }

      const existing = await readFile(targetPath, "utf8");
      const applied = applyMemoryProposalToText(existing, approvedProposal);
      if (applied.changed) {
        await writeFile(targetPath, applied.text, "utf8");
      }
      appliedTargets.push(repoRelativePath(targetPath));
    }

    next = markMemoryProposalApplied(approvedProposal, {
      appliedBy: approvedBy,
      targetFiles: appliedTargets,
    });
  }

  await writeMemoryProposalArtifact(cwd, next);

  process.stdout.write(`${jsonPath}\n${canonicalMarkdownPath}\n`);
  process.stdout.write(`Memory proposal ${next.proposal_id} is ${next.status}.\n`);
  if (appliedTargets.length > 0) {
    process.stdout.write(`Applied to: ${appliedTargets.join(", ")}\n`);
  }
}

async function gitHubInit(args = []) {
  const config = await loadJson(".ai/ops.config.json");
  const templatePath = path.join(cwd, ".github", "ISSUE_TEMPLATE", "agentic-slice.md");
  const apply = args.includes("--apply");
  const createProject = args.includes("--create-project");
  const createProjectFields = args.includes("--create-project-fields");
  const projectTitle = readOption(args, "project-title", config.github?.repo || "AutoPocock");
  const ghVersion = await commandAvailable("gh");
  const auth = ghVersion.available ? await commandAvailable("gh", ["auth", "status"]) : null;
  const repoArgs = config.github?.owner && config.github?.repo ? ["--repo", `${config.github.owner}/${config.github.repo}`] : [];
  const project = configuredProjectRef(config, args);
  let existingLabels = [];
  let existingProjectFields = [];
  let existingProjectViews = [];
  let labelInspectionAvailable = false;
  let projectFieldInspectionAvailable = false;
  let projectViewInspectionAvailable = false;

  if (apply && !ghVersion.available) {
    throw new Error("gh CLI is required for github:init -- --apply. Install it from https://cli.github.com/.");
  }

  if (apply && !auth?.available) {
    throw new Error("GitHub authentication is required for github:init -- --apply. Run `gh auth login` first.");
  }

  if (ghVersion.available && auth?.available) {
    try {
      const labelResult = await runCommand("gh", ["label", "list", "--limit", "200", "--json", "name,color,description", ...repoArgs]);
      existingLabels = JSON.parse(labelResult.stdout);
      labelInspectionAvailable = true;
    } catch {
      existingLabels = [];
    }
  }

  if (apply && !labelInspectionAvailable) {
    throw new Error("github:init -- --apply could not inspect existing labels. Fix `gh` repository access before applying.");
  }

  if (createProject && !apply) {
    throw new Error("github:init -- --create-project requires --apply.");
  }

  if (createProject && hasProjectReference(project)) {
    throw new Error("github:init -- --create-project refuses to run when a Project reference is already configured.");
  }

  if (createProject && !project.owner) {
    throw new Error("github:init -- --create-project requires a configured GitHub owner or --owner.");
  }

  if (createProjectFields && !apply) {
    throw new Error("github:init -- --create-project-fields requires --apply.");
  }

  if (createProjectFields && !createProject && !project.projectNumber) {
    throw new Error("github:init -- --create-project-fields requires a configured GitHub Project number or --project-number.");
  }

  if (ghVersion.available && auth?.available && project.projectNumber) {
    try {
      const fieldResult = await runCommand("gh", [
        "project",
        "field-list",
        String(project.projectNumber),
        "--owner",
        project.owner,
        "--format",
        "json",
      ]);
      existingProjectFields = JSON.parse(fieldResult.stdout).fields || [];
      projectFieldInspectionAvailable = true;
    } catch {
      existingProjectFields = [];
    }
  }

  if (ghVersion.available && auth?.available && (project.projectId || (project.projectNumber && project.owner))) {
    try {
      const projectOwnerKind = String(project.projectUrl || "").includes("/orgs/") ? "organization" : "user";
      const viewsResult = await runCommand("gh", project.projectId
        ? [
            "api",
            "graphql",
            "--raw-field",
            "query=query($projectId: ID!) { node(id: $projectId) { ... on ProjectV2 { views(first: 50) { nodes { name number layout filter } } } } }",
            "-f",
            `projectId=${project.projectId}`,
          ]
        : [
            "api",
            "graphql",
            "--raw-field",
            projectOwnerKind === "organization"
              ? "query=query($owner: String!, $number: Int!) { organization(login: $owner) { projectV2(number: $number) { views(first: 50) { nodes { name number layout filter } } } } }"
              : "query=query($owner: String!, $number: Int!) { user(login: $owner) { projectV2(number: $number) { views(first: 50) { nodes { name number layout filter } } } } }",
            "-f",
            `owner=${project.owner}`,
            "-F",
            `number=${Number(project.projectNumber)}`,
          ]);
      const parsed = JSON.parse(viewsResult.stdout || "{}");
      existingProjectViews = parsed.data?.node?.views?.nodes
        || parsed.data?.user?.projectV2?.views?.nodes
        || parsed.data?.organization?.projectV2?.views?.nodes
        || [];
      projectViewInspectionAvailable = true;
    } catch {
      existingProjectViews = [];
    }
  }

  if (createProjectFields && !createProject && !projectFieldInspectionAvailable) {
    throw new Error("github:init -- --create-project-fields could not inspect existing Project fields. Fix Project access before applying.");
  }

  const report = await createGitHubBootstrapReport(config, {
    apply,
    createProject,
    createProjectFields,
    projectTitle,
    gh: {
      available: ghVersion.available,
      version: ghVersion.stdout.split(/\r?\n/)[0] || "",
      authenticated: Boolean(auth?.available),
      authDetail: auth?.stderr ? auth.stderr.split(/\r?\n/)[0] : "",
    },
    repository: project,
    existingLabels,
    ...(projectFieldInspectionAvailable ? { existingProjectFields } : {}),
    ...(projectViewInspectionAvailable ? { existingProjectViews } : {}),
    templatePresent: await pathExists(templatePath),
    runner: async (command, args) => runCommand(command, [...args, ...repoArgs]),
    projectRunner: async (command, args) => runCommand(command, args),
    projectFieldRunner: async (command, args) => runCommand(command, args),
  });

  process.stdout.write(report.text);
  process.stdout.write("\n## Next Steps\n\n");
  process.stdout.write("- Configure GitHub owner/repo/project reference in .ai/ops.config.json when ready.\n");
  process.stdout.write("- Use `pnpm ops github:init -- --apply` for missing label creation.\n");
  process.stdout.write("- Use `pnpm ops github:init -- --apply --create-project --project-title \"Name\"` only for fresh setups without a configured Project reference.\n");
  process.stdout.write("- Use `pnpm ops github:init -- --apply --create-project-fields` to create missing configured Project fields.\n");
  process.stdout.write("- Create, rename, or adjust GitHub Project views manually when Project View Inspection reports missing views or drift; GitHub CLI/GraphQL do not expose ProjectV2 view mutations.\n");
}

function configuredProjectRef(config, args = []) {
  return {
    owner: readOption(args, "owner", config.github?.owner || ""),
    repo: readOption(args, "repo", config.github?.repo || ""),
    projectUrl: readOption(args, "project-url", config.github?.projectUrl || ""),
    projectId: readOption(args, "project-id", config.github?.projectId || ""),
    projectNumber: readOption(args, "project-number", config.github?.projectNumber || ""),
  };
}

function hasProjectReference(project) {
  return Boolean(project.projectUrl || project.projectId || project.projectNumber);
}

function fieldValue(fields, name) {
  if (!Array.isArray(fields)) {
    return "";
  }

  const field = fields.find((candidate) => candidate.field?.name === name || candidate.name === name);
  if (!field) {
    return "";
  }

  if (Object.hasOwn(field, "value")) {
    return normalizeProjectValue(field.value);
  }

  if (Object.hasOwn(field, "text")) {
    return normalizeProjectValue(field.text);
  }

  if (Object.hasOwn(field, "name")) {
    return normalizeProjectValue(field.name);
  }

  return "";
}

function normalizeProjectValue(value) {
  if (value == null) {
    return "";
  }

  if (typeof value === "object") {
    if (Object.hasOwn(value, "name")) {
      return normalizeProjectValue(value.name);
    }

    return "";
  }

  return String(value);
}

function flatItemValue(item, name) {
  if (!item || typeof item !== "object") {
    return "";
  }

  const normalizedTarget = name.toLowerCase();
  for (const [key, value] of Object.entries(item)) {
    if (key.toLowerCase() !== normalizedTarget) {
      continue;
    }

    if (Array.isArray(value)) {
      return value.join("|");
    }

    return normalizeProjectValue(value);
  }

  return "";
}

function normalizeProjectItem(item) {
  const content = item.content || {};
  const rawLabels = item.labels || content.labels || [];
  const labels = rawLabels.map((label) => label.name || label).filter(Boolean);
  const fields = item.fieldValues || item.fields || [];
  const stage = fieldValue(fields, "Execution Stage") || flatItemValue(item, "execution Stage");

  return {
    id: content.number ? `#${content.number}` : item.id || "",
    projectItemId: item.id || "",
    url: content.url || item.url || "",
    title: content.title || item.title || "",
    labels,
    stage,
    lane: fieldValue(fields, "Execution Lane") || flatItemValue(item, "execution Lane"),
    featureTrack: fieldValue(fields, "Feature Track") || flatItemValue(item, "feature Track"),
    queueClass: fieldValue(fields, "Queue Class") || flatItemValue(item, "queue Class"),
    risk: fieldValue(fields, "Risk") || flatItemValue(item, "risk"),
    dependency: fieldValue(fields, "Dependency") || flatItemValue(item, "dependency"),
    conflictSurface: fieldValue(fields, "Conflict Surface") || flatItemValue(item, "conflict Surface"),
    writeSurface: normalizeWriteSurface(fieldValue(fields, "Write Surface") || flatItemValue(item, "write Surface")),
    dispatchId: fieldValue(fields, "Dispatch ID") || flatItemValue(item, "dispatch ID"),
    prLinks: content.pullRequest?.url ? [content.pullRequest.url] : [],
    updatedAt: content.updatedAt || item.updatedAt || "",
    tracerBulletDone: false,
  };
}

function findProjectField(fields, name) {
  return fields.find((field) => String(field.name || "").toLowerCase() === String(name).toLowerCase());
}

function findSingleSelectOption(field, value) {
  const normalized = String(value || "").toLowerCase();
  return (field?.options || []).find((option) => String(option.name || "").toLowerCase() === normalized);
}

async function loadProjectMutationContext(config, args, commandName) {
  const project = configuredProjectRef(config, args);
  const ghVersion = await commandAvailable("gh");
  if (!ghVersion.available) {
    throw new Error(`gh CLI is required for ${commandName}. Install it from https://cli.github.com/.`);
  }

  const auth = await commandAvailable("gh", ["auth", "status"]);
  if (!auth.available) {
    throw new Error(`GitHub authentication is required for ${commandName}. Run \`gh auth login\` first.`);
  }

  if (!project.owner) {
    throw new Error(`${commandName} requires a GitHub project owner. Set github.owner in .ai/ops.config.json or pass --owner.`);
  }

  if (!project.projectNumber) {
    throw new Error(`${commandName} requires a GitHub project number. Set github.projectNumber in .ai/ops.config.json or pass --project-number.`);
  }

  let projectId = project.projectId;
  if (!projectId) {
    const view = await runGh(["project", "view", project.projectNumber, "--owner", project.owner, "--format", "json"]);
    projectId = JSON.parse(view.stdout).id || "";
  }

  if (!projectId) {
    throw new Error(`${commandName} could not resolve the GitHub Project ID from project ${project.projectNumber}.`);
  }

  const fieldResult = await runGh(["project", "field-list", project.projectNumber, "--owner", project.owner, "--format", "json", "--limit", "100"]);
  const fields = JSON.parse(fieldResult.stdout).fields || [];

  return { project, projectId, fields };
}

function requireSingleSelectMutation(fields, fieldName, optionName, commandName) {
  const field = findProjectField(fields, fieldName);
  if (!field) {
    throw new Error(`${commandName} requires Project field "${fieldName}". Add it to the GitHub Project or update .ai/ops.config.json.`);
  }

  const option = findSingleSelectOption(field, optionName);
  if (!option) {
    throw new Error(`${commandName} requires option "${optionName}" on Project field "${fieldName}".`);
  }

  return {
    fieldName,
    fieldId: field.id,
    args: ["--field-id", field.id, "--single-select-option-id", option.id],
  };
}

function optionalTextMutation(fields, fieldName, value) {
  const field = findProjectField(fields, fieldName);
  if (!field) {
    return null;
  }

  return {
    fieldName,
    fieldId: field.id,
    args: ["--field-id", field.id, "--text", value],
  };
}

function requireTextMutation(fields, fieldName, value, commandName) {
  const mutation = optionalTextMutation(fields, fieldName, value);
  if (!mutation) {
    throw new Error(`${commandName} requires Project field "${fieldName}". Add it to the GitHub Project or update .ai/ops.config.json.`);
  }

  return mutation;
}

function requireClearMutation(fields, fieldName, commandName) {
  const field = findProjectField(fields, fieldName);
  if (!field) {
    throw new Error(`${commandName} requires Project field "${fieldName}". Add it to the GitHub Project or update .ai/ops.config.json.`);
  }

  return {
    fieldName,
    fieldId: field.id,
    args: ["--field-id", field.id, "--clear"],
  };
}

function projectItemIdFor(item) {
  if (item.projectItemId) {
    return item.projectItemId;
  }

  const id = String(item.id || "");
  return id.startsWith("PVTI") ? id : "";
}

async function createScheduleTrackerUpdateContext({ config, args, dispatchable, planPath, requiresDispatchId }) {
  if (dispatchable.length === 0) {
    return null;
  }

  const missingProjectItems = dispatchable
    .filter(({ item }) => !projectItemIdFor(item))
    .map(({ item }) => item.id || item.title || "unknown item");
  if (missingProjectItems.length > 0) {
    throw new Error(
      [
        "schedule -- --apply requires queue items with GitHub Project item IDs.",
        `Missing Project item IDs for: ${missingProjectItems.join(", ")}`,
        "Regenerate the queue with `pnpm ops github:export -- --output .ai/queue.json` before applying scheduler state.",
      ].join("\n"),
    );
  }

  const { projectId, fields } = await loadProjectMutationContext(config, args, "schedule -- --apply");
  const sharedMutations = [
    requireSingleSelectMutation(fields, "Execution Stage", "AFK In Progress", "schedule -- --apply"),
    requireSingleSelectMutation(fields, "Execution Lane", "Execution", "schedule -- --apply"),
  ];
  const lastPlanMutation = optionalTextMutation(fields, "Last Scheduler Plan", repoRelativePath(planPath));
  if (lastPlanMutation) {
    sharedMutations.push(lastPlanMutation);
  }

  const dispatchIdField = requiresDispatchId ? findProjectField(fields, "Dispatch ID") : null;
  if (requiresDispatchId && !dispatchIdField) {
    throw new Error('schedule -- --apply --dispatch requires Project field "Dispatch ID".');
  }

  return { projectId, sharedMutations, dispatchIdField };
}

async function applyScheduleTrackerUpdates({ dispatchable, dispatchIds, updateContext }) {
  if (dispatchable.length === 0) {
    process.stdout.write("No tracker updates were applied.\n");
    return;
  }

  let fieldUpdates = 0;
  for (const { item } of dispatchable) {
    const itemId = projectItemIdFor(item);
    const itemMutations = [...updateContext.sharedMutations];
    const dispatchId = dispatchIds.get(item.id);
    if (dispatchId) {
      itemMutations.push({
        fieldName: "Dispatch ID",
        fieldId: updateContext.dispatchIdField.id,
        args: ["--field-id", updateContext.dispatchIdField.id, "--text", dispatchId],
      });
    }

    for (const mutation of itemMutations) {
      await runGh(["project", "item-edit", "--id", itemId, "--project-id", updateContext.projectId, ...mutation.args]);
      fieldUpdates += 1;
    }
  }

  process.stdout.write(`Applied scheduler tracker updates for ${dispatchable.length} item(s) (${fieldUpdates} field update(s)).\n`);
}

async function applyClaimTrackerLease({ config, args, artifact, runner }) {
  if (!artifact?.project_item_id) {
    throw new Error("claim -- --apply-tracker requires the dispatch artifact to include project_item_id. Regenerate the dispatch from `pnpm ops schedule -- --dispatch` using a GitHub-exported queue.");
  }

  const { projectId, fields } = await loadProjectMutationContext(config, args, "claim -- --apply-tracker");
  const runnerMutation = requireTextMutation(fields, "Runner", runner, "claim -- --apply-tracker");
  await runGh(["project", "item-edit", "--id", artifact.project_item_id, "--project-id", projectId, ...runnerMutation.args]);
  process.stdout.write(`Applied tracker claim lease for ${artifact.dispatch_id} to Runner=${runner}.\n`);
}

async function clearClaimTrackerLease({ config, args, artifact }) {
  if (!artifact?.project_item_id) {
    throw new Error("reclaim -- --apply-tracker requires the dispatch artifact to include project_item_id. Regenerate the dispatch from `pnpm ops schedule -- --dispatch` using a GitHub-exported queue.");
  }

  const { projectId, fields } = await loadProjectMutationContext(config, args, "reclaim -- --apply-tracker");
  const runnerMutation = requireClearMutation(fields, "Runner", "reclaim -- --apply-tracker");
  await runGh(["project", "item-edit", "--id", artifact.project_item_id, "--project-id", projectId, ...runnerMutation.args]);
  process.stdout.write(`Cleared tracker claim lease for ${artifact.dispatch_id} from Runner.\n`);
}

function claimLockRef(artifact) {
  const lockName = slugify(artifact?.dispatch_id || `${artifact?.issue_id || "dispatch"}-${artifact?.title || "claim"}`);
  return `refs/heads/autopocock-locks/${lockName || "dispatch"}`;
}

function gitHubRepoRef(config, args = [], context = "GitHub operation") {
  const owner = readOption(args, "owner", config.github?.owner || "");
  const repo = readOption(args, "repo", config.github?.repo || "");
  if (!owner || !repo) {
    throw new Error(`${context} requires configured GitHub owner/repo or --owner/--repo.`);
  }
  return { owner, repo };
}

async function ensureGhReady(context) {
  const ghVersion = await commandAvailable("gh");
  if (!ghVersion.available) {
    throw new Error(`${context} requires gh CLI. Install it from https://cli.github.com/.`);
  }

  const auth = await commandAvailable("gh", ["auth", "status"]);
  if (!auth.available) {
    throw new Error(`${context} requires GitHub authentication. Run \`gh auth login\` first.`);
  }
}

async function acquireGitHubClaimLock({ config, args, artifact, runner }) {
  await ensureGhReady("claim -- --apply-lock-ref");
  const { owner, repo } = gitHubRepoRef(config, args, "claim -- --apply-lock-ref");
  const repoPath = `repos/${owner}/${repo}`;
  const repoResult = await runGh(["api", repoPath]);
  const defaultBranch = JSON.parse(repoResult.stdout || "{}").default_branch || "main";
  const defaultRefResult = await runGh(["api", `${repoPath}/git/ref/heads/${defaultBranch}`]);
  const sha = JSON.parse(defaultRefResult.stdout || "{}").object?.sha;
  if (!sha) {
    throw new Error(`claim -- --apply-lock-ref could not resolve ${owner}/${repo}@${defaultBranch}.`);
  }

  const ref = claimLockRef(artifact);
  try {
    await runGh([
      "api",
      `${repoPath}/git/refs`,
      "-f",
      `ref=${ref}`,
      "-f",
      `sha=${sha}`,
    ]);
  } catch (error) {
    throw new Error(
      [
        `Could not acquire distributed claim lock ${ref}.`,
        "Another runner may already hold this dispatch lock.",
        error.stderr || error.message || String(error),
      ].filter(Boolean).join("\n"),
    );
  }

  return {
    provider: "github-ref",
    ref,
    owner,
    repo,
    base_branch: defaultBranch,
    base_sha: sha,
    acquired_by: runner,
    acquired_at: nowIso(),
  };
}

async function releaseGitHubClaimLock({ config, args, artifact }) {
  const lock = artifact?.claim?.distributed_lock;
  if (lock?.provider !== "github-ref" || !lock.ref) {
    return null;
  }

  await ensureGhReady("reclaim -- --apply-lock-ref");
  const { owner, repo } = gitHubRepoRef(config, args, "reclaim -- --apply-lock-ref");
  const apiRef = lock.ref.replace(/^refs\//, "");
  await runGh(["api", "-X", "DELETE", `repos/${owner}/${repo}/git/refs/${apiRef}`]);
  return lock;
}

async function listGitHubClaimLockRefs({ config, args }) {
  await ensureGhReady("claim-locks");
  const { owner, repo } = gitHubRepoRef(config, args, "claim-locks");
  const result = await runGh(["api", `repos/${owner}/${repo}/git/matching-refs/heads/autopocock-locks`]);
  const refs = JSON.parse(result.stdout || "[]");
  return {
    owner,
    repo,
    refs: Array.isArray(refs) ? refs : [],
  };
}

async function inspectGitHubClaimLocks({ config, args, maxAgeHours }) {
  const remote = await listGitHubClaimLockRefs({ config, args });
  const localLocks = new Map();

  for (const { fullPath, artifact } of await listDispatchArtifacts()) {
    const lock = artifact?.claim?.distributed_lock;
    if (lock?.provider !== "github-ref" || !lock.ref) {
      continue;
    }

    localLocks.set(lock.ref, {
      fullPath,
      artifact,
      inspection: inspectClaimAge(artifact, maxAgeHours),
    });
  }

  return remote.refs.map((entry) => {
    const ref = String(entry.ref || "");
    const local = localLocks.get(ref);
    if (!local) {
      return {
        ref,
        sha: entry.object?.sha || "",
        status: "orphaned",
        artifact: null,
        fullPath: "",
        stale: false,
      };
    }

    const active = local.artifact?.status === "claimed" && local.artifact?.claim;
    return {
      ref,
      sha: entry.object?.sha || "",
      status: active ? (local.inspection.stale ? "stale" : "active") : "orphaned",
      artifact: local.artifact,
      fullPath: local.fullPath,
      stale: Boolean(local.inspection.stale),
    };
  });
}

async function gitHubExport(args) {
  const config = await loadJson(".ai/ops.config.json");
  const project = configuredProjectRef(config, args);
  const input = readOption(args, "input");
  const output = readOption(args, "output", config.queueFile || ".ai/queue.json");
  const requestedIssue = readOption(args, "issue");

  if (!hasProjectReference(project) && !input) {
    throw new Error("GitHub project reference is required. Set github.projectUrl, github.projectId, or github.projectNumber in .ai/ops.config.json, or pass --project-url/--project-id/--project-number.");
  }

  let rawItems = [];

  if (input) {
    const inputJson = await loadJson(input);
    rawItems = Array.isArray(inputJson) ? inputJson : inputJson.items || [];
  } else {
    const ghVersion = await commandAvailable("gh");
    if (!ghVersion.available) {
      throw new Error(
        "gh CLI is required for github:export. Immediate recovery: rerun with --input <path-to-project-items.json> to use a local export fixture. Permanent fix: install gh from https://cli.github.com/ and run `gh auth login`.",
      );
    }

    if (!project.owner) {
      throw new Error("GitHub project owner is required for github:export. Set github.owner in .ai/ops.config.json or pass --owner.");
    }

    if (!project.projectNumber) {
      throw new Error("github:export currently requires a GitHub project number. Set github.projectNumber in .ai/ops.config.json or pass --project-number.");
    }

    const result = await runCommand("gh", [
      "project",
      "item-list",
      project.projectNumber,
      "--owner",
      project.owner,
      "--format",
      "json",
      "--limit",
      "1000",
    ]);
    const parsed = JSON.parse(result.stdout);
    rawItems = parsed.items || [];
  }

  const queue = rawItems
    .map(normalizeProjectItem)
    .filter((item) => item.stage !== "Done");
  const outputPath = path.isAbsolute(output) ? output : path.join(cwd, output);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");

  process.stdout.write(`${outputPath}\n`);
  process.stdout.write(`Exported ${queue.length} non-Done item(s).\n`);
  if (requestedIssue) {
    const requestedIssueRef = normalizeIssueRef(requestedIssue);
    const found = queue.some((item) => normalizeIssueRef(item.id) === requestedIssueRef);
    process.stdout.write(`${renderExportIssueGuidance(requestedIssue, found)}\n`);
  }
}

async function loadJson(relativePath) {
  const fullPath = resolveRepoPath(cwd, relativePath);
  const contents = await readFile(fullPath, "utf8");
  return JSON.parse(contents);
}

async function ralphCommand(args) {
  const planArg = readOption(args, "plan");
  if (!planArg) {
    throw new Error("ralph requires --plan.");
  }

  const planPath = path.isAbsolute(planArg) ? planArg : path.join(cwd, planArg);
  if (!(await pathExists(planPath))) {
    throw new Error(`Ralph run plan not found: ${planArg}`);
  }

  const plan = JSON.parse(await readFile(planPath, "utf8"));
  const errors = validateRalphRunPlan(plan);
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  const stateArg = readOption(args, "state");
  const statePath = stateArg
    ? (path.isAbsolute(stateArg) ? stateArg : path.join(cwd, stateArg))
    : defaultRalphRunStatePath({ cwd, plan, planPath });

  let state;
  if (await pathExists(statePath)) {
    state = JSON.parse(await readFile(statePath, "utf8"));
  } else {
    state = createRalphRunState(plan, {
      source_plan: planPath,
    });
  }

  let action = { kind: "status" };

  const actor = readOption(args, "actor", "solo-operator");
  if (args.includes("--start")) {
    action = { kind: "start", issue_id: readOption(args, "start"), reason: readOption(args, "reason"), actor };
  } else if (args.includes("--complete")) {
    action = { kind: "complete", issue_id: readOption(args, "complete"), reason: readOption(args, "reason"), actor };
  } else if (args.includes("--block")) {
    action = { kind: "block", issue_id: readOption(args, "block"), reason: readOption(args, "reason"), actor };
  } else if (args.includes("--resume")) {
    action = { kind: "resume", issue_id: readOption(args, "resume"), reason: readOption(args, "reason"), actor };
  } else if (args.includes("--reset")) {
    action = { kind: "reset", issue_id: readOption(args, "reset"), reason: readOption(args, "reason"), actor };
  } else if (args.includes("--approve-wave")) {
    const waveId = readOption(args, "approve-wave");
    const approvedBy = readOption(args, "approved-by");
    if (!waveId) {
      throw new Error("ralph --approve-wave requires a wave id.");
    }
    if (!approvedBy) {
      throw new Error("ralph --approve-wave requires --approved-by.");
    }
    action = { kind: "approve_wave", wave_id: waveId, reason: readOption(args, "reason"), actor: approvedBy };
  } else if (args.includes("--freeze")) {
    action = { kind: "freeze", reason: readOption(args, "reason"), actor };
  } else if (args.includes("--unfreeze")) {
    action = { kind: "unfreeze", reason: readOption(args, "reason"), actor };
  }

  const targetWaveId = action.kind === "approve_wave" ? action.wave_id : "";
  if (action.kind === "approve_wave") {
    const draftBundle = buildWaveApprovalBundle({
      plan,
      state,
      waveId: targetWaveId,
      sourcePlanPath: planPath,
    });
    const wave = plan.waves.find((entry) => entry.wave_id === targetWaveId);
    const artifactPaths = defaultWaveApprovalArtifactPaths({ cwd, plan, wave });
    const approvedBundle = approveWaveBundle(draftBundle, {
      approvedBy: action.actor,
    });
    await mkdir(path.dirname(artifactPaths.json), { recursive: true });
    await writeFile(artifactPaths.json, `${JSON.stringify(approvedBundle, null, 2)}\n`, "utf8");
    await writeFile(artifactPaths.markdown, renderWaveApprovalBundle(approvedBundle), "utf8");
    action.bundle_json_path = artifactPaths.json;
    action.bundle_markdown_path = artifactPaths.markdown;
  }

  state = applyRalphRunAction(plan, state, action);

  const currentWave = buildRalphRunSnapshot(plan, state).current_wave;
  if (currentWave) {
    const wave = plan.waves.find((entry) => entry.wave_id === currentWave.wave_id);
    const artifactPaths = defaultWaveApprovalArtifactPaths({ cwd, plan, wave });
    const bundle = buildWaveApprovalBundle({
      plan,
      state,
      waveId: currentWave.wave_id,
      sourcePlanPath: planPath,
    });
    await mkdir(path.dirname(artifactPaths.json), { recursive: true });
    await writeFile(artifactPaths.json, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
    await writeFile(artifactPaths.markdown, renderWaveApprovalBundle(bundle), "utf8");
    state.wave_approvals[currentWave.wave_id] = {
      ...state.wave_approvals[currentWave.wave_id],
      bundle_json_path: artifactPaths.json,
      bundle_markdown_path: artifactPaths.markdown,
    };
  }

  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

  const snapshot = buildRalphRunSnapshot(plan, state);
  process.stdout.write(`${statePath}\n`);
  process.stdout.write(renderRalphRunSnapshot(plan, state, snapshot));
}

function hasLabel(item, label) {
  return Array.isArray(item.labels) && item.labels.includes(label);
}

function hasCanonicalReadyForAgentLabel(config) {
  const stateLabels = Array.isArray(config?.labels?.state) ? config.labels.state : [];
  const categoryLabels = Array.isArray(config?.labels?.category) ? config.labels.category : [];
  return [...stateLabels, ...categoryLabels].includes("ready-for-agent");
}

function riskCost(risk, defaults) {
  const cost = defaults.riskCost?.[risk || "low"] ?? 1;
  return cost === "approval-required" ? Infinity : cost;
}

function normalizeWriteSurface(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").replace(/\\/g, "/").trim()).filter(Boolean);
  }

  if (!value) {
    return [];
  }

  return String(value)
    .split("|")
    .map((item) => item.replace(/\\/g, "/").trim())
    .filter(Boolean);
}

function splitCommaOrPipeList(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function globToRegExp(glob) {
  const escaped = String(glob || "")
    .replace(/\\/g, "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "__AUTOPOCOCK_GLOBSTAR__")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped.replace(/__AUTOPOCOCK_GLOBSTAR__/g, ".*")}$`);
}

function writeSurfaceMatchesPath(surface, changedPath) {
  const normalizedSurface = String(surface || "").replace(/\\/g, "/").trim();
  const normalizedPath = String(changedPath || "").replace(/\\/g, "/").trim();
  if (!normalizedSurface || !normalizedPath) {
    return false;
  }

  if (["*", "**", "**/*"].includes(normalizedSurface)) {
    return true;
  }

  if (normalizedSurface.endsWith("/**")) {
    const prefix = normalizedSurface.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }

  if (normalizedSurface.includes("*")) {
    return globToRegExp(normalizedSurface).test(normalizedPath);
  }

  return normalizedPath === normalizedSurface || normalizedPath.startsWith(`${normalizedSurface}/`);
}

function activePrFilePath(file) {
  return typeof file === "string" ? file : file?.path || file?.filename || file?.name || "";
}

function inferQueueItemConflict(item, conflictInference) {
  if (!conflictInference?.enabled) {
    return null;
  }

  const writeSurface = normalizeWriteSurface(item.writeSurface || item.write_surface || item.changedFiles || item.changed_files);
  if (writeSurface.length === 0) {
    return null;
  }

  for (const pullRequest of conflictInference.pullRequests) {
    for (const file of pullRequest.files || []) {
      const changedPath = activePrFilePath(file);
      const matchedSurface = writeSurface.find((surface) => writeSurfaceMatchesPath(surface, changedPath));
      if (matchedSurface) {
        return {
          surface: "high",
          reason: `inferred high conflict surface from active PR #${pullRequest.number || "unknown"}: ${changedPath} overlaps ${matchedSurface}`,
        };
      }
    }
  }

  return null;
}

function evaluateQueueItem(item, context) {
  const defaults = context.config.schedulerDefaults || {};

  if (!hasLabel(item, "ready-for-agent")) {
    if (!hasCanonicalReadyForAgentLabel(context.config)) {
      return {
        action: "skip",
        reason: "repo config is missing the canonical ready-for-agent label; add it under labels.state and create the matching GitHub label before dispatching",
      };
    }

    return {
      action: "skip",
      reason: "issue is missing the ready-for-agent label; add it to the GitHub issue to make the slice dispatchable",
    };
  }

  if (item.stage !== "Ready for Handoff") {
    return { action: "skip", reason: `stage is ${item.stage || "unset"}` };
  }

  if (item.dependency && item.dependency !== "unblocked") {
    return { action: "skip", reason: `dependency is ${item.dependency}` };
  }

  if (item.risk === "high") {
    return { action: "skip", reason: "high risk requires Solo Operator approval" };
  }

  if (item.conflictSurface === "high") {
    return { action: "skip", reason: "high conflict surface requires Solo Operator approval" };
  }

  const inferredConflict = inferQueueItemConflict(item, context.conflictInference);
  if (inferredConflict?.surface === "high") {
    return { action: "skip", reason: inferredConflict.reason, inferredConflict };
  }

  if (item.queueClass === "routine-afk" && !item.tracerBulletDone) {
    return { action: "skip", reason: "feature track tracer bullet is not done" };
  }

  const cost = riskCost(item.risk, defaults);
  if (cost > context.remainingCapacity) {
    return { action: "skip", reason: `insufficient review capacity; needs ${cost}, has ${context.remainingCapacity}` };
  }

  context.remainingCapacity -= cost;
  return { action: "dispatch", reason: `fits scheduler plan; consumes ${cost} review capacity` };
}

function normalizeActivePullRequests(value) {
  const pullRequests = Array.isArray(value) ? value : value?.pullRequests || value?.pull_requests || [];
  return pullRequests.map((pullRequest) => ({
    number: pullRequest.number || pullRequest.id || "",
    title: pullRequest.title || "",
    files: Array.isArray(pullRequest.files) ? pullRequest.files : [],
  }));
}

async function loadActivePullRequestsFromGitHub() {
  const ghVersion = await commandAvailable("gh");
  if (!ghVersion.available) {
    throw new Error("gh CLI is required for schedule -- --infer-conflicts without --active-prs-input. Install it from https://cli.github.com/.");
  }

  const auth = await commandAvailable("gh", ["auth", "status"]);
  if (!auth.available) {
    throw new Error("GitHub authentication is required for schedule -- --infer-conflicts. Run `gh auth login` first.");
  }

  const listResult = await runGh(["pr", "list", "--state", "open", "--json", "number,title"]);
  const listed = JSON.parse(listResult.stdout || "[]");
  const pullRequests = [];
  for (const pullRequest of listed) {
    const viewResult = await runGh(["pr", "view", String(pullRequest.number), "--json", "files"]);
    const view = JSON.parse(viewResult.stdout || "{}");
    pullRequests.push({
      number: pullRequest.number,
      title: pullRequest.title || "",
      files: Array.isArray(view.files) ? view.files : [],
    });
  }
  return pullRequests;
}

async function createConflictInferenceContext(args) {
  if (!args.includes("--infer-conflicts")) {
    return { enabled: false, pullRequests: [], source: "disabled" };
  }

  const activePrsInput = readOption(args, "active-prs-input");
  if (activePrsInput) {
    const inputPath = path.isAbsolute(activePrsInput) ? activePrsInput : path.join(cwd, activePrsInput);
    const parsed = JSON.parse(await readFile(inputPath, "utf8"));
    return {
      enabled: true,
      pullRequests: normalizeActivePullRequests(parsed),
      source: activePrsInput,
    };
  }

  return {
    enabled: true,
    pullRequests: await loadActivePullRequestsFromGitHub(),
    source: "github-open-prs",
  };
}

async function schedule(args) {
  const config = await loadJson(".ai/ops.config.json");
  const queuePath = readOption(args, "queue", config.queueFile || ".ai/queue.json");
  const capacityOverride = readOption(args, "review-capacity");
  const shouldDispatch = args.includes("--dispatch");
  const shouldApply = args.includes("--apply");
  const requestedIssue = readOption(args, "issue");
  const queueFullPath = path.isAbsolute(queuePath) ? queuePath : path.join(cwd, queuePath);

  if (!(await pathExists(queueFullPath))) {
    throw new Error(queueRecoveryMessage(queuePath));
  }

  const queue = await loadJson(queuePath);
  const reviewCapacity = Number.parseInt(capacityOverride || config.schedulerDefaults?.reviewCapacity || "1", 10);
  const conflictInference = await createConflictInferenceContext(args);
  const context = { config, remainingCapacity: reviewCapacity, conflictInference };
  const bugLoop = queue.filter((item) => item.stage === "Bug Loop");
  const candidates = queue.filter((item) => item.stage !== "Bug Loop");
  const ordered = config.schedulerDefaults?.bugLoopBeforeNewAfk ? [...bugLoop, ...candidates] : queue;
  const decisions = [];

  const lines = [
    "# Scheduler Plan",
    "",
    `Queue: ${queuePath}`,
    `Review capacity: ${reviewCapacity}`,
    `Dispatch mode: ${shouldDispatch ? "enabled" : "dry-run only"}`,
    `Tracker apply mode: ${shouldApply ? "enabled" : "dry-run only"}`,
    `Conflict inference: ${conflictInference.enabled ? `enabled (${conflictInference.source}, ${conflictInference.pullRequests.length} active PR(s))` : "disabled"}`,
    "",
    "## Decisions",
    "",
  ];

  for (const item of ordered) {
    const decision = evaluateQueueItem(item, context);
    decisions.push({ item, decision });
    lines.push(`- ${decision.action.toUpperCase()}: ${item.id} ${item.title} - ${decision.reason}`);
  }

  lines.push("", `Remaining review capacity: ${context.remainingCapacity}`, "");
  if (shouldDispatch && shouldApply) {
    lines.push("Dispatch artifacts will be created and tracker fields will be updated for DISPATCH decisions only.");
  } else if (shouldDispatch) {
    lines.push("Dispatch artifacts will be created for DISPATCH decisions only.");
  } else if (shouldApply) {
    lines.push("Tracker fields will be updated for DISPATCH decisions only. No dispatch artifacts will be created.");
  } else {
    lines.push("No tracker state was changed and no subagents were dispatched.");
  }

  const plan = `${lines.join("\n")}\n`;
  const date = nowForFile();
  const target = path.join(cwd, "docs", "agents", "schedules", `${date}-scheduler-plan.md`);

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, plan, "utf8");

  process.stdout.write(plan);
  process.stdout.write(`\nSaved scheduler plan: ${target}\n`);

  if (requestedIssue) {
    const requestedIssueRef = normalizeIssueRef(requestedIssue);
    const matched = decisions.find(({ item }) => normalizeIssueRef(item.id) === requestedIssueRef);
    const dispatchedItems = decisions.filter(({ decision }) => decision.action === "dispatch").map(({ item }) => item);
    const isRequestedDispatched = matched?.decision?.action === "dispatch";
    if (!isRequestedDispatched) {
      process.stdout.write(
        `${renderSchedulerMismatchGuidance({
          issue: requestedIssue,
          queuePath,
          shouldDispatch,
          matchedItem: matched?.item,
          matchedDecision: matched?.decision,
          dispatchedItems,
        })}\n`,
      );
    }
  }

  const dispatchable = decisions.filter(({ decision }) => decision.action === "dispatch");
  const dispatchIds = new Map();
  const trackerUpdateContext = shouldApply
    ? await createScheduleTrackerUpdateContext({
        config,
        args,
        dispatchable,
        planPath: target,
        requiresDispatchId: shouldDispatch && dispatchable.length > 0,
      })
    : null;

  if (shouldDispatch) {
    if (dispatchable.length === 0) {
      process.stdout.write("No dispatch artifacts were created.\n");
    } else {
      for (const { item } of dispatchable) {
        const created = await createDispatchArtifact({
          issue: item.id,
          title: item.title,
          source: "scheduler-plan",
          plan: target,
          featureTrack: item.featureTrack || "TBD",
          queueClass: item.queueClass || "tracer-bullet",
          risk: item.risk || "low",
          conflictSurface: item.conflictSurface || "low",
          isolationMode: "worktree",
          projectItemId: projectItemIdFor(item),
        });
        dispatchIds.set(item.id, created.artifact.dispatch_id);
        process.stdout.write(`${created.jsonTarget}\n${created.mdTarget}\n`);
      }
    }
  }

  if (shouldApply) {
    await applyScheduleTrackerUpdates({ dispatchable, dispatchIds, updateContext: trackerUpdateContext });
  }
}

function dispatchMarkdown(dispatch) {
  return `# Dispatch Artifact

## Identity

- Dispatch ID: ${dispatch.dispatch_id}
- Status: ${dispatch.status}
- Source: ${dispatch.source}
- Created at: ${dispatch.created_at}

## Issue

- Issue: ${dispatch.issue_id}
- Title: ${dispatch.title}
- Feature track: ${dispatch.feature_track}

## Scheduling

- Queue class: ${dispatch.queue_class}
- Risk: ${dispatch.risk}
- Conflict surface: ${dispatch.conflict_surface}
- Isolation mode: ${dispatch.isolation_mode}

## Links

- Handoff artifact: ${dispatch.handoff_artifact || "TBD"}
- Loop Spec target: ${dispatch.loop_spec_target || "TBD"}
- Completion report target: ${dispatch.completion_report_target}
- Scheduler plan: ${dispatch.created_from_scheduler_plan || "TBD"}

## Controls

- Allowed commands:
${dispatch.allowed_commands.map((command) => `  - ${command}`).join("\n")}
- Forbidden actions:
${dispatch.forbidden_actions.map((action) => `  - ${action}`).join("\n")}

## Manual Override

- Override reason: ${dispatch.override_reason || "N/A"}
`;
}

async function createDispatchArtifact({
  issue,
  title,
  source = "manual",
  overrideReason = "",
  plan = "",
  featureTrack = "TBD",
  queueClass = "tracer-bullet",
  risk = "low",
  conflictSurface = "low",
  isolationMode = "branch",
  handoff = "",
  dockerImage = "",
  dockerWorkspace = "",
  dockerNetwork = "",
  dockerEnv = [],
  dockerVolumes = [],
  projectItemId = "",
} = {}) {
  if (!issue) {
    throw new Error("Dispatch requires --issue.");
  }

  if (!title) {
    throw new Error("Dispatch requires --title.");
  }

  if (source === "manual" && !overrideReason) {
    throw new Error("Manual dispatch requires --override-reason.");
  }

  if (source === "scheduler-plan" && !plan) {
    throw new Error("Scheduler-sourced dispatch requires --plan.");
  }

  const resolvedHandoff =
    source === "manual"
      ? await resolveManualDispatchHandoff(issue, handoff)
      : handoff || (issue ? await findLatestHandoff(issue) : "");

  const timestamp = nowForFile();
  const dispatchId = `dispatch-${timestamp}-${slugify(issue)}`;
  const dir = path.join(cwd, "docs", "agents", "dispatches");
  const jsonTarget = path.join(dir, `${dispatchId}.json`);
  const mdTarget = path.join(dir, `${dispatchId}.md`);
  const completionTarget = path.join(cwd, "docs", "agents", "completions", `${dispatchId}-completion.md`);
  const loopSpecTarget = path.join(cwd, "docs", "agents", "loop-specs", `${dispatchId}-loop-spec.json`);
  const worktreePath = ["worktree", "docker"].includes(isolationMode) ? deriveWorktreePath(issue, title) : "";
  const docker = isolationMode === "docker"
    ? defaultDockerSpec({
        issue,
        title,
        image: dockerImage,
        workspace: dockerWorkspace,
        network: dockerNetwork,
        env: dockerEnv,
        volumes: dockerVolumes,
      })
    : null;

  const artifact = {
    dispatch_id: dispatchId,
    issue_id: issue,
    title,
    feature_track: featureTrack,
    queue_class: queueClass,
    risk,
    conflict_surface: conflictSurface,
    isolation_mode: isolationMode,
    expected_branch: `agent/${slugify(issue)}-${slugify(title)}`,
    worktree_path: worktreePath,
    handoff_artifact: resolvedHandoff,
    project_item_id: projectItemId,
    loop_spec_target: loopSpecTarget,
    completion_report_target: completionTarget,
    allowed_commands: ["run relevant tests", "update completion report"],
    forbidden_actions: ["merge PR", "change durable memory without approval", "handle secrets", "make unrelated dependency changes"],
    ...(docker ? { docker } : {}),
    created_from_scheduler_plan: plan,
    source,
    override_reason: overrideReason,
    status: "queued",
    created_at: nowIso(),
    claim: null,
  };

  await mkdir(dir, { recursive: true });
  await writeFile(jsonTarget, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(mdTarget, dispatchMarkdown(artifact), "utf8");

  return { artifact, jsonTarget, mdTarget };
}

async function dispatch(args) {
  const created = await createDispatchArtifact({
    issue: readOption(args, "issue"),
    title: readOption(args, "title"),
    source: readOption(args, "source", "manual"),
    overrideReason: readOption(args, "override-reason"),
    plan: readOption(args, "plan"),
    featureTrack: readOption(args, "feature-track", "TBD"),
    queueClass: readOption(args, "queue-class", "tracer-bullet"),
    risk: readOption(args, "risk", "low"),
    conflictSurface: readOption(args, "conflict-surface", "low"),
    isolationMode: readOption(args, "isolation-mode", "branch"),
    handoff: readOption(args, "handoff"),
    dockerImage: readOption(args, "docker-image"),
    dockerWorkspace: readOption(args, "docker-workspace"),
    dockerNetwork: readOption(args, "docker-network"),
    dockerEnv: splitOptionList(readOption(args, "docker-env")),
    dockerVolumes: splitOptionList(readOption(args, "docker-volume")),
  });

  process.stdout.write(`${created.jsonTarget}\n${created.mdTarget}\n`);
}

async function claim(args) {
  const claimedBy = readOption(args, "claimed-by");
  const requestedIsolationMode = readOption(args, "isolation-mode", "");
  const requestedWorktreePath = readOption(args, "worktree-path");
  const requestedDockerImage = readOption(args, "docker-image");
  const requestedDockerWorkspace = readOption(args, "docker-workspace");
  const requestedDockerNetwork = readOption(args, "docker-network");
  const requestedDockerEnv = splitOptionList(readOption(args, "docker-env"));
  const requestedDockerVolumes = splitOptionList(readOption(args, "docker-volume"));
  const leaseHours = parsePositiveNumber(readOption(args, "lease-hours", ""), 24, "Claim --lease-hours");
  const applyTracker = args.includes("--apply-tracker");
  const applyLockRef = args.includes("--apply-lock-ref");
  let claimedArtifact = null;

  if (!claimedBy) {
    throw new Error("Claim requires --claimed-by.");
  }

  const { fullPath } = await resolveDispatchArtifact(args, { command: "claim", status: "queued" });

  await withDispatchArtifactLock(fullPath, async () => {
    const artifact = JSON.parse(await readFile(fullPath, "utf8"));
    let distributedLock = null;

    if (artifact.status !== "queued") {
      throw new Error(`Dispatch ${artifact.dispatch_id || fullPath} is ${artifact.status}, not queued.`);
    }

    const isolationMode = requestedIsolationMode || artifact.isolation_mode || "branch";
    const claimedAt = nowIso();

    if (artifact.isolation_mode && artifact.isolation_mode !== isolationMode) {
      throw new Error(
        `Claim isolation mode ${isolationMode} does not match dispatch isolation mode ${artifact.isolation_mode}.`,
      );
    }

    if (applyLockRef) {
      distributedLock = await acquireGitHubClaimLock({
        config: await loadJson(".ai/ops.config.json"),
        args,
        artifact,
        runner: claimedBy,
      });
    }

    artifact.status = "claimed";
    artifact.claim = {
      claimed_by: claimedBy,
      claimed_at: claimedAt,
      lease_hours: leaseHours,
      expires_at: addHoursIso(claimedAt, leaseHours),
      isolation_mode: isolationMode,
      ...(distributedLock ? { distributed_lock: distributedLock } : {}),
    };

    if (!artifact.isolation_mode) {
      artifact.isolation_mode = isolationMode;
    }

    if (["worktree", "docker"].includes(isolationMode)) {
      artifact.worktree_path =
        requestedWorktreePath || artifact.worktree_path || deriveWorktreePath(artifact.issue_id, artifact.title);
      if (isolationMode === "docker") {
        artifact.docker = dockerSpecForDispatch(artifact, {
          image: requestedDockerImage,
          workspace: requestedDockerWorkspace,
          network: requestedDockerNetwork,
          env: requestedDockerEnv,
          volumes: requestedDockerVolumes,
        });
      }
    } else if (requestedWorktreePath) {
      throw new Error("Claim accepts --worktree-path only when isolation mode is worktree or docker.");
    }

    await writeFile(fullPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    claimedArtifact = artifact;
  });

  if (applyTracker) {
    const config = await loadJson(".ai/ops.config.json");
    await applyClaimTrackerLease({
      config,
      args,
      artifact: claimedArtifact,
      runner: claimedBy,
    });
  }

  process.stdout.write(`${fullPath}\n`);
  if (claimedArtifact?.claim?.distributed_lock) {
    process.stdout.write(`Acquired distributed claim lock ${claimedArtifact.claim.distributed_lock.ref}.\n`);
  }
}

async function claimStatus(args) {
  const maxAgeHours = parsePositiveNumber(readOption(args, "max-age-hours", "24"), 24, "claim-status --max-age-hours");
  const { fullPath, artifact } = await resolveDispatchArtifact(args, { command: "claim-status", status: "claimed" });
  const inspection = inspectClaimAge(artifact, maxAgeHours);

  const lines = [
    "# Claim Status",
    "",
    `Dispatch: ${artifact.dispatch_id || fullPath}`,
    `Status: ${artifact.status || "unknown"}`,
    `Isolation mode: ${artifact.isolation_mode || "unset"}`,
    `Claimed by: ${artifact.claim?.claimed_by || "N/A"}`,
    `Claimed at: ${inspection.claimedAt || "N/A"}`,
    `Lease hours: ${inspection.leaseHours == null ? "N/A" : inspection.leaseHours}`,
    `Lease expires at: ${inspection.expiresAt || "N/A"}`,
    `Max age hours: ${inspection.maxAgeHours}`,
    `Current age hours: ${inspection.ageHours == null ? "N/A" : inspection.ageHours.toFixed(2)}`,
    `Stale: ${inspection.stale ? "yes" : "no"}`,
  ];

  if (inspection.stale) {
    lines.push("", "Solo Operator action required: use `pnpm ops reclaim` to return this dispatch to queued.");
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

async function reclaim(args) {
  const approvedBy = readOption(args, "approved-by");
  const reason = readOption(args, "reason");
  const maxAgeHours = parsePositiveNumber(readOption(args, "max-age-hours", "24"), 24, "reclaim --max-age-hours");
  const applyTracker = args.includes("--apply-tracker");
  const applyLockRef = args.includes("--apply-lock-ref");
  let reclaimedArtifact = null;
  let releasedLock = null;

  if (!approvedBy) {
    throw new Error("Reclaim requires --approved-by.");
  }

  if (!reason) {
    throw new Error("Reclaim requires --reason.");
  }

  const { fullPath } = await resolveDispatchArtifact(args, { command: "reclaim", status: "claimed" });

  await withDispatchArtifactLock(fullPath, async () => {
    const artifact = JSON.parse(await readFile(fullPath, "utf8"));

    if (artifact.status !== "claimed" || !artifact.claim) {
      throw new Error(`Dispatch ${artifact.dispatch_id || fullPath} is ${artifact.status}, not claimed.`);
    }

    const inspection = inspectClaimAge(artifact, maxAgeHours);
    if (applyLockRef) {
      releasedLock = await releaseGitHubClaimLock({
        config: await loadJson(".ai/ops.config.json"),
        args,
        artifact,
      });
    }

    const historyEntry = {
      ...artifact.claim,
      reclaimed_at: nowIso(),
      reclaimed_by: approvedBy,
      reclaim_reason: reason,
      stale_at_reclaim: inspection.stale,
      age_hours_at_reclaim: inspection.ageHours == null ? null : Number(inspection.ageHours.toFixed(2)),
    };

    const reclaimed = reclaimDispatchArtifact(artifact, historyEntry);

    await writeFile(fullPath, `${JSON.stringify(reclaimed, null, 2)}\n`, "utf8");
    reclaimedArtifact = reclaimed;
  });

  if (applyTracker) {
    const config = await loadJson(".ai/ops.config.json");
    await clearClaimTrackerLease({
      config,
      args,
      artifact: reclaimedArtifact,
    });
  }

  process.stdout.write(`${fullPath}\n`);
  process.stdout.write(`Reclaimed by ${approvedBy}. Dispatch returned to queued.\n`);
  if (releasedLock) {
    process.stdout.write(`Released distributed claim lock ${releasedLock.ref}.\n`);
  }
}

async function reclaimExpired(args) {
  const apply = args.includes("--apply");
  const applyTracker = args.includes("--apply-tracker");
  const applyLockRef = args.includes("--apply-lock-ref");
  const approvedBy = readOption(args, "approved-by");
  const reason = readOption(args, "reason", "Claim lease expired");
  const maxAgeHours = parsePositiveNumber(readOption(args, "max-age-hours", "24"), 24, "reclaim-expired --max-age-hours");
  const candidates = [];

  if (apply && !approvedBy) {
    throw new Error("reclaim-expired -- --apply requires --approved-by.");
  }

  if (apply && !reason) {
    throw new Error("reclaim-expired -- --apply requires --reason.");
  }

  for (const { fullPath, artifact } of await listDispatchArtifacts()) {
    if (artifact?.status !== "claimed" || !artifact?.claim) {
      continue;
    }

    const inspection = inspectClaimAge(artifact, maxAgeHours);
    if (inspection.stale) {
      candidates.push({ fullPath, artifact, inspection });
    }
  }

  const lines = [
    "# Expired Claim Enforcement",
    "",
    `Mode: ${apply ? "apply" : "dry-run"}`,
    `Max age hours fallback: ${maxAgeHours}`,
    `Expired claims: ${candidates.length}`,
  ];

  for (const { fullPath, artifact, inspection } of candidates) {
    lines.push(
      `- ${artifact.dispatch_id || path.basename(fullPath)} (${artifact.issue_id || "no issue"}): claimed by ${artifact.claim?.claimed_by || "unknown"}, expires ${inspection.expiresAt || "N/A"}, age ${inspection.ageHours == null ? "N/A" : inspection.ageHours.toFixed(2)}h`,
    );
  }

  if (!apply) {
    lines.push("", "No dispatch artifacts were modified. Add `--apply --approved-by <operator> --reason \"...\"` to reclaim expired claims.");
    process.stdout.write(`${lines.join("\n")}\n`);
    return;
  }

  const reclaimedArtifacts = [];
  const releasedLocks = [];
  const lockConfig = applyLockRef ? await loadJson(".ai/ops.config.json") : null;
  for (const candidate of candidates) {
    let reclaimedArtifact = null;
    await withDispatchArtifactLock(candidate.fullPath, async () => {
      const artifact = JSON.parse(await readFile(candidate.fullPath, "utf8"));
      if (artifact.status !== "claimed" || !artifact.claim) {
        return;
      }

      const inspection = inspectClaimAge(artifact, maxAgeHours);
      if (!inspection.stale) {
        return;
      }

      if (applyLockRef) {
        const releasedLock = await releaseGitHubClaimLock({
          config: lockConfig,
          args,
          artifact,
        });
        if (releasedLock) {
          releasedLocks.push(releasedLock);
        }
      }

      const historyEntry = {
        ...artifact.claim,
        reclaimed_at: nowIso(),
        reclaimed_by: approvedBy,
        reclaim_reason: reason,
        stale_at_reclaim: inspection.stale,
        age_hours_at_reclaim: inspection.ageHours == null ? null : Number(inspection.ageHours.toFixed(2)),
        automated_lease_enforcement: true,
      };
      reclaimedArtifact = reclaimDispatchArtifact(artifact, historyEntry);
      await writeFile(candidate.fullPath, `${JSON.stringify(reclaimedArtifact, null, 2)}\n`, "utf8");
    });

    if (reclaimedArtifact) {
      reclaimedArtifacts.push(reclaimedArtifact);
    }
  }

  if (applyTracker && reclaimedArtifacts.length > 0) {
    const config = await loadJson(".ai/ops.config.json");
    for (const artifact of reclaimedArtifacts) {
      await clearClaimTrackerLease({
        config,
        args,
        artifact,
      });
    }
  }

  lines.push("", `Applied expired-claim enforcement for ${reclaimedArtifacts.length} dispatch artifact(s).`);
  if (releasedLocks.length > 0) {
    lines.push(`Released distributed claim locks for ${releasedLocks.length} dispatch artifact(s).`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

async function claimLocks(args) {
  const apply = args.includes("--apply");
  const approvedBy = readOption(args, "approved-by");
  const reason = readOption(args, "reason");
  const maxAgeHours = parsePositiveNumber(readOption(args, "max-age-hours", "24"), 24, "claim-locks --max-age-hours");
  const config = await loadJson(".ai/ops.config.json");
  const { owner, repo } = gitHubRepoRef(config, args, "claim-locks");

  if (apply && !approvedBy) {
    throw new Error("claim-locks -- --apply requires --approved-by.");
  }

  if (apply && !reason) {
    throw new Error("claim-locks -- --apply requires --reason.");
  }

  const inspection = await inspectGitHubClaimLocks({ config, args, maxAgeHours });
  const orphaned = inspection.filter((lock) => lock.status === "orphaned");
  const active = inspection.filter((lock) => lock.status === "active");
  const stale = inspection.filter((lock) => lock.status === "stale");
  const lines = [
    "# Distributed Claim Locks",
    "",
    `Mode: ${apply ? "apply" : "dry-run"}`,
    `Repository: ${owner}/${repo}`,
    `Remote lock refs: ${inspection.length}`,
    `Active: ${active.length}`,
    `Stale: ${stale.length}`,
    `Orphaned: ${orphaned.length}`,
    "",
    "## Locks",
  ];

  if (inspection.length === 0) {
    lines.push("- None");
  } else {
    for (const lock of inspection) {
      if (lock.status === "active" || lock.status === "stale") {
        lines.push(`- ${lock.status}: ${lock.ref} -> ${lock.artifact.dispatch_id || path.basename(lock.fullPath)}`);
      } else {
        lines.push(`- orphaned: ${lock.ref}`);
      }
    }
  }

  if (!apply) {
    lines.push("", "No remote lock refs were deleted. Add `--apply --approved-by <operator> --reason \"...\"` to delete orphaned refs only.");
    process.stdout.write(`${lines.join("\n")}\n`);
    return;
  }

  for (const lock of orphaned) {
    const apiRef = lock.ref.replace(/^refs\//, "");
    await runGh(["api", "-X", "DELETE", `repos/${owner}/${repo}/git/refs/${apiRef}`]);
  }

  lines.push("", `Deleted orphaned lock refs: ${orphaned.length}`);
  if (stale.length > 0) {
    lines.push("Stale matched locks were not deleted here; use `pnpm ops reclaim-expired -- --apply --apply-lock-ref` so local dispatch state and remote refs move together.");
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

async function dockerValidate(args) {
  const image = readOption(args, "image", "node:22-bookworm");
  const provider = readOption(args, "provider", "");
  const requiredCommands = splitCommaOrPipeList(readOption(args, "require-command", "node,pnpm,git"));
  const envAllowlist = uniqueList([
    ...splitOptionList(readOption(args, "docker-env")),
    ...splitOptionList(readOption(args, "require-env")),
  ]);
  const volumes = splitOptionList(readOption(args, "docker-volume"));
  const network = readOption(args, "docker-network", "none");

  if (!image) {
    throw new Error("docker:validate requires --image.");
  }

  const missingEnv = envAllowlist.filter((name) => !process.env[name]);
  if (missingEnv.length > 0) {
    throw new Error(`Docker image validation failed before launch. Missing host env for allowlist: ${missingEnv.join(", ")}.`);
  }

  const dockerReadiness = await commandAvailable("docker");
  if (!dockerReadiness.available) {
    throw new Error(`Docker image validation failed before launch. Docker CLI unavailable: ${dockerReadiness.stderr || "not found"}`);
  }

  const plan = dockerValidationPlan({
    image,
    provider,
    commands: requiredCommands,
    env: envAllowlist,
    volumes,
    network,
  });

  let execution;
  try {
    execution = await runCommand(dockerReadiness.command || "docker", plan.args);
  } catch (error) {
    throw new Error(
      [
        "Docker image validation failed.",
        `Image: ${plan.image}`,
        `Command: ${plan.rendered_command}`,
        error.stdout ? `stdout: ${error.stdout}` : "",
        error.stderr ? `stderr: ${error.stderr}` : "",
        error.message && !error.stderr ? error.message : "",
      ].filter(Boolean).join("\n"),
    );
  }

  const lines = [
    "# Docker Image Validation",
    "",
    `Image: ${plan.image}`,
    `Provider: ${plan.provider || "none"}`,
    `Network: ${plan.network}`,
    `Required commands: ${plan.requiredCommands.join(", ") || "none"}`,
    `Env allowlist: ${plan.envAllowlist.join(", ") || "none"}`,
    `Extra volumes: ${plan.extraVolumes.join(", ") || "none"}`,
    `Docker command: ${plan.rendered_command}`,
    `Status: passed`,
  ];

  if (execution.stdout) {
    lines.push("", "## Probe stdout", "", execution.stdout.trim());
  }
  if (execution.stderr) {
    lines.push("", "## Probe stderr", "", execution.stderr.trim());
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

function normalizeAbsolutePath(targetPath) {
  return path.resolve(path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath));
}

function assertInsideWorktreeRoot(targetPath, worktreeRoot) {
  const relative = path.relative(worktreeRoot, targetPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clean path outside .worktrees: ${targetPath}`);
  }
}

async function collectWorktreeReferences(worktreeRoot) {
  const references = new Map();
  const addReference = (worktreePath, label) => {
    if (!worktreePath) {
      return;
    }

    const resolved = normalizeAbsolutePath(worktreePath);
    const relative = path.relative(worktreeRoot, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return;
    }

    const existing = references.get(resolved) || [];
    references.set(resolved, [...existing, label]);
  };

  for (const { artifact } of await listDispatchArtifacts()) {
    addReference(artifact.worktree_path, `dispatch:${artifact.dispatch_id || artifact.issue_id || "unknown"}`);
  }

  for (const { metadata } of await listProviderRunMetadata()) {
    addReference(metadata.execution?.worktree_path, `provider-run:${metadata.run_id || metadata.dispatch_id || "unknown"}`);
  }

  return references;
}

async function planWorktreeCleanup({ maxAgeHours = 168 } = {}) {
  const worktreeRoot = path.join(cwd, ".worktrees");
  if (!(await pathExists(worktreeRoot))) {
    return {
      worktreeRoot,
      entries: [],
    };
  }

  const references = await collectWorktreeReferences(worktreeRoot);
  const dirEntries = await readdir(worktreeRoot, { withFileTypes: true });
  const now = Date.now();
  const entries = [];

  for (const entry of dirEntries.filter((value) => value.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = path.join(worktreeRoot, entry.name);
    assertInsideWorktreeRoot(fullPath, worktreeRoot);
    const info = await stat(fullPath);
    const ageHours = (now - info.mtime.getTime()) / (1000 * 60 * 60);
    const referencedBy = references.get(path.resolve(fullPath)) || [];
    const eligible = referencedBy.length === 0 && ageHours >= maxAgeHours;
    entries.push({
      path: fullPath,
      ageHours,
      referencedBy,
      action: referencedBy.length > 0 ? "keep-referenced" : eligible ? "delete" : "keep-young",
    });
  }

  return {
    worktreeRoot,
    entries,
  };
}

async function worktreeClean(args) {
  const apply = args.includes("--apply");
  const maxAgeValue = Number.parseFloat(readOption(args, "max-age-hours", "168"));
  const maxAgeHours = Number.isFinite(maxAgeValue) && maxAgeValue >= 0 ? maxAgeValue : 168;
  const plan = await planWorktreeCleanup({ maxAgeHours });
  const deleteEntries = plan.entries.filter((entry) => entry.action === "delete");

  if (apply) {
    for (const entry of deleteEntries) {
      assertInsideWorktreeRoot(entry.path, plan.worktreeRoot);
      await rm(entry.path, { recursive: true, force: true });
    }
  }

  const lines = [
    "# Worktree Cleanup",
    "",
    `Root: ${plan.worktreeRoot}`,
    `Mode: ${apply ? "apply" : "dry-run"}`,
    `Retention: unreferenced worktrees at least ${maxAgeHours} hours old`,
    `Deleted: ${apply ? deleteEntries.length : 0}`,
    "",
    "Policy:",
    "- Only directories directly under `.worktrees` are considered.",
    "- Dispatch artifacts and Provider Run metadata are treated as active references.",
    "- Referenced worktrees are never removed by this command.",
    "- Deletion requires `--apply`.",
    "",
    "Entries:",
  ];

  if (plan.entries.length === 0) {
    lines.push("- None");
  } else {
    for (const entry of plan.entries) {
      lines.push(
        `- ${entry.action}: ${entry.path} (${entry.ageHours.toFixed(2)}h old${
          entry.referencedBy.length > 0 ? `; referenced by ${entry.referencedBy.join(", ")}` : ""
        })`,
      );
    }
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

async function runDispatch(args) {
  const prepareWorktree = args.includes("--prepare-worktree");
  const prepareDocker = args.includes("--prepare-docker");
  const execute = args.includes("--execute");
  const executeDocker = args.includes("--execute-docker");
  const insideDocker = args.includes("--inside-docker");
  const liveProvider = args.includes("--live-provider");
  const detach = args.includes("--detach");
  const stubResult = readOption(args, "stub-result", "success");
  const selectedProvider = readOption(args, "provider", "codex");
  const providerTimeoutMs = Number.parseInt(readOption(args, "provider-timeout-ms", "45000"), 10);
  const { fullPath, artifact: resolvedArtifact } = await resolveDispatchArtifact(args, { command: "run", status: "claimed" });
  const artifact = {
    ...resolvedArtifact,
    dispatch_path: fullPath,
  };

  const runValidationErrors = validateClaimedDispatchForRun(artifact);
  if (runValidationErrors.length > 0) {
    throw new Error(runValidationErrors[0]);
  }

  if (prepareWorktree) {
    if (artifact.isolation_mode !== "worktree") {
      throw new Error("run -- --prepare-worktree requires a worktree-isolated dispatch.");
    }

    await mkdir(artifact.worktree_path, { recursive: true });
  }

  let dockerReadiness = null;
  const dockerPlan = artifact.isolation_mode === "docker" ? dockerRunPlanForDispatch(artifact, { provider: selectedProvider, liveProvider }) : null;

  if (prepareDocker) {
    if (artifact.isolation_mode !== "docker") {
      throw new Error("run -- --prepare-docker requires a docker-isolated dispatch.");
    }

    await ensureWorktreePath(artifact.worktree_path);
    dockerReadiness = await commandAvailable("docker");
  }

  let executionSummary = "";
  if (execute) {
    if (detach && !liveProvider) {
      throw new Error("run -- --execute --detach currently requires --live-provider.");
    }
    const provider = selectedProvider;
    const providerAdapter = getProvider(provider, { commandAvailable, cwd });
    const runId = createProviderRunId(artifact.dispatch_id, nowIso());
    const providerRunDir = path.join(cwd, ".ai", "provider-runs");
    const loopSpecPath = deriveLoopSpecPath({
      cwd,
      dispatchId: artifact.dispatch_id,
      loopSpecPath: artifact.loop_spec_target,
    });
    const bundlePath = path.join(providerRunDir, `${runId}-bundle.json`);
    const metadataPath = path.join(providerRunDir, `${runId}.json`);
    const lastMessagePath = path.join(providerRunDir, `${runId}-last-message.txt`);
    const stdoutLogPath = path.join(providerRunDir, `${runId}.stdout.log`);
    const stderrLogPath = path.join(providerRunDir, `${runId}.stderr.log`);
    await mkdir(providerRunDir, { recursive: true });
    await mkdir(path.dirname(loopSpecPath), { recursive: true });
    let handoffMarkdown = "";
    if (artifact.handoff_artifact && (await pathExists(artifact.handoff_artifact))) {
      handoffMarkdown = await readFile(artifact.handoff_artifact, "utf8");
    }
    const loopSpec = buildLoopSpec({
      dispatch: artifact,
      handoffMarkdown,
    });
    const bundle = buildProviderRunBundle({
      dispatch: artifact,
      loopSpec,
      provider,
      loopSpecPath,
    });
    let result;
    let providerRunStatus;
    let adapterMode;
    let commandStdout = "";
    let commandStderr = "";
    let runtimeState = {
      stop_condition: "",
      escalation_reason: "",
      isolation_prepared: !["worktree", "docker"].includes(artifact.isolation_mode),
      log_paths: {
        stdout: stdoutLogPath,
        stderr: stderrLogPath,
      },
      ...(dockerPlan ? { docker: dockerPlan } : {}),
    };

    if (artifact.isolation_mode === "worktree" && artifact.worktree_path) {
      await ensureWorktreePath(artifact.worktree_path);
      runtimeState.isolation_prepared = true;
    }

    if (artifact.isolation_mode === "docker" && artifact.worktree_path && (await pathExists(artifact.worktree_path))) {
      runtimeState.isolation_prepared = true;
    }

    if (!artifact.handoff_artifact || !(await pathExists(artifact.handoff_artifact))) {
      const blocked = buildRuntimeBlockedResult({
        bundle,
        verificationCommand: "pnpm ops run -- --dispatch <dispatch> --execute",
        summary: "Execution stopped before provider launch because the required handoff artifact was missing.",
        gap: `Missing handoff artifact: ${artifact.handoff_artifact || "unset"}`,
        stopCondition: "required context artifact missing",
        escalationReason: "Restore the handoff artifact or regenerate the Context Handoff before retrying execution.",
      });
      result = blocked.result;
      providerRunStatus = blocked.providerRunStatus;
      adapterMode = liveProvider ? "live" : "stub";
      runtimeState = {
        ...runtimeState,
        ...blocked.runtime,
      };
    } else if (artifact.isolation_mode === "worktree" && !runtimeState.isolation_prepared) {
      const blocked = buildRuntimeBlockedResult({
        bundle,
        verificationCommand: "pnpm ops run -- --dispatch <dispatch> --execute",
        summary: "Execution stopped before provider launch because the worktree isolation path could not be prepared.",
        gap: `Worktree path not prepared: ${artifact.worktree_path || "unset"}`,
        stopCondition: "owned file boundary exceeded",
        escalationReason: "Prepare or repair the worktree path before retrying execution.",
      });
      result = blocked.result;
      providerRunStatus = blocked.providerRunStatus;
      adapterMode = liveProvider ? "live" : "stub";
      runtimeState = {
        ...runtimeState,
        ...blocked.runtime,
      };
    } else if (artifact.isolation_mode === "docker" && !insideDocker) {
      dockerReadiness = dockerReadiness || await commandAvailable("docker");
      if (!executeDocker) {
        const blocked = buildRuntimeBlockedResult({
          bundle,
          verificationCommand: "pnpm ops run -- --dispatch <dispatch> --prepare-docker",
          summary: "Execution stopped before provider launch because Docker container execution requires explicit `--execute-docker` approval.",
          gap: "Docker isolation has a prepared container command, but host-side execution was not approved for this run.",
          stopCondition: "containerized execution requires explicit approval",
          escalationReason: "Run `pnpm ops run -- --dispatch <dispatch> --prepare-docker`, inspect the Docker command, then rerun with `--execute --execute-docker` when the container boundary is acceptable.",
        });
        result = blocked.result;
        providerRunStatus = blocked.providerRunStatus;
        adapterMode = liveProvider ? "live" : "stub";
        runtimeState = {
          ...runtimeState,
          ...blocked.runtime,
          docker: {
            ...dockerPlan,
            available: Boolean(dockerReadiness?.available),
          },
        };
      } else if (!dockerReadiness?.available) {
        const blocked = buildRuntimeBlockedResult({
          bundle,
          verificationCommand: "pnpm ops run -- --dispatch <dispatch> --execute --execute-docker",
          summary: "Execution stopped before Docker launch because the Docker CLI was unavailable.",
          gap: dockerReadiness?.stderr || "Docker CLI was not found.",
          stopCondition: "container runtime unavailable",
          escalationReason: "Install or start Docker, then rerun with `--execute --execute-docker`.",
        });
        result = blocked.result;
        providerRunStatus = blocked.providerRunStatus;
        adapterMode = "docker";
        runtimeState = {
          ...runtimeState,
          ...blocked.runtime,
          docker: {
            ...dockerPlan,
            available: false,
          },
        };
      } else {
        adapterMode = liveProvider ? "docker-live" : "docker-stub";
        try {
          await ensureWorktreePath(artifact.worktree_path);
          const dockerResult = await runCommand(dockerReadiness.command || dockerPlan.command, dockerPlan.args, {
            cwd,
            maxBuffer: 1024 * 1024 * 10,
          });
          commandStdout = dockerResult.stdout || "";
          commandStderr = dockerResult.stderr || "";
          result = {
            status: "success",
            summary: `Docker container execution launched through ${dockerPlan.image}. The inner provider run executed inside the declared container boundary.`,
            changedAreas: ["docs/agents/completions", ".ai/provider-runs"],
            verificationCommands: ["pnpm ops run -- --dispatch <dispatch> --execute --execute-docker"],
            verificationResults: ["Docker command completed successfully."],
            risks: [],
            gaps: [],
            followUps: ["Inspect the inner Provider Run artifacts emitted by the containerized run."],
            artifactsUpdated: ["Provider Run metadata", "Completion Report"],
          };
          providerRunStatus = "succeeded";
          runtimeState = {
            ...runtimeState,
            isolation_prepared: true,
            stop_condition: "Docker command completed successfully.",
            escalation_reason: "",
            docker: {
              ...dockerPlan,
              available: true,
              executed: true,
              exit_code: 0,
            },
          };
        } catch (error) {
          commandStdout = `${error.stdout || ""}`;
          commandStderr = `${error.stderr || error.message || ""}`;
          const blocked = buildRuntimeBlockedResult({
            bundle,
            verificationCommand: "pnpm ops run -- --dispatch <dispatch> --execute --execute-docker",
            summary: "Docker container execution failed before a successful provider result was recorded.",
            gap: commandStderr || "Docker command failed.",
            stopCondition: "container runtime failed",
            escalationReason: "Inspect Docker stdout/stderr in the Provider Run metadata, then repair the container command or image.",
          });
          result = blocked.result;
          providerRunStatus = blocked.providerRunStatus;
          runtimeState = {
            ...runtimeState,
            ...blocked.runtime,
            docker: {
              ...dockerPlan,
              available: true,
              executed: true,
              exit_code: error.code ?? 1,
            },
          };
        }
      }
    } else if ((bundle.execution.stop_conditions || []).length === 0 || (bundle.execution.escalation_rules || []).length === 0) {
      const blocked = buildRuntimeBlockedResult({
        bundle,
        verificationCommand: "pnpm ops run -- --dispatch <dispatch> --execute",
        summary: "Execution stopped before provider launch because the Loop Spec was missing enforced stop or escalation rules.",
        gap: "Loop Spec execution contract was incomplete.",
        stopCondition: "required context artifact missing",
        escalationReason: "Regenerate the Loop Spec so execution stop and escalation rules are explicit before retrying.",
      });
      result = blocked.result;
      providerRunStatus = blocked.providerRunStatus;
      adapterMode = liveProvider ? "live" : "stub";
      runtimeState = {
        ...runtimeState,
        ...blocked.runtime,
      };
    }

    if (!result && liveProvider) {
      if (detach) {
        const readiness = await providerAdapter.isAvailable({ requireLogin: true });
        if (!readiness.available) {
          throw new Error(`${provider} CLI is required for run -- --execute --live-provider --detach.`);
        }
        if (!readiness.ready) {
          throw new Error(`${provider} login is required for run -- --execute --live-provider --detach.`);
        }

        const workerArgs = [
          path.join(scriptDir, "provider-run-worker.mjs"),
          "--metadata",
          metadataPath,
          "--provider-timeout-ms",
          String(Number.isFinite(providerTimeoutMs) ? providerTimeoutMs : 45000),
        ];

        const worker = spawn(process.execPath, workerArgs, {
          cwd,
          detached: true,
          stdio: "ignore",
          windowsHide: true,
          env: process.env,
        });
        worker.unref();

        const providerRun = {
          run_id: runId,
          provider,
          adapter_mode: "live-detached",
          dispatch_id: artifact.dispatch_id,
          issue_id: artifact.issue_id,
          status: "running",
          started_at: nowIso(),
          completed_at: "",
          handoff_artifact: artifact.handoff_artifact,
          loop_spec_path: loopSpecPath,
          bundle_path: bundlePath,
          last_message_path: lastMessagePath,
          stdout_log_path: stdoutLogPath,
          stderr_log_path: stderrLogPath,
          completion_report_target: artifact.completion_report_target,
          claim: artifact.claim,
          execution: bundle.execution,
          runtime: runtimeState,
          worker: {
            pid: worker.pid,
            command: process.execPath,
            args: workerArgs,
          },
          result: {
            summary: `Detached ${provider} execution launched.`,
            follow_ups: ["Use `pnpm ops run-status` to inspect or finalize the run outcome."],
            gaps: [],
          },
        };

        await writeFile(loopSpecPath, `${JSON.stringify(loopSpec, null, 2)}\n`, "utf8");
        await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
        await writeFile(metadataPath, `${JSON.stringify(providerRun, null, 2)}\n`, "utf8");

        const lines = [
          "# Runner Plan",
          "",
          `Dispatch: ${artifact.dispatch_id}`,
          `Claimed by: ${artifact.claim.claimed_by}`,
          `Claimed at: ${artifact.claim.claimed_at}`,
          `Isolation mode: ${artifact.claim.isolation_mode}`,
          `Expected branch: ${artifact.expected_branch || "TBD"}`,
          `Worktree path: ${artifact.worktree_path || "N/A"}`,
          `Worktree prepared: ${prepareWorktree ? "yes" : "no"}`,
          `Handoff artifact: ${artifact.handoff_artifact || "TBD"}`,
          `Loop Spec: ${loopSpecPath}`,
          `Completion report target: ${artifact.completion_report_target || "TBD"}`,
          "",
          "Forbidden actions:",
          ...artifact.forbidden_actions.map((action) => `- ${action}`),
          "",
          `Detached live ${provider} execution launched. Use \`pnpm ops run-status\` to inspect completion.`,
          "",
          "Execution result:",
          `- Provider: ${provider} (live-detached)`,
          `- Provider Run ID: ${runId}`,
          "- Provider Run status: running",
          `- Run bundle: ${bundlePath}`,
          `- Provider Run metadata: ${metadataPath}`,
          `- Detached worker PID: ${worker.pid}`,
        ];
        process.stdout.write(`${lines.join("\n")}\n`);
        return;
      } else {
        const readiness = await providerAdapter.isAvailable({ requireLogin: true });
        if (!readiness.available) {
          throw new Error(`${provider} CLI is required for run -- --execute --live-provider.`);
        }
        if (!readiness.ready) {
          throw new Error(`${provider} login is required for run -- --execute --live-provider.`);
        }

        const promptBundle = providerAdapter.renderPromptBundle({
          loopSpec,
          bundle,
        });

        try {
          const launchResult = await providerAdapter.launchLoop({
            promptBundle,
            outputLastMessagePath: lastMessagePath,
            runDir: artifact.worktree_path || cwd,
            providerRunDir,
            timeoutMs: Number.isFinite(providerTimeoutMs) ? providerTimeoutMs : 45000,
          });
          const finalMessage = await readFile(lastMessagePath, "utf8");
          const collected = providerAdapter.collectArtifacts({
            bundle,
            handoffArtifact: artifact.handoff_artifact,
            verificationCommand: "pnpm ops run -- --dispatch <dispatch> --execute --live-provider",
            timeoutMs: Number.isFinite(providerTimeoutMs) ? providerTimeoutMs : 45000,
            finalMessage,
            commandStdout: launchResult.stdout || "",
            commandStderr: launchResult.stderr || "",
          });
          result = collected.result;
          providerRunStatus = collected.providerRunStatus;
          adapterMode = "live";
          commandStdout = collected.commandStdout || "";
          commandStderr = collected.commandStderr || "";
          runtimeState.stop_condition = providerRunStatus === "blocked"
            ? "The provider reports a blocked, cancelled, or timed-out result."
            : "Acceptance criteria are satisfied and verification is complete.";
          runtimeState.escalation_reason = providerRunStatus === "blocked"
            ? (result.followUps?.[0] || "Inspect provider output before retrying.")
            : "";
        } catch (error) {
          const finalMessage = (await pathExists(lastMessagePath)) ? await readFile(lastMessagePath, "utf8") : "";
          const collected = providerAdapter.collectArtifacts({
            bundle,
            handoffArtifact: artifact.handoff_artifact,
            verificationCommand: "pnpm ops run -- --dispatch <dispatch> --execute --live-provider",
            timeoutMs: Number.isFinite(providerTimeoutMs) ? providerTimeoutMs : 45000,
            finalMessage,
            commandStdout: `${error.stdout || ""}`,
            error,
          });
          result = collected.result;
          providerRunStatus = collected.providerRunStatus;
          adapterMode = "live";
          commandStdout = collected.commandStdout || "";
          commandStderr = collected.commandStderr || "";
          runtimeState.stop_condition = "The provider reports a blocked, cancelled, or timed-out result.";
          runtimeState.escalation_reason = result.followUps?.[0] || "Inspect provider output before retrying.";
        }
      }
    } else if (!result) {
      result = executeCodexStub({
        bundle,
        stubResult,
      });
      providerRunStatus = result.status === "blocked" ? "blocked" : "succeeded";
      adapterMode = "stub";
      runtimeState.stop_condition = providerRunStatus === "blocked"
        ? "The provider reports a blocked, cancelled, or timed-out result."
        : "Acceptance criteria are satisfied and verification is complete.";
      runtimeState.escalation_reason = providerRunStatus === "blocked" ? (result.followUps?.[0] || "Inspect blocked result.") : "";
    }
    const providerRun = {
      run_id: runId,
      provider,
      adapter_mode: adapterMode,
      dispatch_id: artifact.dispatch_id,
      issue_id: artifact.issue_id,
      status: providerRunStatus,
      started_at: nowIso(),
      completed_at: nowIso(),
      handoff_artifact: artifact.handoff_artifact,
      loop_spec_path: loopSpecPath,
      bundle_path: bundlePath,
      last_message_path: liveProvider ? lastMessagePath : "",
      stdout_log_path: stdoutLogPath,
      stderr_log_path: stderrLogPath,
      completion_report_target: artifact.completion_report_target,
      claim: artifact.claim,
      execution: bundle.execution,
      runtime: runtimeState,
      command_output: (liveProvider || String(adapterMode || "").startsWith("docker"))
        ? {
            stdout: commandStdout,
            stderr: commandStderr,
          }
        : undefined,
      result: {
        summary: result.summary,
        follow_ups: result.followUps,
        gaps: result.gaps,
      },
    };

    await mkdir(path.dirname(artifact.completion_report_target), { recursive: true });
    await writeFile(loopSpecPath, `${JSON.stringify(loopSpec, null, 2)}\n`, "utf8");
    await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
    await writeFile(stdoutLogPath, commandStdout, "utf8");
    await writeFile(stderrLogPath, commandStderr, "utf8");
    await writeFile(metadataPath, `${JSON.stringify(providerRun, null, 2)}\n`, "utf8");

    const completionReport = renderExecutionCompletionReport({
      dispatch: artifact,
      providerRun,
      result,
      loopSpecPath,
      bundlePath,
      metadataPath,
    });
    await writeFile(artifact.completion_report_target, completionReport, "utf8");

    executionSummary = [
      "",
      "Execution result:",
      `- Provider: ${provider} (${adapterMode})`,
      `- Provider Run ID: ${runId}`,
      `- Provider Run status: ${providerRun.status}`,
      `- Loop Spec: ${loopSpecPath}`,
      `- Run bundle: ${bundlePath}`,
      `- Provider Run metadata: ${metadataPath}`,
      liveProvider ? `- ${provider} final message: ${lastMessagePath}` : "",
      `- Completion report written: ${artifact.completion_report_target}`,
    ].filter(Boolean).join("\n");
  }

  const lines = [
    "# Runner Plan",
    "",
    `Dispatch: ${artifact.dispatch_id}`,
    `Claimed by: ${artifact.claim.claimed_by}`,
    `Claimed at: ${artifact.claim.claimed_at}`,
    `Isolation mode: ${artifact.claim.isolation_mode}`,
    `Expected branch: ${artifact.expected_branch || "TBD"}`,
    `Worktree path: ${artifact.worktree_path || "N/A"}`,
    `Worktree prepared: ${prepareWorktree ? "yes" : "no"}`,
    ...(dockerPlan
      ? [
          `Docker image: ${dockerPlan.image}`,
          `Docker workspace: ${dockerPlan.workspace}`,
          `Docker network: ${dockerPlan.network}`,
          `Docker container: ${dockerPlan.container_name}`,
          `Docker env allowlist: ${dockerPlan.env.length > 0 ? dockerPlan.env.join(", ") : "none"}`,
          `Docker extra volumes: ${dockerPlan.volumes.length > 0 ? dockerPlan.volumes.join(", ") : "none"}`,
          `Docker available: ${dockerReadiness ? (dockerReadiness.available ? "yes" : "no") : "not checked"}`,
          `Docker command: ${dockerPlan.rendered_command}`,
        ]
      : []),
    `Handoff artifact: ${artifact.handoff_artifact || "TBD"}`,
    `Completion report target: ${artifact.completion_report_target || "TBD"}`,
    "",
    "Forbidden actions:",
    ...artifact.forbidden_actions.map((action) => `- ${action}`),
    "",
    prepareDocker
      ? "No provider was invoked. Docker isolation plan was prepared and not executed."
      : prepareWorktree
      ? "No provider was invoked. Worktree directory was prepared locally. No code was changed."
      : execute
        ? detach
          ? `Detached live ${selectedProvider} execution launched. Use \`pnpm ops run-status\` to inspect completion.`
          : liveProvider
          ? `Provider execution completed through the live ${selectedProvider} boundary. Review the Provider Run metadata and completion artifact.`
          : "Provider execution completed through the stub boundary. No live provider was invoked and no code was changed."
        : "No provider was invoked. No worktree was created. No code was changed.",
    executionSummary,
  ];

  process.stdout.write(`${lines.join("\n")}\n`);
}

function resolveProviderRunPath(run) {
  return path.isAbsolute(run) ? run : path.join(cwd, run.includes(".json") ? run : path.join(".ai", "provider-runs", `${run}.json`));
}

async function runStatus(args) {
  const run = readOption(args, "run");
  if (!run) {
    throw new Error("run-status requires --run.");
  }

  const providerRunPath = resolveProviderRunPath(run);
  if (!(await pathExists(providerRunPath))) {
    throw new Error(`Provider Run not found: ${run}`);
  }

  const metadata = JSON.parse(await readFile(providerRunPath, "utf8"));
  let processAlive = "unknown";
  const pid = metadata.worker?.pid;
  if (typeof pid === "number" && metadata.status === "running") {
    try {
      process.kill(pid, 0);
      processAlive = "yes";
    } catch {
      processAlive = "no";
    }
  }
  const lifecycle = providerRunLifecycle(metadata.status);

  const lines = [
    "# Provider Run Status",
    "",
    `Run ID: ${metadata.run_id}`,
    `Status: ${metadata.status}`,
    `Lifecycle: ${lifecycle}`,
    `Provider: ${metadata.provider}`,
    `Adapter mode: ${metadata.adapter_mode}`,
    `Started at: ${metadata.started_at || "N/A"}`,
    `Completed at: ${metadata.completed_at || "N/A"}`,
    `Dispatch: ${metadata.dispatch_id}`,
    `Issue: ${metadata.issue_id}`,
    `Metadata: ${providerRunPath}`,
    `Loop Spec: ${metadata.loop_spec_path || "N/A"}`,
    `Bundle: ${metadata.bundle_path || "N/A"}`,
    `Stdout log: ${metadata.stdout_log_path || metadata.runtime?.log_paths?.stdout || "N/A"}`,
    `Stderr log: ${metadata.stderr_log_path || metadata.runtime?.log_paths?.stderr || "N/A"}`,
    `Completion report: ${metadata.completion_report_target || "N/A"}`,
    `Last message: ${metadata.last_message_path || "N/A"}`,
    `Worker PID: ${pid || "N/A"}`,
    `Process alive: ${processAlive}`,
  ];

  if (metadata.result?.summary) {
    lines.push(`Summary: ${metadata.result.summary}`);
  }
  if (Array.isArray(metadata.result?.follow_ups) && metadata.result.follow_ups.length > 0) {
    lines.push(`Follow-ups: ${metadata.result.follow_ups.join(" | ")}`);
  }
  if (Array.isArray(metadata.result?.gaps) && metadata.result.gaps.length > 0) {
    lines.push(`Gaps: ${metadata.result.gaps.join(" | ")}`);
  }
  if (metadata.runtime?.stop_condition) {
    lines.push(`Stop condition: ${metadata.runtime.stop_condition}`);
  }
  if (metadata.runtime?.escalation_reason) {
    lines.push(`Escalation reason: ${metadata.runtime.escalation_reason}`);
  }
  if (metadata.cancelled) {
    lines.push(`Cancelled by: ${metadata.cancelled.approved_by || "N/A"}`);
    lines.push(`Cancelled at: ${metadata.cancelled.cancelled_at || "N/A"}`);
    lines.push(`Cancellation reason: ${metadata.cancelled.reason || "N/A"}`);
    lines.push(`Kill result: ${metadata.cancelled.worker_kill_result || "N/A"}`);
  }

  lines.push("");
  lines.push("Next action:");
  if (metadata.status === "running") {
    lines.push(`- Keep polling with: pnpm ops run-status -- --run "${providerRunPath}"`);
    lines.push(`- Cancel if needed with: pnpm ops run-cancel -- --run "${providerRunPath}" --approved-by <operator> --reason "<reason>"`);
  } else if (metadata.status === "cancelled") {
    lines.push("- Review the cancellation outcome and decide whether to reclaim or re-dispatch the slice.");
  } else if (metadata.status === "blocked") {
    lines.push("- Inspect the completion report and Provider Run metadata, then narrow or retry the slice.");
  } else if (metadata.status === "succeeded") {
    lines.push("- Review the completion artifact and advance to review-prep or QA.");
  } else {
    lines.push("- Inspect the Provider Run metadata before proceeding.");
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

async function runMirror(args) {
  const run = readOption(args, "run");
  const issue = readOption(args, "issue");
  const apply = args.includes("--apply");
  const updateExisting = args.includes("--update-existing");

  if (!run) {
    throw new Error("run-mirror requires --run.");
  }

  const providerRunPath = resolveProviderRunPath(run);
  if (!(await pathExists(providerRunPath))) {
    throw new Error(`Provider Run not found: ${run}`);
  }

  const metadata = JSON.parse(await readFile(providerRunPath, "utf8"));
  const issueRef = normalizeIssueRef(issue || metadata.issue_id);
  if (!issueRef) {
    throw new Error("run-mirror requires --issue or a provider run with issue_id.");
  }

  const comment = renderProviderRunMirrorComment({ metadata, issueRef, providerRunPath });
  const plan = [
    "# Provider Run Mirror",
    "",
    `Mode: ${apply ? "apply" : "dry-run"}`,
    `Run: ${providerRunPath}`,
    `Target: ${comment.target}`,
    `Mirror marker: ${comment.marker}`,
    `Existing comment behavior: ${updateExisting ? "update matching provider-run comment when present" : "post a new comment"}`,
    "",
    "## Comment Body",
    "",
    comment.body,
    "",
  ].join("\n");
  process.stdout.write(plan);

  if (!apply) {
    return;
  }

  const ghVersion = await commandAvailable("gh");
  if (!ghVersion.available) {
    throw new Error("gh CLI is required for run-mirror -- --apply. Install it from https://cli.github.com/.");
  }

  const auth = await commandAvailable("gh", ["auth", "status"]);
  if (!auth.available) {
    throw new Error("GitHub authentication is required for run-mirror -- --apply. Run `gh auth login` first.");
  }

  if (updateExisting) {
    const existing = findMirroredComment(await listGitHubComments({ issue: issueRef }), comment.marker);
    if (existing) {
      await updateGitHubIssueComment(existing.id, comment.body);
      process.stdout.write(`GitHub provider-run mirror comment updated: ${existing.url || existing.id}.\n`);
      return;
    }
  }

  await withTemporaryGhBody(comment.body, (bodyPath) =>
    runGh(["issue", "comment", issueRef, "--body-file", bodyPath]));
  process.stdout.write(`GitHub comment posted to issue #${issueRef}.\n`);
}

async function runCancel(args) {
  const run = readOption(args, "run");
  const approvedBy = readOption(args, "approved-by");
  const reason = readOption(args, "reason");

  if (!run) {
    throw new Error("run-cancel requires --run.");
  }
  if (!approvedBy) {
    throw new Error("run-cancel requires --approved-by.");
  }
  if (!reason) {
    throw new Error("run-cancel requires --reason.");
  }

  const providerRunPath = resolveProviderRunPath(run);
  if (!(await pathExists(providerRunPath))) {
    throw new Error(`Provider Run not found: ${run}`);
  }

  const metadata = JSON.parse(await readFile(providerRunPath, "utf8"));
  if (metadata.status !== "running") {
    throw new Error(`Provider Run ${metadata.run_id} is ${metadata.status}, not running.`);
  }

  const pid = metadata.worker?.pid;
  let cancellation = "not-attempted";
  if (typeof pid === "number") {
    try {
      await killProcessTree(pid);
      cancellation = "killed";
    } catch (error) {
      const details = `${error.stderr || error.message || error}`.toLowerCase();
      if (details.includes("not found") || details.includes("no running instance") || details.includes("cannot find the process")) {
        cancellation = "already-exited";
      } else {
        throw error;
      }
    }
  }

  metadata.status = "cancelled";
  metadata.completed_at = nowIso();
  metadata.cancelled = {
    approved_by: approvedBy,
    reason,
    cancelled_at: metadata.completed_at,
    worker_pid: pid || null,
    worker_kill_result: cancellation,
  };
  metadata.result = {
    summary: `Provider Run cancelled by ${approvedBy}.`,
    follow_ups: ["Review the completion artifact and decide whether to reclaim or re-dispatch the slice."],
    gaps: [`Cancellation reason: ${reason}`],
  };

  await writeFile(providerRunPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  const bundle = metadata.bundle_path && (await pathExists(metadata.bundle_path))
    ? JSON.parse(await readFile(metadata.bundle_path, "utf8"))
    : {
        dispatch_id: metadata.dispatch_id,
        issue_id: metadata.issue_id,
        title: "",
      };

  const completionReport = renderExecutionCompletionReport({
    dispatch: {
      dispatch_id: metadata.dispatch_id,
      issue_id: metadata.issue_id,
      handoff_artifact: metadata.handoff_artifact,
      completion_report_target: metadata.completion_report_target,
      title: bundle.title,
    },
    providerRun: metadata,
    result: {
      status: "cancelled",
      summary: `Provider Run was cancelled by ${approvedBy}. ${reason}`,
      changedAreas: ["docs/agents/completions", ".ai/provider-runs"],
      verificationCommands: ["pnpm ops run-cancel -- --run <provider-run> --approved-by <operator> --reason \"<reason>\""],
      verificationResults: [
        `Loaded running Provider Run ${metadata.run_id}.`,
        typeof pid === "number"
          ? `Cancellation attempted against worker PID ${pid} (${cancellation}).`
          : "No worker PID was recorded; metadata was marked cancelled only.",
        "Persisted cancelled Provider Run metadata and rewrote the Completion Report.",
      ],
      gaps: [`Cancellation reason: ${reason}`],
      risks: ["The underlying provider process may require manual inspection if it did not terminate cleanly."],
      followUps: ["Re-dispatch the slice or reclaim the parent workflow state after review."],
      artifactsUpdated: ["Provider Run metadata", "Completion Report"],
    },
    loopSpecPath: metadata.loop_spec_path || "",
    bundlePath: metadata.bundle_path || "N/A",
    metadataPath: providerRunPath,
  });

  await mkdir(path.dirname(metadata.completion_report_target), { recursive: true });
  await writeFile(metadata.completion_report_target, completionReport, "utf8");

  process.stdout.write(`${providerRunPath}\n`);
  process.stdout.write(`Cancelled ${metadata.run_id} by ${approvedBy}.\n`);
}

async function workflowConsoleCommand(args) {
  const portValue = Number.parseInt(readOption(args, "port", "4173"), 10);
  const host = readOption(args, "host", "127.0.0.1");
  const { port } = await startWorkflowConsole({
    cwd,
    port: Number.isFinite(portValue) ? portValue : 4173,
    host,
  });
  process.stdout.write(`Workflow console running at http://${host}:${port}\n`);
}

async function main() {
  const [command = "help", ...rest] = process.argv.slice(2);
  const args = argsWithoutSeparator(rest);

  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(help);
    return;
  }

  if (command === "init") {
    await ensureInitStructure();
    return;
  }

  if (command === "setup") {
    await setupPlane(args);
    return;
  }

  if (command === "context") {
    await contextCommand(args);
    return;
  }

  if (command === "context-approve") {
    await contextApproveCommand(args);
    return;
  }

  if (command === "prd") {
    await runNodeScript("prd.mjs", args);
    return;
  }

  if (command === "prd-approve") {
    await prdApproveCommand(args);
    return;
  }

  if (command === "issues") {
    await runNodeScript("issues.mjs", args);
    return;
  }

  if (command === "qa") {
    await runNodeScript("qa.mjs", args);
    return;
  }

  if (command === "handoff") {
    const issue = readOption(args, "issue");
    const title = readOption(args, "title");
    await writeArtifact("handoff", handoffMarkdown({ issue, title }), args);
    return;
  }

  if (command === "hitl") {
    const issue = readOption(args, "issue");
    const title = readOption(args, "title");
    await writeArtifact("hitl", hitlMarkdown({ issue, title }), args);
    return;
  }

  if (command === "complete") {
    const issue = readOption(args, "issue");
    const status = readOption(args, "status");
    await writeArtifact("completion", completionMarkdown({ issue, status }), args);
    return;
  }

  if (command === "review-prep") {
    const issue = readOption(args, "issue");
    const pr = readOption(args, "pr");
    let completionPath = readOption(args, "completion");
    if (!completionPath && issue) {
      const resolution = await resolveCompletionReportFromIssue(issue);
      if (!resolution.ok) {
        throw new Error(renderCompletionResolutionGuidance(resolution));
      }
      completionPath = resolution.path;
    }
    if (!completionPath) {
      throw new Error(completionRecoveryMessage("docs/agents/completions/<completion-report>.md", issue));
    }
    if (!(await pathExists(completionPath))) {
      throw new Error(completionRecoveryMessage(completionPath, issue));
    }
    const completionMarkdown = completionPath ? await readFile(completionPath, "utf8") : "";
    const reviewPrep = buildReviewPrep({
      issue,
      pr,
      completionReportMarkdown: completionMarkdown,
      acceptanceCriteria: splitOptionList(readOption(args, "acceptance")),
      changedAreas: splitOptionList(readOption(args, "changed-areas")),
      dependencyChanges: splitOptionList(readOption(args, "dependency-changes")),
      localRefactors: splitOptionList(readOption(args, "local-refactors")),
      verificationCommands: splitOptionList(readOption(args, "verification-commands")),
      verificationResults: readOption(args, "verification-results"),
      verificationGaps: readOption(args, "gaps"),
      risks: splitOptionList(readOption(args, "risks")),
      followUps: splitOptionList(readOption(args, "follow-ups")),
    });

    if (!reviewPrep.ok) {
      throw new Error(reviewPrep.messages.join("\n"));
    }

    await writeArtifact("review-prep", reviewPrep.markdown, args);
    return;
  }

  if (command === "review-decision") {
    await reviewDecisionCommand(args);
    return;
  }

  if (command === "qa-decision") {
    await qaDecisionCommand(args);
    return;
  }

  if (command === "memory-propose") {
    const proposal = createMemoryProposal({
      type: readOption(args, "type"),
      title: readOption(args, "title"),
      rationale: readOption(args, "rationale"),
      target_files: splitOptionList(readOption(args, "target-files")),
      suggested_text: readOption(args, "suggested-text"),
      risk: {
        accept_if_accepted: readOption(args, "accept-risk"),
        if_rejected: readOption(args, "reject-risk"),
      },
    });
    const written = await writeMemoryProposalArtifact(cwd, proposal);
    process.stdout.write(`${written.jsonPath}\n${written.markdownPath}\n`);
    return;
  }

  if (command === "memory-decision") {
    await memoryDecisionCommand(args);
    return;
  }

  if (command === "mirror") {
    await mirrorArtifact(args);
    return;
  }

  if (command === "feedback") {
    await feedbackCommand(args);
    return;
  }

  if (command === "board") {
    await printBoard();
    return;
  }

  if (command === "schedule") {
    await schedule(args);
    return;
  }

  if (command === "dispatch") {
    await dispatch(args);
    return;
  }

  if (command === "claim") {
    await claim(args);
    return;
  }

  if (command === "claim-status") {
    await claimStatus(args);
    return;
  }

  if (command === "claim-locks") {
    await claimLocks(args);
    return;
  }

  if (command === "reclaim") {
    await reclaim(args);
    return;
  }

  if (command === "reclaim-expired") {
    await reclaimExpired(args);
    return;
  }

  if (command === "docker:validate") {
    await dockerValidate(args);
    return;
  }

  if (command === "github:init") {
    await gitHubInit(args);
    return;
  }

  if (command === "github:export") {
    await gitHubExport(args);
    return;
  }

  if (command === "ralph") {
    await ralphCommand(args);
    return;
  }

  if (command === "run") {
    await runDispatch(args);
    return;
  }

  if (command === "run-status") {
    await runStatus(args);
    return;
  }

  if (command === "run-cancel") {
    await runCancel(args);
    return;
  }

  if (command === "run-mirror") {
    await runMirror(args);
    return;
  }

  if (command === "worktree-clean") {
    await worktreeClean(args);
    return;
  }

  if (command === "console") {
    await workflowConsoleCommand(args);
    return;
  }

  process.stderr.write(`Unknown command: ${command}\n\n${help}`);
  process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
