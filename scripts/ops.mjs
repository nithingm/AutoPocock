import { execFile } from "node:child_process";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { buildReviewPrep, parseCompletionReport } from "./lib/review-gate.mjs";
import { createGitHubBootstrapReport } from "./lib/github-init.mjs";
import { createMemoryProposal, writeMemoryProposalArtifact } from "./lib/memory-proposals.mjs";
import { buildMirrorComment, renderMirrorPlan } from "./lib/artifact-mirror.mjs";
import { classifyFeedback, renderFeedbackClassification } from "./lib/feedback-classifier.mjs";

const execFileAsync = promisify(execFile);
const cwd = process.cwd();

const help = `agentic-repo-template ops

Usage:
  pnpm ops init
  pnpm ops prd -- --title "Feature Name"
  pnpm ops issues
  pnpm ops handoff -- --issue 123 --title "Implement slice"
  pnpm ops hitl -- --issue 123 --title "Provision API token"
  pnpm ops complete -- --issue 123 --status "needs human review"
  pnpm ops review-prep -- --issue 123 --pr 456
  pnpm ops memory-propose -- --type workflow --title "Update workflow contract"
  pnpm ops mirror -- --artifact docs/agents/handoffs/file.md --issue 123
  pnpm ops feedback -- --issue 123 --pr 456 --finding "QA finding text"
  pnpm ops dispatch -- --issue 123 --title "Implement slice" --source manual --override-reason "Solo Operator approved"
  pnpm ops claim -- --dispatch docs/agents/dispatches/dispatch-id.json --claimed-by runner-name --isolation-mode worktree
  pnpm ops claim-status -- --dispatch docs/agents/dispatches/dispatch-id.json --max-age-hours 24
  pnpm ops reclaim -- --dispatch docs/agents/dispatches/dispatch-id.json --approved-by solo-operator --reason "Runner abandoned work"
  pnpm ops qa -- --issue 123 --pr 456
  pnpm ops qa
  pnpm ops board
  pnpm ops schedule -- --queue .ai/queue.example.json
  pnpm ops github:init
  pnpm ops github:export
  pnpm ops run -- --dispatch docs/agents/dispatches/dispatch-id.json
  pnpm ops run -- --dispatch docs/agents/dispatches/dispatch-id.json --prepare-worktree

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
  const result = await execFileAsync(process.execPath, [path.join(cwd, "scripts", script), ...args], {
    cwd,
    windowsHide: true,
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}

async function runCommand(command, args) {
  return execFileAsync(command, args, {
    cwd,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
}

async function commandAvailable(command, args = ["--version"]) {
  try {
    const result = await runCommand(command, args);
    return { available: true, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  } catch (error) {
    return {
      available: false,
      stdout: `${error.stdout || ""}`.trim(),
      stderr: `${error.stderr || error.message || ""}`.trim(),
    };
  }
}

async function ensureInitStructure() {
  const dirs = [
    "docs/PRDs",
    "docs/QA",
    "docs/adr",
    "docs/agents/handoffs",
    "docs/agents/hitl",
    "docs/agents/completions",
    "docs/agents/reviews",
    "docs/agents/memory-proposals",
    "docs/agents/feedback",
    "docs/agents/schedules",
    "docs/agents/dispatches",
    "issues",
    ".github/ISSUE_TEMPLATE",
    ".ai/prompts",
    ".ai/memory",
    "skills/engineering/agentic-ops",
    "skills/engineering/subagent-handoff",
  ];

  await Promise.all(dirs.map((dir) => mkdir(path.join(cwd, dir), { recursive: true })));
  process.stdout.write("Workflow structure is initialized. No workers or automations were started.\n");
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

function inspectClaimAge(artifact, maxAgeHours = 24, now = new Date()) {
  const claimedAt = artifact?.claim?.claimed_at ? new Date(artifact.claim.claimed_at) : null;
  if (!claimedAt || Number.isNaN(claimedAt.getTime())) {
    return {
      hasClaim: false,
      claimedAt: "",
      ageHours: null,
      stale: false,
      maxAgeHours,
    };
  }

  const ageHours = (now.getTime() - claimedAt.getTime()) / (1000 * 60 * 60);
  return {
    hasClaim: true,
    claimedAt: artifact.claim.claimed_at,
    ageHours,
    stale: ageHours > maxAgeHours,
    maxAgeHours,
  };
}

async function findLatestHandoff(issue) {
  return findLatestFile(path.join("docs", "agents", "handoffs"), issue);
}

async function findLatestFile(dir, needle) {
  const targetDir = path.join(cwd, dir);
  let files = [];

  try {
    files = await readdir(targetDir);
  } catch {
    return "";
  }

  const match = files
    .filter((file) => file.endsWith(".md") && (!needle || file.includes(needle)))
    .sort()
    .reverse()[0];

  return match ? path.join(targetDir, match) : "";
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
  const artifactPath = path.isAbsolute(artifact) ? artifact : path.join(cwd, artifact);
  const markdown = await readFile(artifactPath, "utf8");
  const comment = buildMirrorComment({ artifactPath: artifact, markdown, issue, pr });
  const plan = renderMirrorPlan({ artifactPath: artifact, issue, pr, comment, apply });

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

  if (issue) {
    await runCommand("gh", ["issue", "comment", issue, "--body", comment.body]);
  } else {
    await runCommand("gh", ["pr", "comment", pr, "--body", comment.body]);
  }
}

async function feedbackCommand(args) {
  if (args.includes("--apply")) {
    throw new Error("feedback -- --apply is not implemented. No GitHub issue or comment was created.");
  }

  const result = classifyFeedback({
    issue: readOption(args, "issue"),
    pr: readOption(args, "pr"),
    finding: readOption(args, "finding"),
  });
  const suggestion = result.artifact_suggestion;
  const feedbackDir = path.join(cwd, suggestion.dir);
  const jsonTarget = path.join(cwd, suggestion.json_path);
  const markdownTarget = path.join(cwd, suggestion.markdown_path);

  await mkdir(feedbackDir, { recursive: true });
  await writeFile(jsonTarget, `${JSON.stringify(suggestion.json_payload, null, 2)}\n`, "utf8");
  await writeFile(markdownTarget, suggestion.markdown_payload, "utf8");

  process.stdout.write(renderFeedbackClassification(result));
  process.stdout.write(`\n${jsonTarget}\n${markdownTarget}\n`);
}

async function gitHubInit(args = []) {
  const config = await loadJson(".ai/ops.config.json");
  const templatePath = path.join(cwd, ".github", "ISSUE_TEMPLATE", "agentic-slice.md");
  const apply = args.includes("--apply");
  const ghVersion = await commandAvailable("gh");
  const auth = ghVersion.available ? await commandAvailable("gh", ["auth", "status"]) : null;
  const repoArgs = config.github?.owner && config.github?.repo ? ["--repo", `${config.github.owner}/${config.github.repo}`] : [];
  let existingLabels = [];
  let labelInspectionAvailable = false;

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

  const report = await createGitHubBootstrapReport(config, {
    apply,
    gh: {
      available: ghVersion.available,
      version: ghVersion.stdout.split(/\r?\n/)[0] || "",
      authenticated: Boolean(auth?.available),
      authDetail: auth?.stderr ? auth.stderr.split(/\r?\n/)[0] : "",
    },
    repository: config.github || {},
    existingLabels,
    templatePresent: await pathExists(templatePath),
    runner: async (command, args) => runCommand(command, [...args, ...repoArgs]),
  });

  process.stdout.write(report.text);
  process.stdout.write("\n## Next Steps\n\n");
  process.stdout.write("- Configure GitHub owner/repo/project reference in .ai/ops.config.json when ready.\n");
  process.stdout.write("- Use `pnpm ops github:init -- --apply` only for missing label creation.\n");
  process.stdout.write("- Create or connect the GitHub Project manually in this first version.\n");
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
    dispatchId: fieldValue(fields, "Dispatch ID") || flatItemValue(item, "dispatch ID"),
    prLinks: content.pullRequest?.url ? [content.pullRequest.url] : [],
    updatedAt: content.updatedAt || item.updatedAt || "",
    tracerBulletDone: false,
  };
}

async function gitHubExport(args) {
  const config = await loadJson(".ai/ops.config.json");
  const project = configuredProjectRef(config, args);
  const input = readOption(args, "input");
  const output = readOption(args, "output", config.queueFile || ".ai/queue.json");

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
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadJson(relativePath) {
  const fullPath = path.isAbsolute(relativePath) ? relativePath : path.join(cwd, relativePath);
  const contents = await readFile(fullPath, "utf8");
  return JSON.parse(contents);
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

async function schedule(args) {
  const config = await loadJson(".ai/ops.config.json");
  const queuePath = readOption(args, "queue", config.queueFile || ".ai/queue.json");
  const capacityOverride = readOption(args, "review-capacity");
  const shouldDispatch = args.includes("--dispatch");
  const queueFullPath = path.isAbsolute(queuePath) ? queuePath : path.join(cwd, queuePath);

  if (!(await pathExists(queueFullPath))) {
    throw new Error(queueRecoveryMessage(queuePath));
  }

  const queue = await loadJson(queuePath);
  const reviewCapacity = Number.parseInt(capacityOverride || config.schedulerDefaults?.reviewCapacity || "1", 10);
  const context = { config, remainingCapacity: reviewCapacity };
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
  lines.push(shouldDispatch ? "Dispatch artifacts will be created for DISPATCH decisions only." : "No tracker state was changed and no subagents were dispatched.");

  const plan = `${lines.join("\n")}\n`;
  const date = nowForFile();
  const target = path.join(cwd, "docs", "agents", "schedules", `${date}-scheduler-plan.md`);

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, plan, "utf8");

  process.stdout.write(plan);
  process.stdout.write(`\nSaved scheduler plan: ${target}\n`);

  if (!shouldDispatch) {
    return;
  }

  const dispatchable = decisions.filter(({ decision }) => decision.action === "dispatch");
  if (dispatchable.length === 0) {
    process.stdout.write("No dispatch artifacts were created.\n");
    return;
  }

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
    });
    process.stdout.write(`${created.jsonTarget}\n${created.mdTarget}\n`);
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

  const resolvedHandoff = handoff || (issue ? await findLatestHandoff(issue) : "");

  const timestamp = nowForFile();
  const dispatchId = `dispatch-${timestamp}-${slugify(issue)}`;
  const dir = path.join(cwd, "docs", "agents", "dispatches");
  const jsonTarget = path.join(dir, `${dispatchId}.json`);
  const mdTarget = path.join(dir, `${dispatchId}.md`);
  const completionTarget = path.join(cwd, "docs", "agents", "completions", `${dispatchId}-completion.md`);
  const worktreePath = isolationMode === "worktree" ? deriveWorktreePath(issue, title) : "";

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
    completion_report_target: completionTarget,
    allowed_commands: ["run relevant tests", "update completion report"],
    forbidden_actions: ["merge PR", "change durable memory without approval", "handle secrets", "make unrelated dependency changes"],
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
  });

  process.stdout.write(`${created.jsonTarget}\n${created.mdTarget}\n`);
}

async function claim(args) {
  const claimedBy = readOption(args, "claimed-by");
  const requestedIsolationMode = readOption(args, "isolation-mode", "");
  const requestedWorktreePath = readOption(args, "worktree-path");

  if (!claimedBy) {
    throw new Error("Claim requires --claimed-by.");
  }

  const { fullPath, artifact } = await resolveDispatchArtifact(args, { command: "claim", status: "queued" });

  if (artifact.status !== "queued") {
    throw new Error(`Dispatch ${artifact.dispatch_id || fullPath} is ${artifact.status}, not queued.`);
  }

  const isolationMode = requestedIsolationMode || artifact.isolation_mode || "branch";

  if (artifact.isolation_mode && artifact.isolation_mode !== isolationMode) {
    throw new Error(
      `Claim isolation mode ${isolationMode} does not match dispatch isolation mode ${artifact.isolation_mode}.`,
    );
  }

  artifact.status = "claimed";
  artifact.claim = {
    claimed_by: claimedBy,
    claimed_at: nowIso(),
    isolation_mode: isolationMode,
  };

  if (!artifact.isolation_mode) {
    artifact.isolation_mode = isolationMode;
  }

  if (isolationMode === "worktree") {
    artifact.worktree_path =
      requestedWorktreePath || artifact.worktree_path || deriveWorktreePath(artifact.issue_id, artifact.title);
  } else if (requestedWorktreePath) {
    throw new Error("Claim accepts --worktree-path only when isolation mode is worktree.");
  }

  await writeFile(fullPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`${fullPath}\n`);
}

async function claimStatus(args) {
  const maxAgeHours = Number.parseFloat(readOption(args, "max-age-hours", "24"));
  const { fullPath, artifact } = await resolveDispatchArtifact(args, { command: "claim-status", status: "claimed" });
  const inspection = inspectClaimAge(artifact, Number.isFinite(maxAgeHours) ? maxAgeHours : 24);

  const lines = [
    "# Claim Status",
    "",
    `Dispatch: ${artifact.dispatch_id || fullPath}`,
    `Status: ${artifact.status || "unknown"}`,
    `Isolation mode: ${artifact.isolation_mode || "unset"}`,
    `Claimed by: ${artifact.claim?.claimed_by || "N/A"}`,
    `Claimed at: ${inspection.claimedAt || "N/A"}`,
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
  const maxAgeHours = Number.parseFloat(readOption(args, "max-age-hours", "24"));

  if (!approvedBy) {
    throw new Error("Reclaim requires --approved-by.");
  }

  if (!reason) {
    throw new Error("Reclaim requires --reason.");
  }

  const { fullPath, artifact } = await resolveDispatchArtifact(args, { command: "reclaim", status: "claimed" });

  if (artifact.status !== "claimed" || !artifact.claim) {
    throw new Error(`Dispatch ${artifact.dispatch_id || fullPath} is ${artifact.status}, not claimed.`);
  }

  const inspection = inspectClaimAge(artifact, Number.isFinite(maxAgeHours) ? maxAgeHours : 24);
  const historyEntry = {
    ...artifact.claim,
    reclaimed_at: nowIso(),
    reclaimed_by: approvedBy,
    reclaim_reason: reason,
    stale_at_reclaim: inspection.stale,
    age_hours_at_reclaim: inspection.ageHours == null ? null : Number(inspection.ageHours.toFixed(2)),
  };

  artifact.claim_history = Array.isArray(artifact.claim_history) ? artifact.claim_history : [];
  artifact.claim_history.push(historyEntry);
  artifact.claim = null;
  artifact.status = "queued";

  await writeFile(fullPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`${fullPath}\n`);
  process.stdout.write(`Reclaimed by ${approvedBy}. Dispatch returned to queued.\n`);
}

async function runDispatch(args) {
  const prepareWorktree = args.includes("--prepare-worktree");
  const { artifact } = await resolveDispatchArtifact(args, { command: "run", status: "claimed" });

  if (artifact.status !== "claimed") {
    throw new Error(`Dispatch ${artifact.dispatch_id} is ${artifact.status}, not claimed.`);
  }

  if (!artifact.claim?.claimed_by || !artifact.claim?.claimed_at || !artifact.claim?.isolation_mode) {
    throw new Error("Claimed dispatch is missing claimed_by, claimed_at, or isolation_mode.");
  }

  if (!artifact.isolation_mode) {
    throw new Error("Dispatch is missing isolation_mode.");
  }

  if (artifact.claim.isolation_mode !== artifact.isolation_mode) {
    throw new Error("Claimed dispatch isolation mode does not match dispatch isolation_mode.");
  }

  if (artifact.isolation_mode === "worktree" && !artifact.worktree_path) {
    throw new Error("Worktree dispatch is missing worktree_path.");
  }

  if (!Array.isArray(artifact.forbidden_actions) || artifact.forbidden_actions.length === 0) {
    throw new Error("Dispatch is missing forbidden_actions.");
  }

  if (prepareWorktree) {
    if (artifact.isolation_mode !== "worktree") {
      throw new Error("run -- --prepare-worktree requires a worktree-isolated dispatch.");
    }

    await mkdir(artifact.worktree_path, { recursive: true });
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
    `Handoff artifact: ${artifact.handoff_artifact || "TBD"}`,
    `Completion report target: ${artifact.completion_report_target || "TBD"}`,
    "",
    "Forbidden actions:",
    ...artifact.forbidden_actions.map((action) => `- ${action}`),
    "",
    prepareWorktree
      ? "No provider was invoked. Worktree directory was prepared locally. No code was changed."
      : "No provider was invoked. No worktree was created. No code was changed.",
  ];

  process.stdout.write(`${lines.join("\n")}\n`);
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

  if (command === "prd") {
    await runNodeScript("prd.mjs", args);
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

  if (command === "reclaim") {
    await reclaim(args);
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

  if (command === "run") {
    await runDispatch(args);
    return;
  }

  process.stderr.write(`Unknown command: ${command}\n\n${help}`);
  process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
