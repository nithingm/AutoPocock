import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const opsScript = path.join(repoRoot, "scripts", "ops.mjs");

async function makeWorkspace() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "autopocock-smoke-"));
  await mkdir(path.join(dir, ".ai"), { recursive: true });
  await writeFile(
    path.join(dir, ".ai", "ops.config.json"),
    `${JSON.stringify(
      {
        tracker: "github",
        github: {
          owner: "example",
          repo: "repo",
          projectUrl: "",
          projectId: "",
          projectNumber: "7",
        },
        labels: {
          category: ["bug", "enhancement"],
          state: ["needs-triage", "ready-for-agent"],
        },
        projectSchema: {
          requiredFields: [],
          recommendedViews: [],
        },
        schedulerDefaults: {
          reviewCapacity: 1,
          bugLoopBeforeNewAfk: false,
        },
        queueFile: ".ai/queue.json",
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

async function latestFile(dir, pattern) {
  const entries = (await readdir(dir))
    .filter((entry) => pattern.test(entry))
    .sort();
  assert.ok(entries.length > 0, `Expected a file matching ${pattern} in ${dir}`);
  return path.join(dir, entries.at(-1));
}

test("manual smoke test chains canonical artifacts locally with a GitHub export fixture", async () => {
  const cwd = await makeWorkspace();
  const commandsRun = [];

  async function run(args) {
    commandsRun.push(`node ${opsScript} ${args.join(" ")}`);
    return runOps(cwd, args);
  }

  const init = await run(["init"]);
  assert.equal(init.code, 0);
  assert.match(init.stdout, /Workflow structure is initialized/);

  const context = await run(["context", "--title", "Canonical Manual Smoke"]);
  assert.equal(context.code, 0);
  const contextPath = context.stdout.trim();

  const contextApprove = await run(["context-approve", "--context", contextPath, "--approved-by", "solo-operator"]);
  assert.equal(contextApprove.code, 0);

  const prd = await run(["prd", "--title", "Canonical Manual Smoke"]);
  assert.equal(prd.code, 0);
  const prdPath = prd.stdout.trim();
  await writeFile(
    prdPath,
    `# Canonical Manual Smoke

## Approval

- Status: approved
- Approved by: solo-operator
- Source context: ${contextPath}
- Source context status: approved

## Problem

- The manual operating system needs one deterministic end-to-end gate.
- The gate should prove the canonical artifact chain still works locally.

## User Value

- Operators can change the manual OS with one fast smoke check before runner automation.

## Scope

- In scope: the canonical artifact chain from PRD through feedback.
- Out of scope: live GitHub mutation and provider execution.

## Acceptance Criteria

- [ ] Chain generated manual artifacts together from PRD through feedback.
- [ ] Use local or fixture-backed data wherever live GitHub calls are unnecessary.
- [ ] Leave a deterministic gate for future manual-OS changes before automation work begins.
`,
    "utf8",
  );

  const prdApprove = await run(["prd-approve", "--prd", prdPath, "--approved-by", "solo-operator"]);
  assert.equal(prdApprove.code, 0);

  const issues = await run(["issues", "--prd", prdPath]);
  assert.equal(issues.code, 0);
  const issuesPath = issues.stdout.trim();
  const issuesMarkdown = await readFile(issuesPath, "utf8");
  assert.match(issuesMarkdown, /Implementation 1: Chain generated manual artifacts together from PRD through feedback\./);
  assert.match(issuesMarkdown, /Source PRD: \d{4}-\d{2}-\d{2}-canonical-manual-smoke\.md/);

  const handoff = await run(["handoff", "--issue", "17", "--title", "Canonical manual smoke slice"]);
  assert.equal(handoff.code, 0);
  const handoffPath = handoff.stdout.trim();
  await writeFile(
    handoffPath,
    `# Context Handoff

## Issue

- Tracker: 17
- Title: Canonical manual smoke slice
- Labels: enhancement, ready-for-agent
- Execution stage: Ready for Handoff

## Goal

- Prove the canonical manual loop can chain generated artifacts together with fixture-backed tracker input.

## Boundaries

- In scope: PRD, issue decomposition, handoff, queue export, schedule, dispatch claim, runner plan, completion, review prep, QA, and feedback.
- Out of scope: live GitHub mutation, provider execution, and unrelated cleanup.
- Likely touched areas: scripts/ops.mjs, scripts/prd.mjs, scripts/issues.mjs, scripts/qa.mjs, tests/issue17-manual-smoke.test.mjs

## Context

- PRD: ${prdPath}
- Workflow artifacts: ${issuesPath}
- Domain terms: manual OS, Artifact Layer, Operational Tracker
- ADRs: None

## Dependencies

- Blockers: None
- Related issues: None
- Conflict risks: Low

## Verification

- Automated: node --test tests/issue17-manual-smoke.test.mjs
- Manual: Inspect the generated chain end to end.
- Evidence expected: queue snapshot, dispatch artifact, review prep, QA checklist, and feedback artifact.

## Completion

- Report back: completion report for issue 17
- Artifacts to update: completion, review prep, QA, feedback
- PR or commit expectation: local smoke-only changes
- Next suggested stage: Human Review
`,
    "utf8",
  );

  const exportFixturePath = path.join(cwd, "project-items.json");
  await writeFile(
    exportFixturePath,
    `${JSON.stringify(
      {
        items: [
          {
            content: {
              number: 17,
              url: "https://github.com/example/repo/issues/17",
              title: "Canonical manual smoke slice",
              labels: [{ name: "enhancement" }, { name: "ready-for-agent" }],
              updatedAt: "2026-05-14T00:00:00Z",
            },
            fieldValues: [
              { field: { name: "Execution Stage" }, value: { name: "Ready for Handoff" } },
              { field: { name: "Execution Lane" }, value: { name: "Handoff" } },
              { field: { name: "Queue Class" }, value: { name: "tracer-bullet" } },
              { field: { name: "Risk" }, value: { name: "low" } },
              { field: { name: "Dependency" }, value: { name: "unblocked" } },
              { field: { name: "Conflict Surface" }, value: { name: "low" } },
              { field: { name: "Feature Track" }, text: "manual-os" },
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const exportResult = await run(["github:export", "--input", exportFixturePath, "--output", ".ai/queue.json"]);
  assert.equal(exportResult.code, 0);
  const queue = JSON.parse(await readFile(path.join(cwd, ".ai", "queue.json"), "utf8"));
  assert.equal(queue.length, 1);
  assert.equal(queue[0].id, "#17");
  assert.deepEqual(queue[0].labels, ["enhancement", "ready-for-agent"]);

  const schedule = await run(["schedule", "--queue", ".ai/queue.json", "--dispatch"]);
  assert.equal(schedule.code, 0);
  assert.match(schedule.stdout, /DISPATCH: #17 Canonical manual smoke slice/);
  const dispatchPath = await latestFile(path.join(cwd, "docs", "agents", "dispatches"), /\.json$/);
  const dispatchArtifact = JSON.parse(await readFile(dispatchPath, "utf8"));
  assert.equal(dispatchArtifact.issue_id, "#17");
  assert.equal(dispatchArtifact.handoff_artifact, handoffPath);
  assert.equal(dispatchArtifact.status, "queued");

  const claim = await run(["claim", "--dispatch", dispatchPath, "--claimed-by", "smoke-runner", "--isolation-mode", "worktree"]);
  assert.equal(claim.code, 0);

  const runResult = await run(["run", "--dispatch", dispatchPath, "--prepare-worktree"]);
  assert.equal(runResult.code, 0);
  assert.match(runResult.stdout, /Worktree prepared: yes/);
  assert.ok((await stat(dispatchArtifact.worktree_path)).isDirectory());

  const complete = await run(["complete", "--issue", "17", "--status", "needs human review"]);
  assert.equal(complete.code, 0);
  const completionPath = complete.stdout.trim();
  await writeFile(
    completionPath,
    `# Completion Report

## Result

- Status: needs human review
- Summary: Exercised the canonical manual loop end to end with chained local artifacts and a fixture-backed queue export.
- Reason: Issue 17 requires a deterministic smoke gate before automation work begins.

## Changes

- Files or areas changed: tests/issue17-manual-smoke.test.mjs

## Verification

- Commands run: node --test tests/issue17-manual-smoke.test.mjs
- Results: The canonical artifact chain completed locally through QA and feedback.
- Gaps: None

## Risks

- Residual risks: github:init still depends on live gh state and is not fixture-backed in this smoke path.

## Follow-ups

- Bugs: None
- Issues: None

## Artifacts

- Updated: ${prdPath}, ${issuesPath}, ${handoffPath}, ${dispatchPath}

## Next Stage

- Suggested stage: Human Review

## Issue

- Tracker: #17
`,
    "utf8",
  );

  const reviewPrep = await run([
    "review-prep",
    "--issue",
    "17",
    "--completion",
    completionPath,
    "--pr",
    "170",
    "--acceptance",
    "Chain generated manual artifacts together from PRD through feedback|Use local or fixture-backed data wherever live GitHub calls are unnecessary|Leave a deterministic gate for future manual-OS changes before automation work begins",
    "--dependency-changes",
    "None",
    "--local-refactors",
    "None",
  ]);
  assert.equal(reviewPrep.code, 0);
  const reviewPrepPath = reviewPrep.stdout.trim();
  const reviewPrepMarkdown = await readFile(reviewPrepPath, "utf8");
  assert.match(reviewPrepMarkdown, /Criteria addressed:/);
  assert.match(reviewPrepMarkdown, /Chain generated manual artifacts together from PRD through feedback/);

  const qa = await run(["qa", "--issue", "17", "--pr", "170"]);
  assert.equal(qa.code, 0);
  const qaPath = qa.stdout.trim();
  const qaMarkdown = await readFile(qaPath, "utf8");
  assert.match(qaMarkdown, /Mode: strict-targeted/);
  assert.match(qaMarkdown, /QA status: pass/);
  assert.ok(qaMarkdown.includes(`Handoff Artifact: ${handoffPath}`));
  assert.ok(qaMarkdown.includes(`Completion Report: ${completionPath}`));
  assert.ok(qaMarkdown.includes(`Review Prep: ${reviewPrepPath}`));

  const feedback = await run([
    "feedback",
    "--issue",
    "17",
    "--pr",
    "170",
    "--finding",
    "Title: Manual smoke documentation gap\nEvidence: The canonical loop still depends on a live github:init check.\nExpected: The smoke path should stay local or fixture-backed wherever possible.\nActual: github:init remains outside the fixture-backed chain.\nVerification: Keep this as a documented follow-up instead of widening the smoke gate.",
  ]);
  assert.equal(feedback.code, 0);
  assert.match(feedback.stdout, /Classification: new-bug-draft/);
  const feedbackJsonPath = await latestFile(path.join(cwd, "docs", "agents", "feedback"), /\.json$/);
  const feedbackMarkdownPath = await latestFile(path.join(cwd, "docs", "agents", "feedback"), /\.md$/);
  const feedbackArtifact = JSON.parse(await readFile(feedbackJsonPath, "utf8"));
  const feedbackMarkdown = await readFile(feedbackMarkdownPath, "utf8");
  assert.equal(feedbackArtifact.issue, "#17");
  assert.equal(feedbackArtifact.pr, "#170");
  assert.match(feedbackMarkdown, /No GitHub issue or comment was created\./);

  assert.deepEqual(commandsRun, [
    `node ${opsScript} init`,
    `node ${opsScript} context --title Canonical Manual Smoke`,
    `node ${opsScript} context-approve --context ${contextPath} --approved-by solo-operator`,
    `node ${opsScript} prd --title Canonical Manual Smoke`,
    `node ${opsScript} prd-approve --prd ${prdPath} --approved-by solo-operator`,
    `node ${opsScript} issues --prd ${prdPath}`,
    `node ${opsScript} handoff --issue 17 --title Canonical manual smoke slice`,
    `node ${opsScript} github:export --input ${exportFixturePath} --output .ai/queue.json`,
    `node ${opsScript} schedule --queue .ai/queue.json --dispatch`,
    `node ${opsScript} claim --dispatch ${dispatchPath} --claimed-by smoke-runner --isolation-mode worktree`,
    `node ${opsScript} run --dispatch ${dispatchPath} --prepare-worktree`,
    `node ${opsScript} complete --issue 17 --status needs human review`,
    `node ${opsScript} review-prep --issue 17 --completion ${completionPath} --pr 170 --acceptance Chain generated manual artifacts together from PRD through feedback|Use local or fixture-backed data wherever live GitHub calls are unnecessary|Leave a deterministic gate for future manual-OS changes before automation work begins --dependency-changes None --local-refactors None`,
    `node ${opsScript} qa --issue 17 --pr 170`,
    `node ${opsScript} feedback --issue 17 --pr 170 --finding Title: Manual smoke documentation gap\nEvidence: The canonical loop still depends on a live github:init check.\nExpected: The smoke path should stay local or fixture-backed wherever possible.\nActual: github:init remains outside the fixture-backed chain.\nVerification: Keep this as a documented follow-up instead of widening the smoke gate.`,
  ]);
});
