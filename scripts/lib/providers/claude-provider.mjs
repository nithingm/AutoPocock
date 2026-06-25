import {
  buildLiveProviderFailureResult,
  buildLiveProviderSuccessResult,
  parseProviderFinalMessage,
} from "../provider-runner.mjs";
import { runClaudePrint } from "../claude-exec.mjs";

export function createClaudeProvider({ commandAvailable, cwd }) {
  return {
    name: "claude",

    async isAvailable({ requireLogin = false } = {}) {
      if (process.env.AUTOPOCOCK_CLAUDE_EXEC_SCRIPT) {
        return {
          available: true,
          ready: true,
          authenticated: true,
          source: "mock-script",
        };
      }

      const version = await commandAvailable("claude");
      if (!version.available) {
        return {
          available: false,
          ready: false,
          authenticated: false,
          source: "cli",
          detail: version.stderr || version.stdout || "claude CLI not available",
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

      const authStatus = await commandAvailable("claude", ["auth", "status"]);
      return {
        available: true,
        ready: authStatus.available,
        authenticated: authStatus.available,
        source: "cli",
        detail: authStatus.available ? authStatus.stdout : authStatus.stderr,
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
          "Validate one bounded AutoPocock dispatch using Claude Code print mode.",
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
      const commandResult = await runClaudePrint({
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

      const parsed = parseProviderFinalMessage(finalMessage, { providerName: "Claude" });
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
