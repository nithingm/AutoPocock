import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, stat, utimes, writeFile } from "node:fs/promises";
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
  await mkdir(path.join(dir, "docs", "agents", "handoffs"), { recursive: true });
  await mkdir(path.join(dir, "docs", "agents", "completions"), { recursive: true });
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
            "write Surface": ["scripts/**", "tests/**"],
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
  assert.deepEqual(queue[0].writeSurface, ["scripts/**", "tests/**"]);
  assert.equal(queue[0].featureTrack, "github-export");
  assert.deepEqual(queue[0].labels, ["ready-for-agent", "enhancement"]);
});

test("github:export reports when the requested issue is absent from the exported project snapshot", async () => {
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
              title: "Another issue on the project",
              labels: [{ name: "enhancement" }, { name: "ready-for-agent" }],
            },
            fieldValues: [{ field: { name: "Execution Stage" }, value: { name: "Ready for Handoff" } }],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const result = await runOps(cwd, ["github:export", "--input", inputPath, "--output", outputPath, "--issue", "4"]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Exported 1 non-Done item/);
  assert.match(result.stdout, /Requested issue #4 was not found in the exported queue snapshot\./);
  assert.match(result.stdout, /Attach issue #4 to the configured GitHub Project or verify the project reference before scheduling\./);
  assert.match(result.stdout, /Re-run the visibility check with: pnpm ops github:export -- --issue 4/);
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

test("run --execute persists provider-run metadata and writes a real completion report", async () => {
  const cwd = await makeWorkspace();
  const handoffPath = path.join(cwd, "docs", "agents", "handoffs", "2026-05-14-23-proof.md");
  const completionPath = path.join(cwd, "docs", "agents", "completions", "dispatch-test-completion.md");
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    handoffPath,
    `# Context Handoff

## Goal

- Prove the execution boundary.

## Acceptance Criteria

- Persist Provider Run metadata.
- Write a real Completion Report.

## Verification

- Automated:
  - node --test
`,
  );
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        issue_id: "23",
        title: "Execution proof",
        status: "claimed",
        forbidden_actions: ["merge PR", "handle secrets"],
        expected_branch: "agent/execution-proof",
        isolation_mode: "worktree",
        worktree_path: path.join(cwd, ".worktrees", "execution-proof"),
        handoff_artifact: handoffPath,
        completion_report_target: completionPath,
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

  const result = await runOps(cwd, ["run", "--dispatch", dispatchPath, "--execute"]);
  const providerRunDir = path.join(cwd, ".ai", "provider-runs");
  const providerRunFiles = await readdir(providerRunDir);
  const metadataFile = providerRunFiles.find((entry) => /^provider-run-.*\.json$/.test(entry) && !entry.includes("-bundle."));
  const bundleFile = providerRunFiles.find((entry) => entry.includes("-bundle.json"));
  const metadata = JSON.parse(await readFile(path.join(providerRunDir, metadataFile), "utf8"));
  const bundle = JSON.parse(await readFile(path.join(providerRunDir, bundleFile), "utf8"));
  const loopSpec = JSON.parse(await readFile(metadata.loop_spec_path, "utf8"));
  const completion = await readFile(completionPath, "utf8");
  const stdoutLog = await readFile(metadata.stdout_log_path, "utf8");
  const stderrLog = await readFile(metadata.stderr_log_path, "utf8");

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Execution result:/);
  assert.match(result.stdout, /Provider: codex \(stub\)/);
  assert.match(result.stdout, /Provider Run status: succeeded/);
  assert.equal(metadata.provider, "codex");
  assert.equal(metadata.adapter_mode, "stub");
  assert.equal(metadata.status, "succeeded");
  assert.match(metadata.loop_spec_path, /docs[\\/]agents[\\/]loop-specs[\\/]dispatch-test-loop-spec\.json$/);
  assert.equal(bundle.provider, "codex");
  assert.equal(bundle.dispatch_id, "dispatch-test");
  assert.equal(bundle.loop_spec_id, loopSpec.loop_spec_id);
  assert.equal(loopSpec.goal, "Prove the execution boundary.");
  assert.deepEqual(loopSpec.acceptance_criteria, ["Persist Provider Run metadata.", "Write a real Completion Report."]);
  assert.equal(metadata.runtime.stop_condition, "Acceptance criteria are satisfied and verification is complete.");
  assert.equal(metadata.runtime.log_paths.stdout, metadata.stdout_log_path);
  assert.equal(metadata.runtime.log_paths.stderr, metadata.stderr_log_path);
  assert.equal(stdoutLog, "");
  assert.equal(stderrLog, "");
  assert.match(completion, /- Status: needs human review/);
  assert.match(completion, /Provider execution path succeeded through the Codex stub boundary/);
});

test("run --execute --stub-result blocked writes a blocked completion report", async () => {
  const cwd = await makeWorkspace();
  const handoffPath = path.join(cwd, "docs", "agents", "handoffs", "2026-05-14-23-proof.md");
  const completionPath = path.join(cwd, "docs", "agents", "completions", "dispatch-test-completion.md");
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    handoffPath,
    `# Context Handoff

## Goal

- Prove blocked execution handling.
`,
  );
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        issue_id: "23",
        title: "Execution blocked proof",
        status: "claimed",
        forbidden_actions: ["merge PR", "handle secrets"],
        expected_branch: "agent/execution-blocked-proof",
        isolation_mode: "branch",
        worktree_path: "",
        handoff_artifact: handoffPath,
        completion_report_target: completionPath,
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

  const result = await runOps(cwd, ["run", "--dispatch", dispatchPath, "--execute", "--stub-result", "blocked"]);
  const providerRunDir = path.join(cwd, ".ai", "provider-runs");
  const providerRunFiles = await readdir(providerRunDir);
  const metadataFile = providerRunFiles.find((entry) => /^provider-run-.*\.json$/.test(entry) && !entry.includes("-bundle."));
  const metadata = JSON.parse(await readFile(path.join(providerRunDir, metadataFile), "utf8"));
  const completion = await readFile(completionPath, "utf8");

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Provider Run status: blocked/);
  assert.equal(metadata.status, "blocked");
  assert.match(completion, /- Status: blocked/);
  assert.match(completion, /Provider execution blocked after bundle assembly/);
  assert.match(completion, /Suggested stage: Ready for Handoff/);
});

test("run --execute --live-provider persists live Codex metadata using a fake codex runner", async () => {
  const cwd = await makeWorkspace();
  const fakeCodexPath = path.join(cwd, "fake-codex.mjs");
  const handoffPath = path.join(cwd, "docs", "agents", "handoffs", "2026-05-14-23-proof.md");
  const completionPath = path.join(cwd, "docs", "agents", "completions", "dispatch-test-completion.md");
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    fakeCodexPath,
    `import { writeFile } from "node:fs/promises";
const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output-last-message");
const outputPath = outputIndex === -1 ? "" : args[outputIndex + 1];
if (outputPath) {
  await writeFile(outputPath, "Status: success\\nSummary: Live Codex adapter executed successfully.\\nVerification: Read the handoff artifact and returned a bounded result.\\nFollow-up: Review the generated completion artifact.\\n", "utf8");
}
process.stdout.write("fake codex exec ok\\n");
`,
  );
  await writeFile(
    handoffPath,
    `# Context Handoff

## Goal

- Prove the live execution boundary.
`,
  );
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        issue_id: "23",
        title: "Live execution proof",
        status: "claimed",
        forbidden_actions: ["merge PR", "handle secrets"],
        expected_branch: "agent/live-execution-proof",
        isolation_mode: "worktree",
        worktree_path: path.join(cwd, ".worktrees", "live-execution-proof"),
        handoff_artifact: handoffPath,
        completion_report_target: completionPath,
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

  const result = await runOps(cwd, ["run", "--dispatch", dispatchPath, "--execute", "--live-provider"], {
    env: {
      AUTOPOCOCK_CODEX_EXEC_SCRIPT: fakeCodexPath,
    },
  });
  const providerRunDir = path.join(cwd, ".ai", "provider-runs");
  const providerRunFiles = await readdir(providerRunDir);
  const metadataFile = providerRunFiles.find((entry) => /^provider-run-.*\.json$/.test(entry) && !entry.includes("-bundle."));
  const lastMessageFile = providerRunFiles.find((entry) => entry.endsWith("-last-message.txt"));
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.ok(metadataFile, `Expected provider-run metadata file in ${providerRunDir}. Files: ${providerRunFiles.join(", ")}`);
  assert.ok(lastMessageFile, `Expected Codex last-message file in ${providerRunDir}. Files: ${providerRunFiles.join(", ")}`);
  const metadata = JSON.parse(await readFile(path.join(providerRunDir, metadataFile), "utf8"));
  const completion = await readFile(completionPath, "utf8");
  const lastMessage = await readFile(path.join(providerRunDir, lastMessageFile), "utf8");

  assert.match(result.stdout, /Provider: codex \(live\)/);
  assert.match(result.stdout, /Provider Run status: succeeded/);
  assert.equal(metadata.adapter_mode, "live");
  assert.equal(metadata.status, "succeeded");
  assert.match(metadata.loop_spec_path, /docs[\\/]agents[\\/]loop-specs[\\/]dispatch-test-loop-spec\.json$/);
  assert.equal(metadata.runtime.stop_condition, "Acceptance criteria are satisfied and verification is complete.");
  assert.equal(metadata.runtime.log_paths.stdout, metadata.stdout_log_path);
  assert.equal(metadata.runtime.log_paths.stderr, metadata.stderr_log_path);
  assert.match(lastMessage, /Status: success/);
  assert.match(completion, /Live Codex adapter executed successfully/);
});

test("run --execute --live-provider succeeds when the Codex process waits for stdin to close", async () => {
  const cwd = await makeWorkspace();
  const fakeCodexPath = path.join(cwd, "fake-codex-needs-stdin-close.mjs");
  const handoffPath = path.join(cwd, "docs", "agents", "handoffs", "2026-05-14-23-proof.md");
  const completionPath = path.join(cwd, "docs", "agents", "completions", "dispatch-test-completion.md");
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    fakeCodexPath,
    `import { writeFile } from "node:fs/promises";
const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output-last-message");
const outputPath = outputIndex === -1 ? "" : args[outputIndex + 1];
let stdinData = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdinData += chunk;
});
process.stdin.on("end", async () => {
  if (outputPath) {
    await writeFile(outputPath, "Status: success\\nSummary: Live Codex adapter executed successfully after stdin closed.\\nVerification: stdin was closed explicitly by the runtime host.\\nFollow-up: Review the generated completion artifact.\\n", "utf8");
  }
  process.stdout.write("stdin-ended<" + stdinData + ">\\n");
});
`,
  );
  await writeFile(
    handoffPath,
    `# Context Handoff

## Goal

- Prove stdin-close handling for live execution.
`,
  );
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        issue_id: "33",
        title: "Live stdin-close proof",
        status: "claimed",
        forbidden_actions: ["merge PR", "handle secrets"],
        expected_branch: "agent/live-stdin-close-proof",
        isolation_mode: "worktree",
        worktree_path: path.join(cwd, ".worktrees", "live-stdin-close-proof"),
        handoff_artifact: handoffPath,
        completion_report_target: completionPath,
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

  const result = await runOps(cwd, ["run", "--dispatch", dispatchPath, "--execute", "--live-provider", "--provider-timeout-ms", "1000"], {
    env: {
      AUTOPOCOCK_CODEX_EXEC_SCRIPT: fakeCodexPath,
    },
  });
  const providerRunDir = path.join(cwd, ".ai", "provider-runs");
  const providerRunFiles = await readdir(providerRunDir);
  const metadataFile = providerRunFiles.find((entry) => /^provider-run-.*\.json$/.test(entry) && !entry.includes("-bundle."));
  const metadata = JSON.parse(await readFile(path.join(providerRunDir, metadataFile), "utf8"));
  const completion = await readFile(completionPath, "utf8");

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Provider Run status: succeeded/);
  assert.equal(metadata.status, "succeeded");
  assert.match(metadata.command_output.stdout, /stdin-ended<>/);
  assert.match(completion, /executed successfully after stdin closed/);
});

test("run --execute --live-provider writes blocked artifacts when Codex exceeds the timeout budget", async () => {
  const cwd = await makeWorkspace();
  const fakeCodexPath = path.join(cwd, "fake-codex-timeout.mjs");
  const handoffPath = path.join(cwd, "docs", "agents", "handoffs", "2026-05-14-23-proof.md");
  const completionPath = path.join(cwd, "docs", "agents", "completions", "dispatch-test-completion.md");
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    fakeCodexPath,
    `await new Promise((resolve) => setTimeout(resolve, 200));`,
  );
  await writeFile(
    handoffPath,
    `# Context Handoff

## Goal

- Prove timeout handling.
`,
  );
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        issue_id: "23",
        title: "Live timeout proof",
        status: "claimed",
        forbidden_actions: ["merge PR", "handle secrets"],
        expected_branch: "agent/live-timeout-proof",
        isolation_mode: "worktree",
        worktree_path: path.join(cwd, ".worktrees", "live-timeout-proof"),
        handoff_artifact: handoffPath,
        completion_report_target: completionPath,
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

  const result = await runOps(
    cwd,
    ["run", "--dispatch", dispatchPath, "--execute", "--live-provider", "--provider-timeout-ms", "50"],
    {
      env: {
        AUTOPOCOCK_CODEX_EXEC_SCRIPT: fakeCodexPath,
      },
    },
  );
  const providerRunDir = path.join(cwd, ".ai", "provider-runs");
  const providerRunFiles = await readdir(providerRunDir);
  const metadataFile = providerRunFiles.find((entry) => /^provider-run-.*\.json$/.test(entry) && !entry.includes("-bundle."));
  const metadata = JSON.parse(await readFile(path.join(providerRunDir, metadataFile), "utf8"));
  const completion = await readFile(completionPath, "utf8");

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Provider Run status: blocked/);
  assert.equal(metadata.adapter_mode, "live");
  assert.equal(metadata.status, "blocked");
  assert.equal(metadata.runtime.stop_condition, "The provider reports a blocked, cancelled, or timed-out result.");
  assert.match(metadata.runtime.escalation_reason, /Inspect the Provider Run metadata and provider output/);
  assert.match(completion, /- Status: blocked/);
  assert.match(completion, /exceeded the timeout budget of 50 ms/);
});

test("run --execute persists a blocked Provider Run when required handoff context is missing", async () => {
  const cwd = await makeWorkspace();
  const completionPath = path.join(cwd, "docs", "agents", "completions", "dispatch-test-completion.md");
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        issue_id: "30",
        title: "Missing handoff proof",
        status: "claimed",
        forbidden_actions: ["merge PR", "handle secrets"],
        expected_branch: "agent/missing-handoff-proof",
        isolation_mode: "worktree",
        worktree_path: path.join(cwd, ".worktrees", "missing-handoff-proof"),
        handoff_artifact: path.join(cwd, "docs", "agents", "handoffs", "missing.md"),
        completion_report_target: completionPath,
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

  const result = await runOps(cwd, ["run", "--dispatch", dispatchPath, "--execute"]);
  const providerRunDir = path.join(cwd, ".ai", "provider-runs");
  const providerRunFiles = await readdir(providerRunDir);
  const metadataFile = providerRunFiles.find((entry) => /^provider-run-.*\.json$/.test(entry) && !entry.includes("-bundle."));
  const metadata = JSON.parse(await readFile(path.join(providerRunDir, metadataFile), "utf8"));
  const completion = await readFile(completionPath, "utf8");

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Provider Run status: blocked/);
  assert.equal(metadata.status, "blocked");
  assert.equal(metadata.runtime.stop_condition, "required context artifact missing");
  assert.match(metadata.runtime.escalation_reason, /Restore the handoff artifact/);
  assert.match(completion, /required handoff artifact was missing/);
});

test("run --execute --live-provider --detach launches a background worker and run-status reports completion", async () => {
  const cwd = await makeWorkspace();
  const fakeCodexPath = path.join(cwd, "fake-codex-detached.mjs");
  const handoffPath = path.join(cwd, "docs", "agents", "handoffs", "2026-05-14-23-proof.md");
  const completionPath = path.join(cwd, "docs", "agents", "completions", "dispatch-test-completion.md");
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    fakeCodexPath,
    `import { writeFile } from "node:fs/promises";
const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output-last-message");
const outputPath = outputIndex === -1 ? "" : args[outputIndex + 1];
await new Promise((resolve) => setTimeout(resolve, 150));
if (outputPath) {
  await writeFile(outputPath, "Status: success\\nSummary: Detached Codex execution completed successfully.\\nVerification: Background worker read the handoff and finished.\\nFollow-up: Review the completion artifact.\\n", "utf8");
}
`,
  );
  await writeFile(
    handoffPath,
    `# Context Handoff

## Goal

- Prove detached execution.
`,
  );
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        issue_id: "23",
        title: "Detached execution proof",
        status: "claimed",
        forbidden_actions: ["merge PR", "handle secrets"],
        expected_branch: "agent/detached-execution-proof",
        isolation_mode: "worktree",
        worktree_path: path.join(cwd, ".worktrees", "detached-execution-proof"),
        handoff_artifact: handoffPath,
        completion_report_target: completionPath,
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

  const launch = await runOps(
    cwd,
    ["run", "--dispatch", dispatchPath, "--execute", "--live-provider", "--detach", "--provider-timeout-ms", "1000"],
    {
      env: {
        AUTOPOCOCK_CODEX_EXEC_SCRIPT: fakeCodexPath,
      },
    },
  );

  assert.equal(launch.code, 0, launch.stderr || launch.stdout);
  assert.match(launch.stdout, /Provider: codex \(live-detached\)/);
  assert.match(launch.stdout, /Provider Run status: running/);
  const metadataPath = launch.stdout.match(/Provider Run metadata: (.+\.json)/)?.[1]?.trim();
  assert.ok(metadataPath, `Expected metadata path in launch output:\n${launch.stdout}`);

  let statusResult = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    statusResult = await runOps(cwd, ["run-status", "--run", metadataPath]);
    if (/Status: succeeded/.test(statusResult.stdout)) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const completion = await readFile(completionPath, "utf8");

  assert.equal(statusResult.code, 0, statusResult?.stderr || statusResult?.stdout);
  assert.match(statusResult.stdout, /# Provider Run Status/);
  assert.match(statusResult.stdout, /Status: succeeded/);
  assert.match(statusResult.stdout, /Lifecycle: completed/);
  assert.match(statusResult.stdout, /Next action:/);
  assert.equal(metadata.adapter_mode, "live-detached");
  assert.equal(metadata.status, "succeeded");
  assert.match(completion, /Detached Codex execution completed successfully/);
});

test("run --execute --live-provider --detach succeeds when the Codex process waits for stdin to close", async () => {
  const cwd = await makeWorkspace();
  const fakeCodexPath = path.join(cwd, "fake-codex-detached-needs-stdin-close.mjs");
  const handoffPath = path.join(cwd, "docs", "agents", "handoffs", "2026-05-14-33-proof.md");
  const completionPath = path.join(cwd, "docs", "agents", "completions", "dispatch-test-completion.md");
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    fakeCodexPath,
    `import { writeFile } from "node:fs/promises";
const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output-last-message");
const outputPath = outputIndex === -1 ? "" : args[outputIndex + 1];
process.stdin.setEncoding("utf8");
let stdinData = "";
process.stdin.on("data", (chunk) => {
  stdinData += chunk;
});
process.stdin.on("end", async () => {
  if (outputPath) {
    await writeFile(outputPath, "Status: success\\nSummary: Detached Codex execution completed after stdin closed.\\nVerification: background worker closed stdin explicitly.\\nFollow-up: Review the completion artifact.\\n", "utf8");
  }
  process.stdout.write("stdin-ended<" + stdinData + ">\\n");
});
`,
  );
  await writeFile(
    handoffPath,
    `# Context Handoff

## Goal

- Prove detached stdin-close handling.
`,
  );
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        issue_id: "33",
        title: "Detached stdin-close proof",
        status: "claimed",
        forbidden_actions: ["merge PR", "handle secrets"],
        expected_branch: "agent/detached-stdin-close-proof",
        isolation_mode: "worktree",
        worktree_path: path.join(cwd, ".worktrees", "detached-stdin-close-proof"),
        handoff_artifact: handoffPath,
        completion_report_target: completionPath,
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

  const launch = await runOps(
    cwd,
    ["run", "--dispatch", dispatchPath, "--execute", "--live-provider", "--detach", "--provider-timeout-ms", "1000"],
    {
      env: {
        AUTOPOCOCK_CODEX_EXEC_SCRIPT: fakeCodexPath,
      },
    },
  );

  assert.equal(launch.code, 0, launch.stderr || launch.stdout);
  const metadataPath = launch.stdout.match(/Provider Run metadata: (.+\.json)/)?.[1]?.trim();
  assert.ok(metadataPath, `Expected metadata path in launch output:\n${launch.stdout}`);

  let statusResult = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    statusResult = await runOps(cwd, ["run-status", "--run", metadataPath]);
    if (/Status: succeeded/.test(statusResult.stdout)) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const completion = await readFile(completionPath, "utf8");

  assert.equal(statusResult.code, 0, statusResult?.stderr || statusResult?.stdout);
  assert.equal(metadata.status, "succeeded");
  assert.match(metadata.command_output.stdout, /stdin-ended<>/);
  assert.match(completion, /completed after stdin closed/);
});

test("run-cancel stops a detached provider run and persists a cancelled completion report", async () => {
  const cwd = await makeWorkspace();
  const fakeCodexPath = path.join(cwd, "fake-codex-cancel.mjs");
  const handoffPath = path.join(cwd, "docs", "agents", "handoffs", "2026-05-14-23-proof.md");
  const completionPath = path.join(cwd, "docs", "agents", "completions", "dispatch-test-completion.md");
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    fakeCodexPath,
    `await new Promise((resolve) => setTimeout(resolve, 5000));`,
  );
  await writeFile(
    handoffPath,
    `# Context Handoff

## Goal

- Prove detached cancellation.
`,
  );
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        issue_id: "23",
        title: "Detached cancellation proof",
        status: "claimed",
        forbidden_actions: ["merge PR", "handle secrets"],
        expected_branch: "agent/detached-cancellation-proof",
        isolation_mode: "worktree",
        worktree_path: path.join(cwd, ".worktrees", "detached-cancellation-proof"),
        handoff_artifact: handoffPath,
        completion_report_target: completionPath,
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

  const launch = await runOps(
    cwd,
    ["run", "--dispatch", dispatchPath, "--execute", "--live-provider", "--detach", "--provider-timeout-ms", "10000"],
    {
      env: {
        AUTOPOCOCK_CODEX_EXEC_SCRIPT: fakeCodexPath,
      },
    },
  );

  assert.equal(launch.code, 0, launch.stderr || launch.stdout);
  const metadataPath = launch.stdout.match(/Provider Run metadata: (.+\.json)/)?.[1]?.trim();
  assert.ok(metadataPath, `Expected metadata path in launch output:\n${launch.stdout}`);

  const cancel = await runOps(cwd, [
    "run-cancel",
    "--run",
    metadataPath,
    "--approved-by",
    "solo-operator",
    "--reason",
    "No longer needed",
  ]);

  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const completion = await readFile(completionPath, "utf8");
  const status = await runOps(cwd, ["run-status", "--run", metadataPath]);

  assert.equal(cancel.code, 0, cancel.stderr || cancel.stdout);
  assert.match(cancel.stdout, /Cancelled provider-run-/);
  assert.equal(metadata.status, "cancelled");
  assert.equal(metadata.cancelled.approved_by, "solo-operator");
  assert.match(completion, /- Status: cancelled/);
  assert.match(completion, /Provider Run was cancelled by solo-operator\. No longer needed/);
  assert.equal(status.code, 0, status.stderr || status.stdout);
  assert.match(status.stdout, /Status: cancelled/);
  assert.match(status.stdout, /Lifecycle: cancelled/);
  assert.match(status.stdout, /Cancellation reason: No longer needed/);
});

test("run-mirror renders a dry-run issue comment from provider-run metadata", async () => {
  const cwd = await makeWorkspace();
  const metadataPath = path.join(cwd, ".ai", "provider-runs", "provider-run-test.json");
  await mkdir(path.dirname(metadataPath), { recursive: true });
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        run_id: "provider-run-test",
        provider: "codex",
        adapter_mode: "live-detached",
        dispatch_id: "dispatch-test",
        issue_id: "23",
        status: "blocked",
        started_at: "2026-05-14T01:00:00.000Z",
        completed_at: "2026-05-14T01:05:00.000Z",
        completion_report_target: "docs/agents/completions/dispatch-test-completion.md",
        result: {
          summary: "Live Codex execution exceeded the timeout budget.",
          follow_ups: ["Retry with a narrower prompt."],
          gaps: ["Timed out."],
        },
      },
      null,
      2,
    )}\n`,
  );

  const result = await runOps(cwd, ["run-mirror", "--run", metadataPath]);

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /# Provider Run Mirror/);
  assert.match(result.stdout, /Mode: dry-run/);
  assert.match(result.stdout, /Target: issue #23/);
  assert.match(result.stdout, /- Status: blocked/);
  assert.match(result.stdout, /- Lifecycle: blocked/);
  assert.match(result.stdout, /- Summary: Live Codex execution exceeded the timeout budget\./);
  assert.match(result.stdout, /- Follow-up: Retry with a narrower prompt\./);
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

test("schedule --infer-conflicts skips queue items whose write surface overlaps active PR files", async () => {
  const cwd = await makeWorkspace({
    root: {
      schedulerDefaults: {
        reviewCapacity: 2,
      },
    },
  });
  const activePrsPath = path.join(cwd, "active-prs.json");
  await writeFile(
    activePrsPath,
    `${JSON.stringify(
      [
        {
          number: 77,
          title: "Touch scheduler code",
          files: [{ path: "scripts/ops.mjs" }],
        },
      ],
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(cwd, ".ai", "queue.json"),
    `${JSON.stringify(
      [
        {
          id: "ISSUE-10",
          title: "Scheduler-adjacent work",
          labels: ["enhancement", "ready-for-agent"],
          stage: "Ready for Handoff",
          queueClass: "tracer-bullet",
          risk: "low",
          dependency: "unblocked",
          conflictSurface: "low",
          writeSurface: ["scripts/**"],
        },
        {
          id: "ISSUE-11",
          title: "Docs-only work",
          labels: ["enhancement", "ready-for-agent"],
          stage: "Ready for Handoff",
          queueClass: "tracer-bullet",
          risk: "low",
          dependency: "unblocked",
          conflictSurface: "low",
          writeSurface: ["docs/**"],
        },
      ],
      null,
      2,
    )}\n`,
  );

  const result = await runOps(cwd, [
    "schedule",
    "--queue",
    ".ai/queue.json",
    "--infer-conflicts",
    "--active-prs-input",
    activePrsPath,
  ]);

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Conflict inference: enabled/);
  assert.match(result.stdout, /SKIP: ISSUE-10 Scheduler-adjacent work - inferred high conflict surface from active PR #77: scripts\/ops\.mjs overlaps scripts\/\*\*/);
  assert.match(result.stdout, /DISPATCH: ISSUE-11 Docs-only work - fits scheduler plan/);
});

test("manual dispatch auto-resolves only an exact handoff match for the requested issue", async () => {
  const cwd = await makeWorkspace();
  const handoffDir = path.join(cwd, "docs", "agents", "handoffs");
  await mkdir(handoffDir, { recursive: true });
  const wrongHandoffPath = path.join(handoffDir, "2026-05-14-123-implement-slice.md");
  const exactHandoffPath = path.join(handoffDir, "2026-05-14-12-manual-dispatch-validation.md");
  await writeFile(wrongHandoffPath, "# Context Handoff\n");
  await writeFile(exactHandoffPath, "# Context Handoff\n");

  const result = await runOps(cwd, [
    "dispatch",
    "--issue",
    "12",
    "--title",
    "Manual dispatch validation",
    "--source",
    "manual",
    "--override-reason",
    "Solo Operator approved",
  ]);

  const [dispatchPath] = result.stdout.trim().split(/\r?\n/);
  const artifact = JSON.parse(await readFile(dispatchPath, "utf8"));

  assert.equal(result.code, 0);
  assert.equal(artifact.handoff_artifact, exactHandoffPath);
});

test("manual dispatch refuses to create an artifact when no exact handoff matches the issue", async () => {
  const cwd = await makeWorkspace();
  const handoffDir = path.join(cwd, "docs", "agents", "handoffs");
  await mkdir(handoffDir, { recursive: true });
  await writeFile(path.join(handoffDir, "2026-05-14-123-implement-slice.md"), "# Context Handoff\n");

  const result = await runOps(cwd, [
    "dispatch",
    "--issue",
    "12",
    "--title",
    "Manual dispatch validation",
    "--source",
    "manual",
    "--override-reason",
    "Solo Operator approved",
  ]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Manual dispatch requires a matching handoff artifact for issue 12\./);
  assert.match(result.stderr, /pnpm ops handoff -- --issue 12 --title "Implement slice"/);
  assert.match(result.stderr, /--handoff <exact-path-to-handoff\.md>/);
});

test("manual dispatch rejects an explicit handoff artifact from a different issue", async () => {
  const cwd = await makeWorkspace();
  const handoffDir = path.join(cwd, "docs", "agents", "handoffs");
  await mkdir(handoffDir, { recursive: true });
  const wrongHandoffPath = path.join(handoffDir, "2026-05-14-123-implement-slice.md");
  await writeFile(wrongHandoffPath, "# Context Handoff\n");

  const result = await runOps(cwd, [
    "dispatch",
    "--issue",
    "12",
    "--title",
    "Manual dispatch validation",
    "--source",
    "manual",
    "--override-reason",
    "Solo Operator approved",
    "--handoff",
    wrongHandoffPath,
  ]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Manual dispatch handoff does not match issue 12:/);
  assert.match(result.stderr, new RegExp(escapeRegex(wrongHandoffPath)));
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

test("schedule reports recovery guidance when the requested issue is not scheduler-selected", async () => {
  const cwd = await makeWorkspace();
  await mkdir(path.join(cwd, "docs", "agents", "handoffs"), { recursive: true });
  await writeFile(
    path.join(cwd, ".ai", "queue.json"),
    `${JSON.stringify(
      [
        {
          id: "#1",
          title: "Dispatchable slice",
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
          id: "#4",
          title: "Active issue still blocked",
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
  await writeFile(path.join(cwd, "docs", "agents", "handoffs", "2026-05-14-1-dispatchable-slice.md"), "# Context Handoff\n");

  const result = await runOps(cwd, ["schedule", "--queue", ".ai/queue.json", "--dispatch", "--issue", "4"]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /DISPATCH: #1 Dispatchable slice - fits scheduler plan; consumes 1 review capacity/);
  assert.match(result.stdout, /SKIP: #4 Active issue still blocked - issue is missing the ready-for-agent label; add it to the GitHub issue to make the slice dispatchable/);
  assert.match(result.stdout, /Requested issue #4 was not selected by this scheduler run\./);
  assert.match(result.stdout, /Current decision for #4: SKIP - issue is missing the ready-for-agent label; add it to the GitHub issue to make the slice dispatchable/);
  assert.match(result.stdout, /Fix that gating reason and rerun: pnpm ops schedule -- --queue \.ai\/queue\.json --dispatch --issue 4/);
  assert.match(result.stdout, /If you must proceed outside the scheduler, create a manual dispatch with: pnpm ops dispatch -- --issue 4 --title "Active issue still blocked" --source manual --override-reason "Solo Operator approved scheduler mismatch"/);
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
  await assert.rejects(stat(`${dispatchPath}.lock`), { code: "ENOENT" });
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

test("claim refuses to mutate a dispatch while another claim lock is held", async () => {
  const cwd = await makeWorkspace();
  const dispatchPath = await writeDispatch(cwd, "dispatch-locked.json", {
    dispatch_id: "dispatch-locked",
    issue_id: "ISSUE-14",
    title: "Locked claim",
    status: "queued",
    isolation_mode: "worktree",
    worktree_path: "",
    forbidden_actions: ["merge PR"],
    expected_branch: "agent/issue-14-locked-claim",
    handoff_artifact: "",
    completion_report_target: "docs/agents/completions/dispatch-locked.md",
    claim: null,
  });
  await mkdir(`${dispatchPath}.lock`);

  const result = await runOps(cwd, ["claim", "--dispatch", dispatchPath, "--claimed-by", "runner-14"]);
  const artifact = JSON.parse(await readFile(dispatchPath, "utf8"));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Dispatch artifact is locked by another claim or reclaim operation/);
  assert.equal(artifact.status, "queued");
  assert.equal(artifact.claim, null);
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

test("worktree-clean deletes only stale unreferenced worktrees when applied", async () => {
  const cwd = await makeWorkspace();
  const worktreeRoot = path.join(cwd, ".worktrees");
  const referenced = path.join(worktreeRoot, "referenced");
  const providerReferenced = path.join(worktreeRoot, "provider-referenced");
  const staleUnreferenced = path.join(worktreeRoot, "stale-unreferenced");
  const youngUnreferenced = path.join(worktreeRoot, "young-unreferenced");
  await mkdir(referenced, { recursive: true });
  await mkdir(providerReferenced, { recursive: true });
  await mkdir(staleUnreferenced, { recursive: true });
  await mkdir(youngUnreferenced, { recursive: true });

  const oldDate = new Date(Date.now() - 3 * 60 * 60 * 1000);
  await utimes(referenced, oldDate, oldDate);
  await utimes(providerReferenced, oldDate, oldDate);
  await utimes(staleUnreferenced, oldDate, oldDate);

  await writeDispatch(cwd, "dispatch-referenced.json", {
    dispatch_id: "dispatch-referenced",
    issue_id: "ISSUE-WT",
    status: "claimed",
    worktree_path: referenced,
    claim: {
      claimed_by: "runner-wt",
      claimed_at: "2026-05-14T02:00:00.000Z",
      isolation_mode: "worktree",
    },
  });
  await mkdir(path.join(cwd, ".ai", "provider-runs"), { recursive: true });
  await writeFile(
    path.join(cwd, ".ai", "provider-runs", "provider-run-wt.json"),
    `${JSON.stringify(
      {
        run_id: "provider-run-wt",
        execution: {
          worktree_path: providerReferenced,
        },
      },
      null,
      2,
    )}\n`,
  );

  const dryRun = await runOps(cwd, ["worktree-clean", "--max-age-hours", "1"]);

  assert.equal(dryRun.code, 0, dryRun.stderr || dryRun.stdout);
  assert.match(dryRun.stdout, /Mode: dry-run/);
  assert.match(dryRun.stdout, new RegExp(`keep-referenced: ${escapeRegex(referenced)}`));
  assert.match(dryRun.stdout, new RegExp(`keep-referenced: ${escapeRegex(providerReferenced)}`));
  assert.match(dryRun.stdout, new RegExp(`delete: ${escapeRegex(staleUnreferenced)}`));
  assert.match(dryRun.stdout, new RegExp(`keep-young: ${escapeRegex(youngUnreferenced)}`));
  await stat(staleUnreferenced);

  const applied = await runOps(cwd, ["worktree-clean", "--max-age-hours", "1", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr || applied.stdout);
  assert.match(applied.stdout, /Mode: apply/);
  assert.match(applied.stdout, /Deleted: 1/);
  await stat(referenced);
  await stat(providerReferenced);
  await stat(youngUnreferenced);
  await assert.rejects(() => stat(staleUnreferenced));
});

test("ralph initializes a durable run state and prints the first wave", async () => {
  const cwd = await makeWorkspace();
  const planDir = path.join(cwd, "docs", "agents", "loop-specs");
  await mkdir(planDir, { recursive: true });
  const planPath = path.join(planDir, "plan-44.json");
  await writeFile(
    planPath,
    `${JSON.stringify(
      {
        schema_version: "ralph-run-plan/v1",
        plan_id: "plan-44",
        parent_issue: "44",
        waves: [
          {
            wave_id: "wave-0",
            issues: [
              {
                issue_id: "45",
                title: "Validation gate",
                worker_mode: "single",
                retry_budget: 3,
                verification_shape: ["node --test tests/validator.test.mjs"],
              },
            ],
            rationale: "Hard gate first.",
          },
          {
            wave_id: "wave-1",
            parallel: true,
            issues: [
              {
                issue_id: "46",
                title: "Regeneration sidecar",
                worker_mode: "parallel-worker-a",
                retry_budget: 3,
                verification_shape: ["node --test tests/regen.test.mjs"],
              },
              {
                issue_id: "48",
                title: "Wave planner",
                worker_mode: "parallel-worker-b",
                retry_budget: 3,
                verification_shape: ["node --test tests/wave.test.mjs"],
              },
            ],
            rationale: "Parallel sidecar wave.",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const result = await runOps(cwd, ["ralph", "--plan", planPath]);
  assert.equal(result.code, 0);
  const [statePath] = result.stdout.split(/\r?\n/).filter(Boolean);
  const state = JSON.parse(await readFile(statePath, "utf8"));

  assert.match(result.stdout, /# Ralph Run/);
  assert.match(result.stdout, /Current wave: wave-0/);
  assert.match(result.stdout, /#45 Validation gate/);
  assert.equal(state.schema_version, "ralph-run-state/v1");
  assert.equal(state.issue_states["45"].status, "pending");
});

test("ralph advances to the next wave after completion and preserves parallel runnable issues", async () => {
  const cwd = await makeWorkspace();
  const planDir = path.join(cwd, "docs", "agents", "loop-specs");
  await mkdir(planDir, { recursive: true });
  const planPath = path.join(planDir, "plan-44.json");
  await writeFile(
    planPath,
    `${JSON.stringify(
      {
        schema_version: "ralph-run-plan/v1",
        plan_id: "plan-44",
        parent_issue: "44",
        waves: [
          {
            wave_id: "wave-0",
            issues: [{ issue_id: "45", title: "Validation gate", worker_mode: "single", retry_budget: 3 }],
            rationale: "Hard gate first.",
          },
          {
            wave_id: "wave-1",
            parallel: true,
            issues: [
              { issue_id: "46", title: "Regeneration sidecar", worker_mode: "parallel-worker-a", retry_budget: 3 },
              { issue_id: "48", title: "Wave planner", worker_mode: "parallel-worker-b", retry_budget: 3 },
            ],
            rationale: "Parallel sidecar wave.",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  let result = await runOps(cwd, ["ralph", "--plan", planPath, "--complete", "45"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Current wave: wave-1/);
  assert.match(result.stdout, /#46 Regeneration sidecar/);
  assert.match(result.stdout, /#48 Wave planner/);

  result = await runOps(cwd, ["ralph", "--plan", planPath, "--block", "46", "--reason", "Needs clarification"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Wave-blocked issues:/);
  assert.match(result.stdout, /#46 Regeneration sidecar \(Needs clarification\)/);
  assert.match(result.stdout, /#48 Wave planner/);
});

test("ralph freeze suppresses runnable work until unfreeze", async () => {
  const cwd = await makeWorkspace();
  const planDir = path.join(cwd, "docs", "agents", "loop-specs");
  await mkdir(planDir, { recursive: true });
  const planPath = path.join(planDir, "plan-44.json");
  await writeFile(
    planPath,
    `${JSON.stringify(
      {
        schema_version: "ralph-run-plan/v1",
        plan_id: "plan-44",
        parent_issue: "44",
        waves: [
          {
            wave_id: "wave-0",
            issues: [{ issue_id: "45", title: "Validation gate", worker_mode: "single", retry_budget: 3 }],
            rationale: "Hard gate first.",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  let result = await runOps(cwd, ["ralph", "--plan", planPath, "--freeze", "--reason", "Shared foundation instability"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Global status: frozen/);
  assert.match(result.stdout, /Runnable issues:\n- None/);

  result = await runOps(cwd, ["ralph", "--plan", planPath, "--unfreeze"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Global status: active/);
  assert.match(result.stdout, /#45 Validation gate/);
});

test("ralph writes a wave approval bundle and refuses to start unapproved work", async () => {
  const cwd = await makeWorkspace();
  const planDir = path.join(cwd, "docs", "agents", "loop-specs");
  await mkdir(planDir, { recursive: true });
  const planPath = path.join(planDir, "plan-50.json");
  await writeFile(
    planPath,
    `${JSON.stringify(
      {
        schema_version: "ralph-run-plan/v1",
        plan_id: "plan-50",
        parent_issue: "50",
        control_policy: {
          approval_unit: "wave-bundle",
          max_parallel_agents: 2,
        },
        waves: [
          {
            wave_id: "wave-4",
            parallel: true,
            rationale: "Approval and progression can run together.",
            issues: [
              {
                issue_id: "50",
                dag_node_id: "node-wave-approval",
                title: "Add Wave-Bundle Approval",
                verification_shape: ["node --test tests/wave-approval-plane.test.mjs"],
                loop_spec: {
                  loop_spec_id: "loop-spec-wave-approval",
                  execution_contract: {
                    stop_conditions: ["Stop when approval preview is green."],
                    escalation_rules: ["Escalate on approval ambiguity."],
                  },
                },
              },
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  let result = await runOps(cwd, ["ralph", "--plan", planPath]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Wave approval status: pending/);
  assert.match(result.stdout, /Wave approval bundle:/);

  result = await runOps(cwd, ["ralph", "--plan", planPath, "--start", "50"]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /has not been approved/i);

  const approvalDir = path.join(cwd, "docs", "agents", "approvals");
  const approvalEntries = await readdir(approvalDir);
  assert.ok(approvalEntries.some((entry) => entry.endsWith(".json")));
  assert.ok(approvalEntries.some((entry) => entry.endsWith(".md")));
});

test("ralph approve-wave records durable approval and unlocks start", async () => {
  const cwd = await makeWorkspace();
  const planDir = path.join(cwd, "docs", "agents", "loop-specs");
  await mkdir(planDir, { recursive: true });
  const planPath = path.join(planDir, "plan-50.json");
  await writeFile(
    planPath,
    `${JSON.stringify(
      {
        schema_version: "ralph-run-plan/v1",
        plan_id: "plan-50",
        parent_issue: "50",
        control_policy: {
          approval_unit: "wave-bundle",
        },
        waves: [
          {
            wave_id: "wave-4",
            issues: [{ issue_id: "50", title: "Add Wave-Bundle Approval" }],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  let result = await runOps(cwd, ["ralph", "--plan", planPath, "--approve-wave", "wave-4", "--approved-by", "solo-operator"]);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Wave approval status: approved/);

  result = await runOps(cwd, ["ralph", "--plan", planPath, "--start", "50"]);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /attempts 1\/0/);
});
