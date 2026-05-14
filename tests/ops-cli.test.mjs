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
  const dir = await mkdtemp(path.join(os.tmpdir(), "autopocock-"));
  await mkdir(path.join(dir, ".ai"), { recursive: true });
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
          ...(config.github || {}),
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
        ...(config.root || {}),
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

test("github:export refuses to run without a project reference", async () => {
  const cwd = await makeWorkspace();
  const result = await runOps(cwd, ["github:export"]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /GitHub project reference is required/);
});

test("github:export writes a non-Done queue snapshot from an input fixture", async () => {
  const cwd = await makeWorkspace();
  const inputPath = path.join(cwd, "project-items.json");
  const outputPath = path.join(cwd, ".ai", "queue.json");
  await writeFile(
    inputPath,
    `${JSON.stringify(
      {
        items: [
          {
            content: {
              number: 1,
              url: "https://github.com/example/repo/issues/1",
              title: "Ready slice",
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
              { field: { name: "Feature Track" }, text: "github-workflow" },
            ],
          },
          {
            content: {
              number: 2,
              url: "https://github.com/example/repo/issues/2",
              title: "Completed slice",
              labels: [{ name: "enhancement" }],
            },
            fieldValues: [{ field: { name: "Execution Stage" }, value: { name: "Done" } }],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const result = await runOps(cwd, ["github:export", "--input", inputPath, "--output", outputPath]);
  const queue = JSON.parse(await readFile(outputPath, "utf8"));

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Exported 1 non-Done item/);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].id, "#1");
  assert.equal(queue[0].stage, "Ready for Handoff");
  assert.equal(queue[0].queueClass, "tracer-bullet");
  assert.deepEqual(queue[0].labels, ["enhancement", "ready-for-agent"]);
});

test("run refuses dispatch artifacts that are not claimed", async () => {
  const cwd = await makeWorkspace();
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        status: "queued",
        forbidden_actions: ["merge PR"],
        expected_branch: "agent/test",
        isolation_mode: "branch",
        handoff_artifact: "",
        completion_report_target: "docs/agents/completions/dispatch-test.md",
        claim: null,
      },
      null,
      2,
    )}\n`,
  );

  const result = await runOps(cwd, ["run", "--dispatch", dispatchPath]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /is queued, not claimed/);
});

test("run validates a claimed dispatch without invoking a provider", async () => {
  const cwd = await makeWorkspace();
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        status: "claimed",
        forbidden_actions: ["merge PR", "handle secrets"],
        expected_branch: "agent/test",
        isolation_mode: "worktree",
        worktree_path: "D:\\temp\\worktree",
        handoff_artifact: "docs/agents/handoffs/test.md",
        completion_report_target: "docs/agents/completions/dispatch-test.md",
        claim: {
          claimed_by: "test-runner",
          claimed_at: "2026-05-14T00:00:00.000Z",
          isolation_mode: "worktree",
        },
      },
      null,
      2,
    )}\n`,
  );

  const result = await runOps(cwd, ["run", "--dispatch", dispatchPath]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Runner Plan/);
  assert.match(result.stdout, /Dispatch: dispatch-test/);
  assert.match(result.stdout, /Worktree path: D:\\temp\\worktree/);
  assert.match(result.stdout, /No provider was invoked/);
});

test("schedule --dispatch creates dispatch artifacts only for dispatchable queue items", async () => {
  const cwd = await makeWorkspace({
    root: {
      schedulerDefaults: {
        reviewCapacity: 2,
        riskCost: { low: 1, medium: 2, high: "approval-required" },
        bugLoopBeforeNewAfk: true,
      },
    },
  });
  await mkdir(path.join(cwd, "docs", "agents", "handoffs"), { recursive: true });
  await writeFile(
    path.join(cwd, ".ai", "queue.json"),
    `${JSON.stringify(
      [
        {
          id: "ISSUE-1",
          title: "Tracer bullet ready",
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
          id: "ISSUE-2",
          title: "Routine slice still gated",
          labels: ["enhancement", "ready-for-agent"],
          stage: "Ready for Handoff",
          lane: "Handoff",
          featureTrack: "ops-flow",
          queueClass: "routine-afk",
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
  await writeFile(
    path.join(cwd, "docs", "agents", "handoffs", "2026-05-14-ISSUE-1-ready.md"),
    "# Context Handoff\n",
  );

  const result = await runOps(cwd, ["schedule", "--queue", ".ai/queue.json", "--dispatch"]);
  const dispatchEntries = await readdir(path.join(cwd, "docs", "agents", "dispatches"));
  const jsonFile = dispatchEntries.find((entry) => entry.endsWith(".json"));
  const artifact = JSON.parse(await readFile(path.join(cwd, "docs", "agents", "dispatches", jsonFile), "utf8"));

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Dispatch mode: enabled/);
  assert.match(result.stdout, /DISPATCH: ISSUE-1 Tracer bullet ready/);
  assert.match(result.stdout, /SKIP: ISSUE-2 Routine slice still gated - feature track tracer bullet is not done/);
  assert.equal(dispatchEntries.filter((entry) => entry.endsWith(".json")).length, 1);
  assert.equal(artifact.issue_id, "ISSUE-1");
  assert.equal(artifact.source, "scheduler-plan");
  assert.equal(artifact.isolation_mode, "worktree");
  assert.match(artifact.worktree_path, /\.worktrees[\\/]issue-1-tracer-bullet-ready$/);
  assert.match(artifact.created_from_scheduler_plan, /docs[\\/]agents[\\/]schedules[\\/].+scheduler-plan\.md$/);
  assert.match(artifact.handoff_artifact, /docs[\\/]agents[\\/]handoffs[\\/].+ISSUE-1.+\.md$/);
});

test("schedule --dispatch reports when no dispatch artifacts are created", async () => {
  const cwd = await makeWorkspace();
  await writeFile(
    path.join(cwd, ".ai", "queue.json"),
    `${JSON.stringify(
      [
        {
          id: "ISSUE-3",
          title: "Blocked slice",
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

  const result = await runOps(cwd, ["schedule", "--queue", ".ai/queue.json", "--dispatch"]);
  const dispatchEntries = await readdir(path.join(cwd, "docs", "agents", "dispatches"));

  assert.equal(result.code, 0);
  assert.match(result.stdout, /No dispatch artifacts were created\./);
  assert.equal(dispatchEntries.length, 0);
});

test("claim preserves worktree isolation and derives a worktree path when needed", async () => {
  const cwd = await makeWorkspace();
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        issue_id: "ISSUE-9",
        title: "Runner bridge",
        status: "queued",
        isolation_mode: "worktree",
        worktree_path: "",
        forbidden_actions: ["merge PR"],
        expected_branch: "agent/issue-9-runner-bridge",
        handoff_artifact: "",
        completion_report_target: "docs/agents/completions/dispatch-test.md",
        claim: null,
      },
      null,
      2,
    )}\n`,
  );

  const result = await runOps(cwd, ["claim", "--dispatch", dispatchPath, "--claimed-by", "runner-1"]);
  const artifact = JSON.parse(await readFile(dispatchPath, "utf8"));

  assert.equal(result.code, 0);
  assert.equal(artifact.claim.isolation_mode, "worktree");
  assert.match(artifact.worktree_path, /\.worktrees[\\/]issue-9-runner-bridge$/);
});

test("claim rejects isolation mode mismatches", async () => {
  const cwd = await makeWorkspace();
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        issue_id: "ISSUE-10",
        title: "Isolation mismatch",
        status: "queued",
        isolation_mode: "worktree",
        worktree_path: "",
        forbidden_actions: ["merge PR"],
        expected_branch: "agent/issue-10-isolation-mismatch",
        handoff_artifact: "",
        completion_report_target: "docs/agents/completions/dispatch-test.md",
        claim: null,
      },
      null,
      2,
    )}\n`,
  );

  const result = await runOps(cwd, [
    "claim",
    "--dispatch",
    dispatchPath,
    "--claimed-by",
    "runner-1",
    "--isolation-mode",
    "branch",
  ]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /does not match dispatch isolation mode worktree/);
});

test("run rejects worktree dispatches that are missing worktree_path", async () => {
  const cwd = await makeWorkspace();
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        status: "claimed",
        forbidden_actions: ["merge PR", "handle secrets"],
        expected_branch: "agent/test",
        isolation_mode: "worktree",
        worktree_path: "",
        handoff_artifact: "docs/agents/handoffs/test.md",
        completion_report_target: "docs/agents/completions/dispatch-test.md",
        claim: {
          claimed_by: "test-runner",
          claimed_at: "2026-05-14T00:00:00.000Z",
          isolation_mode: "worktree",
        },
      },
      null,
      2,
    )}\n`,
  );

  const result = await runOps(cwd, ["run", "--dispatch", dispatchPath]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /missing worktree_path/);
});
