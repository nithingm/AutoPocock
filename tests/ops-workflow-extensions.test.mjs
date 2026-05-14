import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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

async function runOps(cwd, args) {
  try {
    const result = await execFileAsync(process.execPath, [opsScript, ...args], {
      cwd,
      windowsHide: true,
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

test("init creates the durable memory proposals directory", async () => {
  const cwd = await makeWorkspace();

  const result = await runOps(cwd, ["init"]);
  const entries = await readdir(path.join(cwd, "docs", "agents"));

  assert.equal(result.code, 0);
  assert.ok(entries.includes("memory-proposals"));
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

  assert.equal(result.code, 0);
  assert.match(result.stdout, /# Feedback Classification/);
  assert.match(result.stdout, /Classification: same-pr-fix/);
  assert.match(result.stdout, /Solo Operator approval required: yes/);
  assert.match(result.stdout, /No GitHub issue or comment was created\./);
});
