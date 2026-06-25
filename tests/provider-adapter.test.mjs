import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { createCodexProvider } from "../scripts/lib/providers/codex-provider.mjs";

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
  assert.match(collected.result.verificationResults.join(" | "), new RegExp(path.basename("d:\\Projects\\AutoPocock\\docs\\agents\\handoffs\\test.md")));
});
