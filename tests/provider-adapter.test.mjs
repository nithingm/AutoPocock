import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createProviderRegistry, getProvider } from "../scripts/lib/providers/index.mjs";
import { createClaudeProvider } from "../scripts/lib/providers/claude-provider.mjs";
import { createCodexProvider } from "../scripts/lib/providers/codex-provider.mjs";
import { runClaudePrint } from "../scripts/lib/claude-exec.mjs";

test("CodexProvider reports readiness through the shared provider contract", async () => {
  const calls = [];
  const provider = createCodexProvider({
    cwd: "d:\\Projects\\AutoPocock",
    commandAvailable: async (command, args = ["--version"]) => {
      calls.push([command, args]);
      if (command === "codex" && args[0] === "--version") {
        return { available: true, stdout: "codex 1.0.0", stderr: "" };
      }
      if (command === "codex" && args[0] === "login") {
        return { available: true, stdout: "logged in", stderr: "" };
      }
      return { available: false, stdout: "", stderr: "missing" };
    },
  });

  const availability = await provider.isAvailable({ requireLogin: true });

  assert.equal(availability.available, true);
  assert.equal(availability.ready, true);
  assert.equal(availability.authenticated, true);
  assert.deepEqual(calls, [
    ["codex", ["--version"]],
    ["codex", ["login", "status"]],
  ]);
});

test("provider registry exposes Codex and Claude Code adapters", () => {
  const registry = createProviderRegistry({
    cwd: "d:\\Projects\\AutoPocock",
    commandAvailable: async () => ({ available: true, stdout: "", stderr: "" }),
  });

  assert.equal(registry.codex.name, "codex");
  assert.equal(registry.claude.name, "claude");
  assert.equal(registry["claude-code"].name, "claude");
  assert.equal(getProvider("claude-code", {
    cwd: "d:\\Projects\\AutoPocock",
    commandAvailable: async () => ({ available: true, stdout: "", stderr: "" }),
  }).name, "claude");
});

test("ClaudeProvider reports readiness through the shared provider contract", async () => {
  const calls = [];
  const provider = createClaudeProvider({
    cwd: "d:\\Projects\\AutoPocock",
    commandAvailable: async (command, args = ["--version"]) => {
      calls.push([command, args]);
      if (command === "claude" && args[0] === "--version") {
        return { available: true, stdout: "1.0.0", stderr: "" };
      }
      if (command === "claude" && args[0] === "auth") {
        return { available: true, stdout: "Authenticated", stderr: "" };
      }
      return { available: false, stdout: "", stderr: "missing" };
    },
  });

  const availability = await provider.isAvailable({ requireLogin: true });

  assert.equal(availability.available, true);
  assert.equal(availability.ready, true);
  assert.equal(availability.authenticated, true);
  assert.deepEqual(calls, [
    ["claude", ["--version"]],
    ["claude", ["auth", "status"]],
  ]);
});

test("ClaudeProvider renders a Claude Code prompt bundle from a provider-neutral bundle", () => {
  const provider = createClaudeProvider({
    cwd: "d:\\Projects\\AutoPocock",
    commandAvailable: async () => ({ available: true, stdout: "", stderr: "" }),
  });

  const promptBundle = provider.renderPromptBundle({
    loopSpec: {
      loop_spec_id: "loop-spec-dispatch-claude",
      dispatch_id: "dispatch-claude",
      issue_id: "57",
      goal: "Prove the shared provider contract with Claude Code.",
      owned_surface: ["scripts/lib/providers/*"],
      acceptance_criteria: ["Render a Claude provider prompt from Loop Spec data."],
      verification_plan: {
        automated: ["node --test tests/provider-adapter.test.mjs"],
        manual: [],
      },
      boundaries: {
        forbidden_actions: ["modify unrelated files"],
      },
    },
  });

  assert.match(promptBundle.prompt, /Validate one bounded AutoPocock dispatch using Claude Code print mode\./);
  assert.match(promptBundle.prompt, /Loop Spec ID: loop-spec-dispatch-claude/);
  assert.match(promptBundle.prompt, /Dispatch: dispatch-claude/);
  assert.match(promptBundle.prompt, /Goal: Prove the shared provider contract with Claude Code\./);
  assert.equal(promptBundle.output_format, "status-summary-verification-follow-up");
});

test("ClaudeProvider collects a successful live result with Claude-specific follow-up text", () => {
  const provider = createClaudeProvider({
    cwd: "d:\\Projects\\AutoPocock",
    commandAvailable: async () => ({ available: true, stdout: "", stderr: "" }),
  });

  const collected = provider.collectArtifacts({
    bundle: {
      provider: "claude",
      dispatch_id: "dispatch-claude",
      handoff_artifact: "d:\\Projects\\AutoPocock\\docs\\agents\\handoffs\\claude.md",
    },
    handoffArtifact: "d:\\Projects\\AutoPocock\\docs\\agents\\handoffs\\claude.md",
    verificationCommand: "pnpm ops run -- --dispatch <dispatch> --execute --live-provider --provider claude",
    timeoutMs: 1000,
    finalMessage: [
      "Status: success",
      "Summary: Live Claude adapter executed successfully.",
      "Verification: Read the handoff artifact and returned a bounded result.",
      "Follow-up: Review the generated completion artifact.",
    ].join("\n"),
    commandStdout: "ok",
    commandStderr: "",
  });

  assert.equal(collected.providerRunStatus, "succeeded");
  assert.equal(collected.result.status, "needs human review");
  assert.match(collected.result.summary, /Claude adapter executed successfully/);
  assert.match(collected.result.risks.join(" | "), /Live Claude execution/);
});

test("runClaudePrint captures Claude print output as the final provider message", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "autopocock-claude-provider-"));
  const mockScript = path.join(tempDir, "mock-claude.mjs");
  const lastMessagePath = path.join(tempDir, "last-message.txt");
  const previousMock = process.env.AUTOPOCOCK_CLAUDE_EXEC_SCRIPT;

  await writeFile(
    mockScript,
    [
      "process.stdout.write([",
      "  'Status: success',",
      "  'Summary: Mock Claude print mode completed.',",
      "  'Verification: Captured stdout.',",
      "  'Follow-up: Review the generated completion artifact.'",
      "].join('\\n'));",
    ].join("\n"),
    "utf8",
  );

  try {
    process.env.AUTOPOCOCK_CLAUDE_EXEC_SCRIPT = mockScript;
    const result = await runClaudePrint({
      prompt: "Return the four-line provider result.",
      outputLastMessagePath: lastMessagePath,
      runDir: tempDir,
      providerRunDir: tempDir,
      timeoutMs: 1000,
      cwd: tempDir,
    });

    const finalMessage = await readFile(lastMessagePath, "utf8");

    assert.match(result.stdout, /Mock Claude print mode completed/);
    assert.match(finalMessage, /Status: success/);
    assert.match(finalMessage, /Verification: Captured stdout\./);
  } finally {
    if (previousMock === undefined) {
      delete process.env.AUTOPOCOCK_CLAUDE_EXEC_SCRIPT;
    } else {
      process.env.AUTOPOCOCK_CLAUDE_EXEC_SCRIPT = previousMock;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("CodexProvider renders a provider-specific prompt bundle from a provider-neutral bundle", () => {
  const provider = createCodexProvider({
    cwd: "d:\\Projects\\AutoPocock",
    commandAvailable: async () => ({ available: true, stdout: "", stderr: "" }),
  });

  const promptBundle = provider.renderPromptBundle({
    loopSpec: {
      loop_spec_id: "loop-spec-dispatch-test",
      dispatch_id: "dispatch-test",
      issue_id: "23",
      goal: "Prove the shared provider contract.",
      owned_surface: ["scripts/lib/providers/*"],
      acceptance_criteria: ["Render a provider prompt from Loop Spec data."],
      verification_plan: {
        automated: ["node --test tests/provider-adapter.test.mjs"],
        manual: [],
      },
      boundaries: {
        forbidden_actions: ["modify unrelated files"],
      },
    },
  });

  assert.match(promptBundle.prompt, /Validate one bounded AutoPocock dispatch\./);
  assert.match(promptBundle.prompt, /Loop Spec ID: loop-spec-dispatch-test/);
  assert.match(promptBundle.prompt, /Dispatch: dispatch-test/);
  assert.match(promptBundle.prompt, /Goal: Prove the shared provider contract\./);
  assert.equal(promptBundle.output_format, "status-summary-verification-follow-up");
});

test("CodexProvider collects a successful live result without leaking workflow semantics into the adapter contract", () => {
  const provider = createCodexProvider({
    cwd: "d:\\Projects\\AutoPocock",
    commandAvailable: async () => ({ available: true, stdout: "", stderr: "" }),
  });

  const collected = provider.collectArtifacts({
    bundle: {
      provider: "codex",
      dispatch_id: "dispatch-test",
      handoff_artifact: "d:\\Projects\\AutoPocock\\docs\\agents\\handoffs\\test.md",
    },
    handoffArtifact: "d:\\Projects\\AutoPocock\\docs\\agents\\handoffs\\test.md",
    verificationCommand: "pnpm ops run -- --dispatch <dispatch> --execute --live-provider",
    timeoutMs: 1000,
    finalMessage: [
      "Status: success",
      "Summary: Live Codex adapter executed successfully.",
      "Verification: Read the handoff artifact and returned a bounded result.",
      "Follow-up: Review the generated completion artifact.",
    ].join("\n"),
    commandStdout: "ok",
    commandStderr: "",
  });

  assert.equal(collected.providerRunStatus, "succeeded");
  assert.equal(collected.result.status, "needs human review");
  assert.match(collected.result.summary, /executed successfully/);
  assert.match(
    collected.result.verificationResults.join(" | "),
    new RegExp(path.win32.basename("d:\\Projects\\AutoPocock\\docs\\agents\\handoffs\\test.md")),
  );
});
