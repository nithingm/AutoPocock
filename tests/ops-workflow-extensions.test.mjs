import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, readdir, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const opsScript = path.join(repoRoot, "scripts", "ops.mjs");

async function makeWorkspace(config = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "autopocock-ext-"));
  await mkdir(path.join(dir, ".ai"), { recursive: true });
  await mkdir(path.join(dir, "docs", "agents", "completions"), { recursive: true });
  await mkdir(path.join(dir, "docs", "agents", "dispatches"), { recursive: true });
  await writeFile(
    path.join(dir, ".ai", "ops.config.json"),
    `${JSON.stringify(
      {
        tracker: "github",
        github: {
          owner: "",
          repo: "",
          projectUrl: "",
          projectId: "",
          projectNumber: "",
        },
        labels: {
          category: ["bug", "enhancement"],
          state: ["needs-triage", "ready-for-agent"],
        },
        projectSchema: {
          requiredFields: [],
          recommendedViews: [],
        },
        queueFile: ".ai/queue.json",
        ...config,
      },
      null,
      2,
    )}\n`,
  );
  return dir;
}

async function runOps(cwd, args, options = {}) {
  try {
    const result = await execFileAsync(process.execPath, [opsScript, ...args], {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        ...(options.env || {}),
      },
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: error.code || 1,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message,
    };
  }
}

async function installFakeGh(cwd) {
  const binDir = path.join(cwd, "fake-bin");
  const logPath = path.join(cwd, "gh-calls.log");
  await mkdir(binDir, { recursive: true });

  const shellPath = path.join(binDir, "gh");
  await writeFile(
    shellPath,
    `#!/bin/sh
printf '%s\\n' "$*" >> "$GH_LOG"
if [ "$1" = "--version" ]; then echo "gh version 2.0.0"; exit 0; fi
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then exit 0; fi
if [ "$1" = "project" ] && [ "$2" = "view" ]; then echo '{"id":"PVT_fake_project"}'; exit 0; fi
if [ "$1" = "project" ] && [ "$2" = "field-list" ]; then echo '{"fields":[{"id":"stage-field","name":"Execution Stage","options":[{"id":"afk-option","name":"AFK In Progress"}],"type":"ProjectV2SingleSelectField"},{"id":"lane-field","name":"Execution Lane","options":[{"id":"execution-option","name":"Execution"}],"type":"ProjectV2SingleSelectField"},{"id":"last-plan-field","name":"Last Scheduler Plan","type":"ProjectV2Field"},{"id":"dispatch-id-field","name":"Dispatch ID","type":"ProjectV2Field"}]}'; exit 0; fi
if [ "$1" = "project" ] && [ "$2" = "item-edit" ]; then exit 0; fi
if [ "$1" = "issue" ] && [ "$2" = "create" ]; then echo "https://github.com/example/repo/issues/999"; exit 0; fi
if [ "$1" = "pr" ] && [ "$2" = "comment" ]; then echo "https://github.com/example/repo/pull/$3#issuecomment-1"; exit 0; fi
if [ "$1" = "issue" ] && [ "$2" = "comment" ]; then echo "https://github.com/example/repo/issues/$3#issuecomment-1"; exit 0; fi
exit 0
`,
    "utf8",
  );
  await chmod(shellPath, 0o755);

  await writeFile(
    path.join(binDir, "gh.cmd"),
    `@echo off
echo %*>> "%GH_LOG%"
if "%1"=="--version" (
  echo gh version 2.0.0
  exit /b 0
)
if "%1"=="auth" if "%2"=="status" exit /b 0
if "%1"=="project" if "%2"=="view" (
  echo {"id":"PVT_fake_project"}
  exit /b 0
)
if "%1"=="project" if "%2"=="field-list" (
  echo {"fields":[{"id":"stage-field","name":"Execution Stage","options":[{"id":"afk-option","name":"AFK In Progress"}],"type":"ProjectV2SingleSelectField"},{"id":"lane-field","name":"Execution Lane","options":[{"id":"execution-option","name":"Execution"}],"type":"ProjectV2SingleSelectField"},{"id":"last-plan-field","name":"Last Scheduler Plan","type":"ProjectV2Field"},{"id":"dispatch-id-field","name":"Dispatch ID","type":"ProjectV2Field"}]}
  exit /b 0
)
if "%1"=="project" if "%2"=="item-edit" exit /b 0
if "%1"=="issue" if "%2"=="create" (
  echo https://github.com/example/repo/issues/999
  exit /b 0
)
if "%1"=="pr" if "%2"=="comment" (
  echo https://github.com/example/repo/pull/%3#issuecomment-1
  exit /b 0
)
if "%1"=="issue" if "%2"=="comment" (
  echo https://github.com/example/repo/issues/%3#issuecomment-1
  exit /b 0
)
exit /b 0
`,
    "utf8",
  );

  return {
    logPath,
    env: {
      GH_LOG: logPath,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
    },
  };
}

async function writeDagFixture(cwd) {
  const issuesDir = path.join(cwd, "issues");
  await mkdir(issuesDir, { recursive: true });
  const dagPath = path.join(issuesDir, "issue-dag.json");
  const dag = {
    schema_version: "issue-dag/v1",
    source_prd: "example-prd.md",
    source_prd_status: "approved",
    source_context: "docs/agents/contexts/example.md",
    nodes: [
      {
        id: "node-1",
        title: "Foundation",
        type: "foundation",
        goal: "Ship the first slice",
        depends_on: [],
        acceptance_criteria: ["Foundation complete"],
        verification_plan: {
          automated: ["node --test", "pnpm test:integration"],
          manual: ["Inspect artifact"],
          evidence_expected: ["Integration verification stays green"],
        },
        write_surface: ["scripts/**"],
        risk: "medium",
        conflict_surface: "medium",
        provider_eligible: true,
        human_gate_required: false,
        parallelizable: false,
        status: "ready_for_handoff",
        review_status: "pending",
        qa_status: "pending",
        conflict_reasoning: "Foundational node runs first.",
      },
      {
        id: "node-2",
        title: "Follow-on implementation",
        type: "implementation",
        goal: "Continue after node 1",
        depends_on: ["node-1"],
        acceptance_criteria: ["Follow-on complete"],
        verification_plan: {
          automated: ["node --test"],
          manual: ["Inspect artifact"],
        },
        write_surface: ["docs/**"],
        risk: "low",
        conflict_surface: "low",
        provider_eligible: true,
        human_gate_required: false,
        parallelizable: true,
        status: "blocked_dependency",
        review_status: "pending",
        qa_status: "pending",
        conflict_reasoning: "Depends on node 1.",
      },
    ],
    edges: [{ from: "node-1", to: "node-2" }],
    human_gated_nodes: [],
    provider_eligible_nodes: ["node-1", "node-2"],
    waves: [
      { wave: 1, runnable_nodes: ["node-1"], blocked_nodes: [], reason: "Foundation." },
      { wave: 2, runnable_nodes: ["node-2"], blocked_nodes: [], reason: "After foundation." },
    ],
    progression: {
      completed_nodes: [],
      runnable_nodes: ["node-1"],
      blocked_nodes: ["node-2"],
    },
  };
  await writeFile(dagPath, `${JSON.stringify(dag, null, 2)}\n`, "utf8");
  return dagPath;
}

function makeCompletionReport({ issue, changedAreas = "scripts/ops.mjs", results = "Passing" }) {
  return `# Completion Report

## Changes

- Files or areas changed: ${changedAreas}

## Verification

- Commands run: node --test tests/ops-workflow-extensions.test.mjs
- Results: ${results}
- Gaps: None

## Risks

- Residual risks: None

## Follow-ups

- Bugs: None
- Issues: None

## Issue

- Tracker: #${issue}
`;
}

test("init creates the durable memory proposals directory", async () => {
  const cwd = await makeWorkspace();

  const result = await runOps(cwd, ["init"]);
  const entries = await readdir(path.join(cwd, "docs", "agents"));

  assert.equal(result.code, 0);
  assert.ok(entries.includes("memory-proposals"));
});

test("setup reports one cross-platform readiness flow without mutating the workspace by default", async () => {
  const cwd = await makeWorkspace({
    github: {
      owner: "example",
      repo: "repo",
      projectNumber: "7",
    },
  });

  const result = await runOps(cwd, ["setup"]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /# Setup Plane/);
  assert.match(result.stdout, /Mode: dry-run/);
  assert.match(result.stdout, /## Host/);
  assert.match(result.stdout, /## Runtime Prerequisites/);
  assert.match(result.stdout, /## GitHub Readiness/);
  assert.match(result.stdout, /## Providers/);
  assert.match(result.stdout, /## Workflow Structure/);
  assert.match(result.stdout, /would create local directory docs\/PRDs|would create local directory docs\\PRDs/);
  await assert.rejects(stat(path.join(cwd, "docs", "PRDs")));
});

test("setup --apply-init materializes the local workflow structure after reporting readiness", async () => {
  const cwd = await makeWorkspace({
    github: {
      owner: "example",
      repo: "repo",
      projectNumber: "7",
    },
  });

  const result = await runOps(cwd, ["setup", "--apply-init"]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Mode: apply-init/);
  assert.match(result.stdout, /created local directory docs\/PRDs|created local directory docs\\PRDs/);
  assert.ok((await stat(path.join(cwd, "docs", "PRDs"))).isDirectory());
  assert.ok((await stat(path.join(cwd, "docs", "agents", "loop-specs"))).isDirectory());
});

test("context artifacts must be approved before PRD generation can proceed", async () => {
  const cwd = await makeWorkspace();
  await writeFile(path.join(cwd, "CONTEXT.md"), "# Context\n\nShared domain language lives here.\n", "utf8");

  const contextResult = await runOps(cwd, ["context", "--title", "Context gated feature"]);
  assert.equal(contextResult.code, 0);
  const contextPath = contextResult.stdout.trim();

  const prdRejected = await runOps(cwd, ["prd", "--context", contextPath, "--title", "Context gated feature"]);
  assert.notEqual(prdRejected.code, 0);
  assert.match(prdRejected.stderr, /Planning requires approved context/);
  assert.match(prdRejected.stderr, /context-approve/);

  const approveContext = await runOps(cwd, ["context-approve", "--context", contextPath, "--approved-by", "solo-operator"]);
  assert.equal(approveContext.code, 0);
  const approvedContext = await readFile(contextPath, "utf8");
  assert.match(approvedContext, /- Status: approved/);
  assert.match(approvedContext, /- Approved by: solo-operator/);

  const prdResult = await runOps(cwd, ["prd", "--context", contextPath, "--title", "Context gated feature"]);
  assert.equal(prdResult.code, 0);
  const prdPath = prdResult.stdout.trim();
  const prdMarkdown = await readFile(prdPath, "utf8");
  assert.match(prdMarkdown, /## Approval/);
  assert.match(prdMarkdown, /- Status: draft/);
  assert.match(prdMarkdown, new RegExp(contextPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("issue planning requires an approved PRD derived from approved context", async () => {
  const cwd = await makeWorkspace();
  await writeFile(path.join(cwd, "CONTEXT.md"), "# Context\n\nShared domain language lives here.\n", "utf8");

  const contextResult = await runOps(cwd, ["context", "--title", "PRD approval feature"]);
  const contextPath = contextResult.stdout.trim();
  await runOps(cwd, ["context-approve", "--context", contextPath, "--approved-by", "solo-operator"]);

  const prdResult = await runOps(cwd, ["prd", "--context", contextPath, "--title", "PRD approval feature"]);
  const prdPath = prdResult.stdout.trim();

  const draftIssues = await runOps(cwd, ["issues", "--prd", prdPath]);
  assert.notEqual(draftIssues.code, 0);
  assert.match(draftIssues.stderr, /Issue planning requires an approved PRD/);
  assert.match(draftIssues.stderr, /prd-approve/);

  const approvePrd = await runOps(cwd, ["prd-approve", "--prd", prdPath, "--approved-by", "solo-operator"]);
  assert.equal(approvePrd.code, 0);
  const approvedPrd = await readFile(prdPath, "utf8");
  assert.match(approvedPrd, /- Status: approved/);
  assert.match(approvedPrd, /- Approved by: solo-operator/);

  const issuesResult = await runOps(cwd, ["issues", "--prd", prdPath]);
  assert.equal(issuesResult.code, 0);
  const issuesPath = issuesResult.stdout.trim();
  const issuesMarkdown = await readFile(issuesPath, "utf8");
  const issuesJsonPath = issuesPath.replace(/\.md$/, ".json");
  const issuesJson = JSON.parse(await readFile(issuesJsonPath, "utf8"));
  assert.match(issuesMarkdown, /# Issue DAG/);
  assert.match(issuesMarkdown, /## Dependency Edges/);
  assert.match(issuesMarkdown, /## Execution Waves/);
  assert.match(issuesMarkdown, /Source PRD status: approved/);
  assert.match(issuesMarkdown, /Source context:/);
  assert.equal(issuesJson.schema_version, "issue-dag/v1");
  assert.ok(Array.isArray(issuesJson.nodes));
  assert.ok(issuesJson.nodes.length >= 1);
  assert.ok(Array.isArray(issuesJson.waves));
  assert.ok(issuesJson.waves.length >= 1);
  assert.ok("provider_eligible" in issuesJson.nodes[0]);
  assert.ok("human_gate_required" in issuesJson.nodes[0]);
  assert.ok("write_surface" in issuesJson.nodes[0]);
});

test("review-prep fails with explicit gate messages when required inputs are missing", async () => {
  const cwd = await makeWorkspace();
  const completionPath = path.join(cwd, "docs", "agents", "completions", "issue-6.md");
  await writeFile(
    completionPath,
    `# Completion Report

## Verification

- Commands run:
- Results:
- Gaps:
`,
  );

  const result = await runOps(cwd, ["review-prep", "--issue", "6", "--completion", completionPath]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Missing Review Entry input: acceptance criteria\./);
  assert.match(result.stderr, /Missing Review Entry input: dependency changes\./);
});

test("complete writes explicit required and optional markers into the completion report template", async () => {
  const cwd = await makeWorkspace();

  const result = await runOps(cwd, ["complete", "--issue", "7", "--status", "needs human review"]);
  const completionDir = path.join(cwd, "docs", "agents", "completions");
  const createdFile = (await readdir(completionDir)).find((entry) => entry.endsWith(".md"));
  const markdown = await readFile(path.join(completionDir, createdFile), "utf8");

  assert.equal(result.code, 0);
  assert.match(markdown, /- Status: needs human review/);
  assert.match(markdown, /- Summary: REQUIRED - replace with a concise outcome summary/);
  assert.match(markdown, /- Files or areas changed: REQUIRED - replace with explicit changed files or areas/);
  assert.match(markdown, /- Reason: REQUIRED - replace with the reason for the change/);
  assert.match(markdown, /- Commands run: REQUIRED - replace with exact verification commands/);
  assert.match(markdown, /- Results: REQUIRED - replace with observed verification results/);
  assert.match(markdown, /- Gaps: REQUIRED - replace with explicit remaining gaps, or write None/);
  assert.match(markdown, /- Residual risks: REQUIRED - replace with explicit residual risks, or write None/);
  assert.match(markdown, /- Bugs: OPTIONAL - link bugs found during implementation, or write None/);
  assert.match(markdown, /- Issues: REQUIRED - replace with follow-up issues, or write None/);
  assert.match(markdown, /- Updated: OPTIONAL - list updated artifacts, or write None/);
  assert.match(markdown, /- Suggested stage: Human Review/);
  assert.match(markdown, /- Tracker: 7/);
});

test("review-prep writes an advisory artifact when the gate passes", async () => {
  const cwd = await makeWorkspace();
  const completionPath = path.join(cwd, "docs", "agents", "completions", "issue-6.md");
  await writeFile(
    completionPath,
    `# Completion Report

## Changes

- Files or areas changed: scripts/ops.mjs, scripts/lib/review-gate.mjs

## Verification

- Commands run: node --test tests/issue6-review-entry.test.mjs
- Results: Passing
- Gaps: None

## Risks

- Residual risks: None

## Follow-ups

- Bugs: None
- Issues: None

## Issue

- Tracker: #6
`,
  );

  const result = await runOps(cwd, [
    "review-prep",
    "--issue",
    "6",
    "--pr",
    "456",
    "--completion",
    completionPath,
    "--acceptance",
    "Generate review prep only when the gate passes|Report missing inputs clearly",
    "--dependency-changes",
    "None",
    "--local-refactors",
    "None",
  ]);

  const reviewDir = path.join(cwd, "docs", "agents", "reviews");
  const createdFile = (await readdir(reviewDir)).find((entry) => entry.endsWith(".md"));
  const markdown = await readFile(path.join(reviewDir, createdFile), "utf8");

  assert.equal(result.code, 0);
  assert.match(markdown, /# Review Prep/);
  assert.match(markdown, /- Issue: 6/);
  assert.match(markdown, /- PR: 456/);
  assert.match(markdown, /- Dependency changes:\n- None/);
});

test("review-prep auto-resolves the latest completion report for the requested issue", async () => {
  const cwd = await makeWorkspace();
  const completionDir = path.join(cwd, "docs", "agents", "completions");
  const olderPath = path.join(completionDir, "2026-05-13-issue-6-older.md");
  const newerPath = path.join(completionDir, "2026-05-14-issue-6-newer.md");
  await writeFile(
    olderPath,
    makeCompletionReport({ issue: 6, changedAreas: "scripts/ops.mjs" }),
  );
  await writeFile(
    newerPath,
    makeCompletionReport({ issue: 6, changedAreas: "scripts/lib/review-gate.mjs" }),
  );
  await writeFile(
    path.join(completionDir, "2026-05-14-issue-99.md"),
    makeCompletionReport({ issue: 99, changedAreas: "scripts/ignore-me.mjs" }),
  );
  await utimes(olderPath, new Date("2026-05-13T12:00:00.000Z"), new Date("2026-05-13T12:00:00.000Z"));
  await utimes(newerPath, new Date("2026-05-14T12:00:00.000Z"), new Date("2026-05-14T12:00:00.000Z"));

  const result = await runOps(cwd, [
    "review-prep",
    "--issue",
    "6",
    "--acceptance",
    "Generate review prep from the latest completion report",
    "--dependency-changes",
    "None",
    "--local-refactors",
    "None",
  ]);

  assert.equal(result.code, 0);
  const reviewDir = path.join(cwd, "docs", "agents", "reviews");
  const createdFile = (await readdir(reviewDir)).find((entry) => entry.endsWith(".md"));
  const markdown = await readFile(path.join(reviewDir, createdFile), "utf8");

  assert.match(markdown, /- Issue: 6/);
  assert.match(markdown, /- Changed areas:\n- scripts\/lib\/review-gate\.mjs/);
  assert.doesNotMatch(markdown, /scripts\/ops\.mjs/);
  assert.doesNotMatch(markdown, /scripts\/ignore-me\.mjs/);
});

test("review-prep stops with exact completion choices when multiple latest reports match the issue", async () => {
  const cwd = await makeWorkspace();
  const completionDir = path.join(cwd, "docs", "agents", "completions");
  const firstPath = path.join(completionDir, "2026-05-14-issue-6-a.md");
  const secondPath = path.join(completionDir, "2026-05-14-issue-6-b.md");
  const sharedTime = new Date("2026-05-14T12:00:00.000Z");

  await writeFile(firstPath, makeCompletionReport({ issue: 6, changedAreas: "scripts/ops.mjs" }));
  await writeFile(secondPath, makeCompletionReport({ issue: 6, changedAreas: "scripts/lib/review-gate.mjs" }));
  await utimes(firstPath, sharedTime, sharedTime);
  await utimes(secondPath, sharedTime, sharedTime);

  const result = await runOps(cwd, ["review-prep", "--issue", "6"]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Multiple completion artifacts match issue 6\./);
  assert.match(result.stderr, new RegExp(firstPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(result.stderr, new RegExp(secondPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(
    result.stderr,
    new RegExp(
      `pnpm ops review-prep -- --issue 6 --completion ${secondPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    ),
  );
});

test("memory-propose writes json and markdown proposal artifacts", async () => {
  const cwd = await makeWorkspace();

  const result = await runOps(cwd, [
    "memory-propose",
    "--type",
    "workflow",
    "--title",
    "Capture review gate policy",
    "--rationale",
    "The workflow contract changed and needs an approval artifact.",
    "--target-files",
    "docs/agents/workflow.md|ROADMAP.md",
    "--suggested-text",
    "Review Prep must only be generated after the Review Entry Gate passes.",
    "--accept-risk",
    "The durable memory may need another update later.",
    "--reject-risk",
    "Operators may repeat the same workflow decision manually.",
  ]);

  const outputLines = result.stdout.trim().split(/\r?\n/);
  const json = JSON.parse(await readFile(outputLines[0], "utf8"));
  const markdown = await readFile(outputLines[1], "utf8");

  assert.equal(result.code, 0);
  assert.equal(json.type, "workflow");
  assert.deepEqual(json.target_files, ["docs/agents/workflow.md", "ROADMAP.md"]);
  assert.match(markdown, /# Durable Memory Proposal: Capture review gate policy/);
});

test("memory-decision approves a proposal without applying target file changes by default", async () => {
  const cwd = await makeWorkspace();
  await writeFile(path.join(cwd, "docs", "agents", "workflow.md"), "# Workflow\n");
  const proposalResult = await runOps(cwd, [
    "memory-propose",
    "--type",
    "workflow",
    "--title",
    "Capture review gate policy",
    "--rationale",
    "The workflow contract changed and needs an approval artifact.",
    "--target-files",
    "docs/agents/workflow.md",
    "--suggested-text",
    "Review Prep must only be generated after the Review Entry Gate passes.",
    "--accept-risk",
    "The durable memory may need another update later.",
    "--reject-risk",
    "Operators may repeat the same workflow decision manually.",
  ]);
  const [jsonPath, markdownPath] = proposalResult.stdout.trim().split(/\r?\n/);

  const decisionResult = await runOps(cwd, [
    "memory-decision",
    "--proposal",
    jsonPath,
    "--decision",
    "approve",
    "--approved-by",
    "solo-operator",
    "--reason",
    "This should become durable workflow memory.",
  ]);
  const json = JSON.parse(await readFile(jsonPath, "utf8"));
  const markdown = await readFile(markdownPath, "utf8");
  const target = await readFile(path.join(cwd, "docs", "agents", "workflow.md"), "utf8");

  assert.equal(decisionResult.code, 0, decisionResult.stderr);
  assert.equal(json.status, "approved");
  assert.equal(json.decision.by, "solo-operator");
  assert.match(markdown, /## Decision/);
  assert.equal(target, "# Workflow\n");
});

test("memory-decision --apply appends approved proposal text with an idempotent marker", async () => {
  const cwd = await makeWorkspace();
  const targetPath = path.join(cwd, "docs", "agents", "workflow.md");
  await writeFile(targetPath, "# Workflow\n");
  const proposalResult = await runOps(cwd, [
    "memory-propose",
    "--type",
    "workflow",
    "--title",
    "Capture review gate policy",
    "--rationale",
    "The workflow contract changed and needs an approval artifact.",
    "--target-files",
    "docs/agents/workflow.md",
    "--suggested-text",
    "Review Prep must only be generated after the Review Entry Gate passes.",
    "--accept-risk",
    "The durable memory may need another update later.",
    "--reject-risk",
    "Operators may repeat the same workflow decision manually.",
  ]);
  const [jsonPath, markdownPath] = proposalResult.stdout.trim().split(/\r?\n/);

  const applyResult = await runOps(cwd, [
    "memory-decision",
    "--proposal",
    jsonPath,
    "--decision",
    "approve",
    "--approved-by",
    "solo-operator",
    "--reason",
    "This should become durable workflow memory.",
    "--apply",
  ]);
  const secondApply = await runOps(cwd, [
    "memory-decision",
    "--proposal",
    jsonPath,
    "--approved-by",
    "solo-operator",
    "--apply",
  ]);
  const json = JSON.parse(await readFile(jsonPath, "utf8"));
  const markdown = await readFile(markdownPath, "utf8");
  const target = await readFile(targetPath, "utf8");
  const occurrences = target.match(/<!-- memory-proposal:/g) || [];

  assert.equal(applyResult.code, 0, applyResult.stderr);
  assert.equal(secondApply.code, 0, secondApply.stderr);
  assert.equal(json.status, "applied");
  assert.equal(json.application.applied_by, "solo-operator");
  assert.match(markdown, /## Application/);
  assert.match(target, /Review Prep must only be generated after the Review Entry Gate passes/);
  assert.equal(occurrences.length, 1);
});

test("memory-decision --apply requires explicit approval or an approved proposal", async () => {
  const cwd = await makeWorkspace();
  await writeFile(path.join(cwd, "docs", "agents", "workflow.md"), "# Workflow\n");
  const proposalResult = await runOps(cwd, [
    "memory-propose",
    "--type",
    "workflow",
    "--title",
    "Capture review gate policy",
    "--rationale",
    "The workflow contract changed and needs an approval artifact.",
    "--target-files",
    "docs/agents/workflow.md",
    "--suggested-text",
    "Review Prep must only be generated after the Review Entry Gate passes.",
    "--accept-risk",
    "The durable memory may need another update later.",
    "--reject-risk",
    "Operators may repeat the same workflow decision manually.",
  ]);
  const [jsonPath] = proposalResult.stdout.trim().split(/\r?\n/);

  const applyResult = await runOps(cwd, [
    "memory-decision",
    "--proposal",
    jsonPath,
    "--approved-by",
    "solo-operator",
    "--apply",
  ]);

  assert.notEqual(applyResult.code, 0);
  assert.match(applyResult.stderr, /requires an already approved proposal/);
});

test("mirror prints a dry-run comment target and summarized body", async () => {
  const cwd = await makeWorkspace();
  const artifactDir = path.join(cwd, "docs", "agents", "completions");
  const artifactPath = path.join(artifactDir, "issue-5.md");
  await writeFile(
    artifactPath,
    `# Completion Report

## Result

- Status: needs human review
- Summary: Added selective mirroring

## Changes

- Files or areas changed: scripts/ops.mjs, scripts/lib/artifact-mirror.mjs

## Verification

- Commands run: node --test
- Results: Passing
`,
  );

  const result = await runOps(cwd, ["mirror", "--artifact", artifactPath, "--issue", "5"]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /# Artifact Mirror/);
  assert.match(result.stdout, /Mode: dry-run/);
  assert.match(result.stdout, /Target: issue #5/);
  assert.match(result.stdout, /Completion report summary/);
  assert.match(result.stdout, /No GitHub comment was posted/);
});

test("mirror --apply posts via a body file so multiline artifacts are safe", async () => {
  const cwd = await makeWorkspace();
  const fakeGh = await installFakeGh(cwd);
  const artifactDir = path.join(cwd, "docs", "agents", "completions");
  const artifactPath = path.join(artifactDir, "issue-5.md");
  await writeFile(
    artifactPath,
    `# Completion Report

## Result

- Status: needs human review
- Summary: Added selective mirroring

## Verification

- Commands run: node --test
- Results: Passing
`,
  );

  const result = await runOps(cwd, ["mirror", "--artifact", artifactPath, "--issue", "5", "--apply"], {
    env: fakeGh.env,
  });
  const ghLog = await readFile(fakeGh.logPath, "utf8");

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Mode: apply/);
  assert.match(ghLog, /issue comment 5 --body-file/);
});

test("feedback prints a dry-run classification without mutating GitHub", async () => {
  const cwd = await makeWorkspace();

  const result = await runOps(cwd, [
    "feedback",
    "--issue",
    "8",
    "--pr",
    "314",
    "--finding",
    "Evidence: The review page has a typo in the Approve button. Expected Behavior: The button label should say Approve. Actual Behavior: The label says Approe.",
  ]);
  const outputLines = result.stdout.trim().split(/\r?\n/);
  const jsonPath = outputLines[outputLines.length - 2];
  const markdownPath = outputLines[outputLines.length - 1];
  const json = JSON.parse(await readFile(jsonPath, "utf8"));
  const markdown = await readFile(markdownPath, "utf8");

  assert.equal(result.code, 0);
  assert.match(result.stdout, /# Feedback Classification/);
  assert.match(result.stdout, /Classification: same-pr-fix/);
  assert.match(result.stdout, /Solo Operator approval required: yes/);
  assert.match(result.stdout, /No GitHub issue or comment was created\./);
  assert.equal(json.classification, "same-pr-fix");
  assert.match(markdown, /# Feedback Summary/);
  assert.ok((await stat(jsonPath)).isFile());
  assert.ok((await stat(markdownPath)).isFile());
});

test("feedback --apply posts Same-PR Fix candidates as PR comments and records the mutation", async () => {
  const cwd = await makeWorkspace();
  const fakeGh = await installFakeGh(cwd);

  const result = await runOps(
    cwd,
    [
      "feedback",
      "--issue",
      "8",
      "--pr",
      "314",
      "--finding",
      "Evidence: The review page has a typo in the Approve button. Expected Behavior: The button label should say Approve. Actual Behavior: The label says Approe.",
      "--apply",
    ],
    { env: fakeGh.env },
  );
  const outputLines = result.stdout.trim().split(/\r?\n/);
  const jsonPath = outputLines[outputLines.length - 2];
  const markdownPath = outputLines[outputLines.length - 1];
  const json = JSON.parse(await readFile(jsonPath, "utf8"));
  const markdown = await readFile(markdownPath, "utf8");
  const ghLog = await readFile(fakeGh.logPath, "utf8");

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Mode: apply/);
  assert.match(result.stdout, /GitHub PR comment posted to #314/);
  assert.equal(json.mode, "apply");
  assert.equal(json.github_mutation, "posted-pr-comment");
  assert.match(markdown, /GitHub PR comment posted to #314/);
  assert.match(ghLog, /pr comment 314 --body-file/);
});

test("feedback --apply creates GitHub issues for broader bug drafts and records the created issue URL", async () => {
  const cwd = await makeWorkspace();
  const fakeGh = await installFakeGh(cwd);

  const result = await runOps(
    cwd,
    [
      "feedback",
      "--issue",
      "8",
      "--pr",
      "314",
      "--finding",
      "Evidence: Saving twice returns a 500 error. Expected Behavior: Saving twice remains stable. Actual Behavior: The second save fails with a 500 error.",
      "--apply",
    ],
    { env: fakeGh.env },
  );
  const outputLines = result.stdout.trim().split(/\r?\n/);
  const jsonPath = outputLines[outputLines.length - 2];
  const markdownPath = outputLines[outputLines.length - 1];
  const json = JSON.parse(await readFile(jsonPath, "utf8"));
  const markdown = await readFile(markdownPath, "utf8");
  const ghLog = await readFile(fakeGh.logPath, "utf8");

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Mode: apply/);
  assert.match(result.stdout, /GitHub issue created: https:\/\/github\.com\/example\/repo\/issues\/999/);
  assert.equal(json.mode, "apply");
  assert.equal(json.github_mutation, "created-issue");
  assert.match(markdown, /GitHub issue created: https:\/\/github\.com\/example\/repo\/issues\/999/);
  assert.match(ghLog, /issue create --title/);
  assert.match(ghLog, /--body-file/);
});

test("schedule --apply updates tracker fields for dispatch decisions without creating dispatch artifacts", async () => {
  const cwd = await makeWorkspace({
    github: {
      owner: "nithingm",
      repo: "AutoPocock",
      projectNumber: "1",
    },
  });
  const fakeGh = await installFakeGh(cwd);
  await writeFile(
    path.join(cwd, ".ai", "queue.json"),
    `${JSON.stringify(
      [
        {
          id: "#45",
          projectItemId: "PVTI_ready_item",
          title: "Ready scheduler apply slice",
          labels: ["enhancement", "ready-for-agent"],
          stage: "Ready for Handoff",
          lane: "Handoff",
          featureTrack: "ops-flow",
          queueClass: "tracer-bullet",
          risk: "low",
          dependency: "unblocked",
          conflictSurface: "low",
          tracerBulletDone: false,
        },
        {
          id: "#46",
          projectItemId: "PVTI_blocked_item",
          title: "Blocked scheduler apply slice",
          labels: ["enhancement", "ready-for-agent"],
          stage: "Ready for Handoff",
          lane: "Handoff",
          featureTrack: "ops-flow",
          queueClass: "tracer-bullet",
          risk: "high",
          dependency: "unblocked",
          conflictSurface: "low",
          tracerBulletDone: false,
        },
      ],
      null,
      2,
    )}\n`,
  );

  const result = await runOps(cwd, ["schedule", "--queue", ".ai/queue.json", "--apply"], {
    env: fakeGh.env,
  });
  const ghLog = await readFile(fakeGh.logPath, "utf8");
  const dispatchEntries = await readdir(path.join(cwd, "docs", "agents", "dispatches"));

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Tracker apply mode: enabled/);
  assert.match(result.stdout, /DISPATCH: #45 Ready scheduler apply slice/);
  assert.match(result.stdout, /SKIP: #46 Blocked scheduler apply slice - high risk requires Solo Operator approval/);
  assert.match(result.stdout, /Applied scheduler tracker updates for 1 item\(s\) \(3 field update\(s\)\)\./);
  assert.equal(dispatchEntries.length, 0);
  assert.match(ghLog, /project view 1 --owner nithingm --format json/);
  assert.match(ghLog, /project field-list 1 --owner nithingm --format json --limit 100/);
  assert.match(ghLog, /project item-edit --id PVTI_ready_item --project-id PVT_fake_project --field-id stage-field --single-select-option-id afk-option/);
  assert.match(ghLog, /project item-edit --id PVTI_ready_item --project-id PVT_fake_project --field-id lane-field --single-select-option-id execution-option/);
  assert.match(ghLog, /project item-edit --id PVTI_ready_item --project-id PVT_fake_project --field-id last-plan-field --text docs[\\/]agents[\\/]schedules[\\/].+scheduler-plan\.md/);
  assert.doesNotMatch(ghLog, /project item-edit .*PVTI_blocked_item/);
});

test("schedule --apply --dispatch writes generated dispatch IDs back to the tracker", async () => {
  const cwd = await makeWorkspace({
    github: {
      owner: "nithingm",
      repo: "AutoPocock",
      projectNumber: "1",
    },
  });
  const fakeGh = await installFakeGh(cwd);
  await mkdir(path.join(cwd, "docs", "agents", "handoffs"), { recursive: true });
  await writeFile(path.join(cwd, "docs", "agents", "handoffs", "2026-06-25-47-ready-dispatch.md"), "# Context Handoff\n");
  await writeFile(
    path.join(cwd, ".ai", "queue.json"),
    `${JSON.stringify(
      [
        {
          id: "#47",
          projectItemId: "PVTI_dispatch_item",
          title: "Ready dispatch",
          labels: ["enhancement", "ready-for-agent"],
          stage: "Ready for Handoff",
          lane: "Handoff",
          featureTrack: "ops-flow",
          queueClass: "tracer-bullet",
          risk: "low",
          dependency: "unblocked",
          conflictSurface: "low",
          tracerBulletDone: false,
        },
      ],
      null,
      2,
    )}\n`,
  );

  const result = await runOps(cwd, ["schedule", "--queue", ".ai/queue.json", "--apply", "--dispatch"], {
    env: fakeGh.env,
  });
  const ghLog = await readFile(fakeGh.logPath, "utf8");
  const dispatchEntries = await readdir(path.join(cwd, "docs", "agents", "dispatches"));
  const jsonFile = dispatchEntries.find((entry) => entry.endsWith(".json"));
  const artifact = JSON.parse(await readFile(path.join(cwd, "docs", "agents", "dispatches", jsonFile), "utf8"));

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Dispatch artifacts will be created and tracker fields will be updated/);
  assert.equal(artifact.issue_id, "#47");
  assert.match(ghLog, new RegExp(`project item-edit --id PVTI_dispatch_item --project-id PVT_fake_project --field-id dispatch-id-field --text ${artifact.dispatch_id}`));
});

test("review-decision approve moves a node into QA and writes a review artifact", async () => {
  const cwd = await makeWorkspace();
  const dagPath = await writeDagFixture(cwd);

  const result = await runOps(cwd, [
    "review-decision",
    "--dag",
    dagPath,
    "--issue",
    "31",
    "--node",
    "node-1",
    "--decision",
    "approve",
    "--approved-by",
    "solo-operator",
    "--reason",
    "Meets review bar",
  ]);

  assert.equal(result.code, 0);
  const updated = JSON.parse(await readFile(dagPath, "utf8"));
  assert.equal(updated.nodes[0].status, "qa");
  assert.equal(updated.nodes[0].review_status, "approved");
  assert.deepEqual(updated.progression.runnable_nodes, []);

  const reviewDir = path.join(cwd, "docs", "agents", "reviews");
  const artifacts = await readdir(reviewDir);
  const markdown = await readFile(path.join(reviewDir, artifacts[0]), "utf8");
  assert.match(markdown, /# Review Decision/);
  assert.match(markdown, /- Decision: approve/);
});

test("review-decision reject reopens the node for handoff", async () => {
  const cwd = await makeWorkspace();
  const dagPath = await writeDagFixture(cwd);

  const result = await runOps(cwd, [
    "review-decision",
    "--dag",
    dagPath,
    "--issue",
    "31",
    "--node",
    "node-1",
    "--decision",
    "reject",
    "--approved-by",
    "solo-operator",
    "--reason",
    "Needs another pass",
  ]);

  assert.equal(result.code, 0);
  const updated = JSON.parse(await readFile(dagPath, "utf8"));
  assert.equal(updated.nodes[0].status, "ready_for_handoff");
  assert.equal(updated.nodes[0].review_status, "rejected");
  assert.equal(updated.nodes[0].qa_status, "pending");
  assert.deepEqual(updated.progression.runnable_nodes, ["node-1"]);
});

test("qa-decision pass completes a node and unlocks dependents", async () => {
  const cwd = await makeWorkspace();
  const dagPath = await writeDagFixture(cwd);

  await runOps(cwd, [
    "review-decision",
    "--dag",
    dagPath,
    "--issue",
    "31",
    "--node",
    "node-1",
    "--decision",
    "approve",
    "--approved-by",
    "solo-operator",
  ]);

  const result = await runOps(cwd, [
    "qa-decision",
    "--dag",
    dagPath,
    "--issue",
    "31",
    "--node",
    "node-1",
    "--decision",
    "pass",
    "--approved-by",
    "solo-operator",
    "--reason",
    "Tests passed",
    "--changed-outputs",
    "scripts/ops.mjs|tests/ops-workflow-extensions.test.mjs",
    "--verification-commands",
    "node --test|pnpm test:integration",
    "--verification-results",
    "Unit checks passed|Integration checks passed",
    "--acceptance-evidence",
    "Foundation complete=>Unit and integration checks passed",
    "--test-evidence",
    "unit:pass:Unit checks passed|integration:pass:Integration checks passed",
  ]);

  assert.equal(result.code, 0);
  const updated = JSON.parse(await readFile(dagPath, "utf8"));
  assert.equal(updated.nodes[0].status, "done");
  assert.equal(updated.nodes[0].qa_status, "passed");
  assert.equal(updated.nodes[0].validation_status, "passed");
  assert.equal(updated.nodes[1].status, "ready_for_handoff");
  assert.deepEqual(updated.progression.completed_nodes, ["node-1"]);
  assert.deepEqual(updated.progression.runnable_nodes, ["node-2"]);

  const qaDir = path.join(cwd, "docs", "QA");
  const artifacts = await readdir(qaDir);
  const markdown = await readFile(path.join(qaDir, artifacts[0]), "utf8");
  assert.match(markdown, /# QA Decision/);
  assert.match(markdown, /- Decision: pass/);
});

test("qa-decision pass refuses to unlock without completion evidence", async () => {
  const cwd = await makeWorkspace();
  const dagPath = await writeDagFixture(cwd);

  await runOps(cwd, [
    "review-decision",
    "--dag",
    dagPath,
    "--issue",
    "31",
    "--node",
    "node-1",
    "--decision",
    "approve",
    "--approved-by",
    "solo-operator",
  ]);

  const result = await runOps(cwd, [
    "qa-decision",
    "--dag",
    dagPath,
    "--issue",
    "31",
    "--node",
    "node-1",
    "--decision",
    "pass",
    "--approved-by",
    "solo-operator",
  ]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Completion evidence is incomplete/);
  assert.match(result.stderr, /missing changed outputs/);
  assert.match(result.stderr, /missing integration test evidence/);
});

test("qa-decision validation-fail records evidence and keeps dependents blocked", async () => {
  const cwd = await makeWorkspace();
  const dagPath = await writeDagFixture(cwd);

  await runOps(cwd, [
    "review-decision",
    "--dag",
    dagPath,
    "--issue",
    "31",
    "--node",
    "node-1",
    "--decision",
    "approve",
    "--approved-by",
    "solo-operator",
  ]);

  const result = await runOps(cwd, [
    "qa-decision",
    "--dag",
    dagPath,
    "--issue",
    "31",
    "--node",
    "node-1",
    "--decision",
    "validation-fail",
    "--approved-by",
    "solo-operator",
    "--reason",
    "Local tests passed but integration failed",
    "--changed-outputs",
    "scripts/ops.mjs",
    "--verification-commands",
    "node --test|pnpm test:integration",
    "--verification-results",
    "Unit checks passed|Integration checks failed",
    "--acceptance-evidence",
    "Foundation complete=>Local work landed but integration regressed",
    "--test-evidence",
    "unit:pass:Unit checks passed|integration:fail:Integration checks failed",
  ]);

  assert.equal(result.code, 0);
  const updated = JSON.parse(await readFile(dagPath, "utf8"));
  assert.equal(updated.nodes[0].status, "validation_failed");
  assert.equal(updated.nodes[0].qa_status, "validation_failed");
  assert.equal(updated.nodes[0].validation_status, "failed");
  assert.equal(updated.nodes[1].status, "blocked_dependency");
  assert.deepEqual(updated.progression.runnable_nodes, []);
});

test("qa-decision fail records bug-loop state and writes a follow-up bug artifact", async () => {
  const cwd = await makeWorkspace();
  const dagPath = await writeDagFixture(cwd);

  await runOps(cwd, [
    "review-decision",
    "--dag",
    dagPath,
    "--issue",
    "31",
    "--node",
    "node-1",
    "--decision",
    "approve",
    "--approved-by",
    "solo-operator",
  ]);

  const result = await runOps(cwd, [
    "qa-decision",
    "--dag",
    dagPath,
    "--issue",
    "31",
    "--node",
    "node-1",
    "--decision",
    "fail",
    "--approved-by",
    "solo-operator",
    "--reason",
    "Regression found",
  ]);

  assert.equal(result.code, 0);
  const updated = JSON.parse(await readFile(dagPath, "utf8"));
  assert.equal(updated.nodes[0].status, "bug_loop");
  assert.equal(updated.nodes[0].qa_status, "failed");

  const feedbackDir = path.join(cwd, "docs", "agents", "feedback");
  const artifacts = await readdir(feedbackDir);
  assert.equal(artifacts.length, 2);
  const jsonPath = artifacts.find((entry) => entry.endsWith(".json"));
  const mdPath = artifacts.find((entry) => entry.endsWith(".md"));
  const json = JSON.parse(await readFile(path.join(feedbackDir, jsonPath), "utf8"));
  const markdown = await readFile(path.join(feedbackDir, mdPath), "utf8");
  assert.equal(json.classification, "follow-up-bug");
  assert.equal(json.node_id, "node-1");
  assert.match(markdown, /# Follow-up Bug Draft/);
});
