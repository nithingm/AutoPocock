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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function writeDispatch(cwd, name, artifact) {
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", name);
  await writeFile(dispatchPath, `${JSON.stringify(artifact, null, 2)}\n`);
  return dispatchPath;
}

test("github:export refuses to run without a project reference", async () => {
  const cwd = await makeWorkspace();
  const result = await runOps(cwd, ["github:export"]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /GitHub project reference is required/);
  assert.match(result.stderr, /github\.projectUrl, github\.projectId, or github\.projectNumber/);
});

test("github:export missing gh guidance includes immediate and permanent recovery paths", async () => {
  const cwd = await makeWorkspace({
    github: {
      owner: "example",
      projectNumber: "7",
    },
  });
  const result = await runOps(cwd, ["github:export"], {
    env: {
      PATH: "",
    },
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /gh CLI is required for github:export/);
  assert.match(result.stderr, /Immediate recovery: rerun with --input <path-to-project-items\.json>/);
  assert.match(result.stderr, /Permanent fix: install gh from https:\/\/cli\.github\.com\/ and run `gh auth login`/);
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

test("github:export accepts flattened gh project item-list JSON", async () => {
  const cwd = await makeWorkspace();
  const inputPath = path.join(cwd, "project-items-flat.json");
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
              updatedAt: "2026-05-14T00:00:00Z",
            },
            labels: ["enhancement", "ready-for-agent"],
            "execution Stage": "Ready for Handoff",
            "execution Lane": "Handoff",
            "queue Class": "tracer-bullet",
            risk: "low",
            dependency: "unblocked",
            "conflict Surface": "low",
            "feature Track": "github-workflow",
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
  assert.equal(queue.length, 1);
  assert.equal(queue[0].stage, "Ready for Handoff");
  assert.equal(queue[0].lane, "Handoff");
  assert.equal(queue[0].queueClass, "tracer-bullet");
  assert.equal(queue[0].featureTrack, "github-workflow");
  assert.equal(queue[0].dependency, "unblocked");
  assert.deepEqual(queue[0].labels, ["enhancement", "ready-for-agent"]);
});

test("github:export keeps non-Done items stable when project fields are present but empty", async () => {
  const cwd = await makeWorkspace();
  const inputPath = path.join(cwd, "project-items-empty-fields.json");
  const outputPath = path.join(cwd, ".ai", "queue.json");
  await writeFile(
    inputPath,
    `${JSON.stringify(
      {
        items: [
          {
            content: {
              number: 7,
              url: "https://github.com/example/repo/issues/7",
              title: "Queue item with empty project fields",
            },
            fieldValues: [
              { field: { name: "Execution Stage" }, value: { name: "Ready for Handoff" } },
              { field: { name: "Execution Lane" }, value: { name: "" } },
              { field: { name: "Queue Class" }, value: { name: "" } },
              { field: { name: "Risk" }, value: { name: "" } },
              { field: { name: "Dependency" }, value: { name: "" } },
              { field: { name: "Conflict Surface" }, value: { name: "" } },
              { field: { name: "Feature Track" }, text: "" },
              { field: { name: "Dispatch ID" }, text: "" },
            ],
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
  assert.equal(queue.length, 1);
  assert.equal(queue[0].stage, "Ready for Handoff");
  assert.equal(queue[0].lane, "");
  assert.equal(queue[0].queueClass, "");
  assert.equal(queue[0].risk, "");
  assert.equal(queue[0].dependency, "");
  assert.equal(queue[0].conflictSurface, "");
  assert.equal(queue[0].featureTrack, "");
  assert.equal(queue[0].dispatchId, "");
});

test("github:export preserves scheduler fields from alternate top-level item shapes", async () => {
  const cwd = await makeWorkspace();
  const inputPath = path.join(cwd, "project-items-top-level.json");
  const outputPath = path.join(cwd, ".ai", "queue.json");
  await writeFile(
    inputPath,
    `${JSON.stringify(
      {
        items: [
          {
            id: "PVTI_alt_item",
            title: "Draft item without content wrapper",
            url: "https://github.com/orgs/example/projects/1/views/1?pane=issue&item=PVTI_alt_item",
            updatedAt: "2026-05-14T12:00:00Z",
            labels: [{ name: "ready-for-agent" }, { name: "enhancement" }],
            "execution Stage": "Ready for Handoff",
            "execution Lane": "Handoff",
            "queue Class": "routine-afk",
            risk: "low",
            dependency: "",
            "conflict Surface": "low",
            "feature Track": "github-export",
            "dispatch ID": "",
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
  assert.equal(queue.length, 1);
  assert.equal(queue[0].id, "PVTI_alt_item");
  assert.equal(queue[0].title, "Draft item without content wrapper");
  assert.equal(queue[0].stage, "Ready for Handoff");
  assert.equal(queue[0].lane, "Handoff");
  assert.equal(queue[0].queueClass, "routine-afk");
  assert.equal(queue[0].risk, "low");
  assert.equal(queue[0].dependency, "");
  assert.equal(queue[0].conflictSurface, "low");
  assert.equal(queue[0].featureTrack, "github-export");
  assert.deepEqual(queue[0].labels, ["ready-for-agent", "enhancement"]);
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

test("run resolves the latest claimed dispatch when it is the only relevant artifact", async () => {
  const cwd = await makeWorkspace();
  await writeDispatch(cwd, "dispatch-issue-16-queued.json", {
    dispatch_id: "dispatch-issue-16-queued",
    issue_id: "ISSUE-16",
    status: "queued",
    forbidden_actions: ["merge PR"],
    expected_branch: "agent/issue-16-queued",
    isolation_mode: "worktree",
    worktree_path: "D:\\temp\\queued",
    handoff_artifact: "",
    completion_report_target: "docs/agents/completions/dispatch-issue-16-queued.md",
    claim: null,
  });
  await writeDispatch(cwd, "dispatch-issue-16-claimed.json", {
    dispatch_id: "dispatch-issue-16-claimed",
    issue_id: "ISSUE-16",
    status: "claimed",
    forbidden_actions: ["merge PR", "handle secrets"],
    expected_branch: "agent/issue-16-claimed",
    isolation_mode: "worktree",
    worktree_path: "D:\\temp\\claimed",
    handoff_artifact: "docs/agents/handoffs/test.md",
    completion_report_target: "docs/agents/completions/dispatch-issue-16-claimed.md",
    claim: {
      claimed_by: "runner-16",
      claimed_at: "2026-05-14T02:00:00.000Z",
      isolation_mode: "worktree",
    },
  });

  const result = await runOps(cwd, ["run"]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Dispatch: dispatch-issue-16-claimed/);
  assert.match(result.stdout, /Claimed by: runner-16/);
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

test("schedule distinguishes a missing repo ready-for-agent label from a missing issue label", async () => {
  const missingIssueLabelCwd = await makeWorkspace();
  await writeFile(
    path.join(missingIssueLabelCwd, ".ai", "queue.json"),
    `${JSON.stringify(
      [
        {
          id: "ISSUE-4",
          title: "Label missing on issue",
          labels: ["enhancement"],
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

  const missingIssueLabel = await runOps(missingIssueLabelCwd, ["schedule", "--queue", ".ai/queue.json"]);

  assert.equal(missingIssueLabel.code, 0);
  assert.match(
    missingIssueLabel.stdout,
    /SKIP: ISSUE-4 Label missing on issue - issue is missing the ready-for-agent label; add it to the GitHub issue to make the slice dispatchable/,
  );

  const missingRepoLabelCwd = await makeWorkspace({
    root: {
      labels: {
        category: ["bug", "enhancement"],
        state: ["needs-triage"],
      },
    },
  });
  await writeFile(
    path.join(missingRepoLabelCwd, ".ai", "queue.json"),
    `${JSON.stringify(
      [
        {
          id: "ISSUE-5",
          title: "Repo label missing",
          labels: ["enhancement"],
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

  const missingRepoLabel = await runOps(missingRepoLabelCwd, ["schedule", "--queue", ".ai/queue.json"]);

  assert.equal(missingRepoLabel.code, 0);
  assert.match(
    missingRepoLabel.stdout,
    /SKIP: ISSUE-5 Repo label missing - repo config is missing the canonical ready-for-agent label; add it under labels\.state and create the matching GitHub label before dispatching/,
  );
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

test("claim resolves a queued dispatch by issue when that dispatch is unambiguous", async () => {
  const cwd = await makeWorkspace();
  const dispatchPath = await writeDispatch(cwd, "dispatch-issue-13.json", {
    dispatch_id: "dispatch-issue-13",
    issue_id: "ISSUE-13",
    title: "Claim by issue",
    status: "queued",
    isolation_mode: "worktree",
    worktree_path: "",
    forbidden_actions: ["merge PR"],
    expected_branch: "agent/issue-13-claim-by-issue",
    handoff_artifact: "",
    completion_report_target: "docs/agents/completions/dispatch-issue-13.md",
    claim: null,
  });

  const result = await runOps(cwd, ["claim", "--issue", "ISSUE-13", "--claimed-by", "runner-13"]);
  const artifact = JSON.parse(await readFile(dispatchPath, "utf8"));

  assert.equal(result.code, 0);
  assert.match(result.stdout, new RegExp(escapeRegex(dispatchPath)));
  assert.equal(artifact.status, "claimed");
  assert.equal(artifact.claim.claimed_by, "runner-13");
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

test("claim-status reports stale claimed dispatches without mutating them", async () => {
  const cwd = await makeWorkspace();
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        status: "claimed",
        forbidden_actions: ["merge PR"],
        expected_branch: "agent/test",
        isolation_mode: "worktree",
        worktree_path: "D:\\temp\\worktree",
        handoff_artifact: "",
        completion_report_target: "docs/agents/completions/dispatch-test.md",
        claim: {
          claimed_by: "runner-1",
          claimed_at: "2026-05-14T00:00:00.000Z",
          isolation_mode: "worktree",
        },
      },
      null,
      2,
    )}\n`,
  );

  const result = await runOps(cwd, ["claim-status", "--dispatch", dispatchPath, "--max-age-hours", "1"]);
  const artifact = JSON.parse(await readFile(dispatchPath, "utf8"));

  assert.equal(result.code, 0);
  assert.match(result.stdout, /# Claim Status/);
  assert.match(result.stdout, /Status: claimed/);
  assert.match(result.stdout, /Stale: yes/);
  assert.match(result.stdout, /Solo Operator action required/);
  assert.equal(artifact.status, "claimed");
});

test("claim-status prints exact follow-up commands when issue-based dispatch resolution is ambiguous", async () => {
  const cwd = await makeWorkspace();
  const firstPath = await writeDispatch(cwd, "dispatch-issue-14-a.json", {
    dispatch_id: "dispatch-issue-14-a",
    issue_id: "ISSUE-14",
    status: "claimed",
    forbidden_actions: ["merge PR"],
    expected_branch: "agent/test-a",
    isolation_mode: "worktree",
    worktree_path: "D:\\temp\\worktree-a",
    handoff_artifact: "",
    completion_report_target: "docs/agents/completions/dispatch-issue-14-a.md",
    claim: {
      claimed_by: "runner-a",
      claimed_at: "2026-05-14T00:00:00.000Z",
      isolation_mode: "worktree",
    },
  });
  const secondPath = await writeDispatch(cwd, "dispatch-issue-14-b.json", {
    dispatch_id: "dispatch-issue-14-b",
    issue_id: "ISSUE-14",
    status: "claimed",
    forbidden_actions: ["merge PR"],
    expected_branch: "agent/test-b",
    isolation_mode: "worktree",
    worktree_path: "D:\\temp\\worktree-b",
    handoff_artifact: "",
    completion_report_target: "docs/agents/completions/dispatch-issue-14-b.md",
    claim: {
      claimed_by: "runner-b",
      claimed_at: "2026-05-14T01:00:00.000Z",
      isolation_mode: "worktree",
    },
  });

  const result = await runOps(cwd, ["claim-status", "--issue", "ISSUE-14", "--max-age-hours", "1"]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Ambiguous dispatch resolution for claim-status/);
  assert.match(
    result.stderr,
    new RegExp(escapeRegex(`pnpm ops claim-status -- --dispatch ${firstPath} --max-age-hours 1`)),
  );
  assert.match(
    result.stderr,
    new RegExp(escapeRegex(`pnpm ops claim-status -- --dispatch ${secondPath} --max-age-hours 1`)),
  );
});

test("reclaim returns a claimed dispatch to queued only with recorded approval", async () => {
  const cwd = await makeWorkspace();
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        status: "claimed",
        forbidden_actions: ["merge PR"],
        expected_branch: "agent/test",
        isolation_mode: "worktree",
        worktree_path: "D:\\temp\\worktree",
        handoff_artifact: "",
        completion_report_target: "docs/agents/completions/dispatch-test.md",
        claim: {
          claimed_by: "runner-1",
          claimed_at: "2026-05-14T00:00:00.000Z",
          isolation_mode: "worktree",
        },
      },
      null,
      2,
    )}\n`,
  );

  const result = await runOps(cwd, [
    "reclaim",
    "--dispatch",
    dispatchPath,
    "--approved-by",
    "solo-operator",
    "--reason",
    "Runner abandoned work",
    "--max-age-hours",
    "1",
  ]);
  const artifact = JSON.parse(await readFile(dispatchPath, "utf8"));

  assert.equal(result.code, 0);
  assert.match(result.stdout, /returned to queued/);
  assert.equal(artifact.status, "queued");
  assert.equal(artifact.claim, null);
  assert.equal(artifact.claim_history.length, 1);
  assert.equal(artifact.claim_history[0].reclaimed_by, "solo-operator");
  assert.equal(artifact.claim_history[0].reclaim_reason, "Runner abandoned work");
  assert.equal(artifact.claim_history[0].stale_at_reclaim, true);
});

test("reclaim reports when no claimed dispatch matches the requested issue", async () => {
  const cwd = await makeWorkspace();
  await writeDispatch(cwd, "dispatch-issue-15.json", {
    dispatch_id: "dispatch-issue-15",
    issue_id: "ISSUE-15",
    status: "queued",
    forbidden_actions: ["merge PR"],
    expected_branch: "agent/test",
    isolation_mode: "worktree",
    worktree_path: "D:\\temp\\worktree",
    handoff_artifact: "",
    completion_report_target: "docs/agents/completions/dispatch-issue-15.md",
    claim: null,
  });

  const result = await runOps(cwd, [
    "reclaim",
    "--issue",
    "ISSUE-15",
    "--approved-by",
    "solo-operator",
    "--reason",
    "Runner abandoned work",
  ]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /No claimed dispatch found for issue ISSUE-15/);
});

test("run --prepare-worktree creates the worktree directory for claimed worktree dispatches", async () => {
  const cwd = await makeWorkspace();
  const worktreePath = path.join(cwd, ".worktrees", "issue-11-runner-setup");
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        status: "claimed",
        forbidden_actions: ["merge PR", "handle secrets"],
        expected_branch: "agent/issue-11-runner-setup",
        isolation_mode: "worktree",
        worktree_path: worktreePath,
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

  const result = await runOps(cwd, ["run", "--dispatch", dispatchPath, "--prepare-worktree"]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Worktree prepared: yes/);
  assert.match(result.stdout, /Worktree directory was prepared locally/);
  assert.ok((await stat(worktreePath)).isDirectory());
});

test("run --prepare-worktree rejects branch-isolated dispatches", async () => {
  const cwd = await makeWorkspace();
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        status: "claimed",
        forbidden_actions: ["merge PR", "handle secrets"],
        expected_branch: "agent/issue-12-branch-only",
        isolation_mode: "branch",
        worktree_path: "",
        handoff_artifact: "docs/agents/handoffs/test.md",
        completion_report_target: "docs/agents/completions/dispatch-test.md",
        claim: {
          claimed_by: "test-runner",
          claimed_at: "2026-05-14T00:00:00.000Z",
          isolation_mode: "branch",
        },
      },
      null,
      2,
    )}\n`,
  );

  const result = await runOps(cwd, ["run", "--dispatch", dispatchPath, "--prepare-worktree"]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /requires a worktree-isolated dispatch/);
});
