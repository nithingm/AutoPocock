import {
  buildLiveProviderFailureResult,
  buildLiveProviderSuccessResult,
  parseCodexFinalMessage,
} from "../provider-runner.mjs";
import { runCodexExec } from "../codex-exec.mjs";

export function createCodexProvider({ commandAvailable, cwd }) {
  return {
    name: "codex",

    async isAvailable({ requireLogin = false } = {}) {
      if (process.env.AUTOPOCOCK_CODEX_EXEC_SCRIPT) {
        return {
          available: true,
          ready: true,
          authenticated: true,
          source: "mock-script",
        };
      }

      const version = await commandAvailable("codex");
      if (!version.available) {
        return {
          available: false,
          ready: false,
          authenticated: false,
          source: "cli",
          detail: version.stderr || version.stdout || "codex CLI not available",
        };
      }

      if (!requireLogin) {
        return {
          available: true,
          ready: true,
          authenticated: false,
          source: "cli",
          detail: version.stdout,
        };
      }

      const loginStatus = await commandAvailable("codex", ["login", "status"]);
      return {
        available: true,
        ready: loginStatus.available,
        authenticated: loginStatus.available,
        source: "cli",
        detail: loginStatus.available ? loginStatus.stdout : loginStatus.stderr,
      };
    },

    getCapabilities() {
      return {
        availability: true,
        readiness: true,
        launch: true,
        resume: false,
        cancel: false,
        status: false,
        collectArtifacts: true,
        renderPromptBundle: true,
      };
    },

    renderPromptBundle({ loopSpec }) {
      const verificationHints = [
        ...(loopSpec.verification_plan?.automated || []),
        ...(loopSpec.verification_plan?.manual || []),
      ].filter(Boolean);

      return {
        prompt: [
          "Validate one bounded AutoPocock dispatch.",
          `Loop Spec ID: ${loopSpec.loop_spec_id}`,
          `Dispatch: ${loopSpec.dispatch_id}`,
          `Issue: ${loopSpec.issue_id}`,
          `Goal: ${loopSpec.goal}`,
          `Owned surface: ${(loopSpec.owned_surface || []).join(" | ") || "None declared"}`,
          `Acceptance criteria: ${(loopSpec.acceptance_criteria || []).join(" | ") || "None declared"}`,
          `Verification hints: ${verificationHints.join(" | ") || "None declared"}`,
          `Forbidden actions: ${(loopSpec.boundaries?.forbidden_actions || []).join(" | ") || "None declared"}`,
          "Do not modify files.",
          "Only inspect the handoff and return plain text with exactly four lines:",
          "Status: success or blocked",
          "Summary: one sentence",
          "Verification: one fact",
          "Follow-up: one next step",
        ].join("\n"),
        output_format: "status-summary-verification-follow-up",
      };
    },

    async launchLoop({ promptBundle, outputLastMessagePath, runDir, providerRunDir, timeoutMs }) {
      const commandResult = await runCodexExec({
        prompt: promptBundle.prompt,
        outputLastMessagePath,
        runDir,
        providerRunDir,
        timeoutMs,
        cwd,
      });

      return {
        stdout: commandResult.stdout || "",
        stderr: commandResult.stderr || "",
      };
    },

    collectArtifacts({
      bundle,
      handoffArtifact,
      verificationCommand,
      timeoutMs,
      finalMessage,
      commandStdout = "",
      commandStderr = "",
      error = null,
    }) {
      if (error) {
        return {
          commandStdout,
          ...buildLiveProviderFailureResult({
            bundle,
            handoffArtifact,
            timeoutMs,
            verificationCommand,
            error,
            finalMessage,
          }),
        };
      }

      const parsed = parseCodexFinalMessage(finalMessage);
      return {
        commandStdout,
        commandStderr,
        ...buildLiveProviderSuccessResult({
          bundle,
          handoffArtifact,
          parsed,
          verificationCommand,
        }),
      };
    },
  };
}
