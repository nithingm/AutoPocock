import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderExecutionCompletionReport } from "./lib/provider-runner.mjs";
import { getProvider } from "./lib/providers/index.mjs";
import { pathExists } from "./lib/runtime-host.mjs";
const cwd = process.cwd();

function readOption(args, name, fallback = "") {
  const long = `--${name}`;
  const index = args.indexOf(long);
  if (index === -1) {
    return fallback;
  }
  return args[index + 1] || fallback;
}

function nowIso() {
  return new Date().toISOString();
}

async function main() {
  const args = process.argv.slice(2);
  const metadataPath = readOption(args, "metadata");
  const timeoutMs = Number.parseInt(readOption(args, "provider-timeout-ms", "45000"), 10) || 45000;

  if (!metadataPath) {
    throw new Error("provider-run-worker requires --metadata.");
  }

  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const bundle = JSON.parse(await readFile(metadata.bundle_path, "utf8"));
  const loopSpec = metadata.loop_spec_path ? JSON.parse(await readFile(metadata.loop_spec_path, "utf8")) : null;
  const provider = getProvider(metadata.provider || bundle.provider || "codex", {
    commandAvailable: async () => ({ available: true, stdout: "", stderr: "" }),
    cwd,
  });
  const providerRunDir = path.dirname(metadataPath);
  const lastMessagePath = metadata.last_message_path;
  const stdoutLogPath = metadata.stdout_log_path || path.join(providerRunDir, `${metadata.run_id}.stdout.log`);
  const stderrLogPath = metadata.stderr_log_path || path.join(providerRunDir, `${metadata.run_id}.stderr.log`);
  const promptBundle = provider.renderPromptBundle({
    loopSpec,
    bundle,
  });

  let providerRunStatus = "blocked";
  let completionResult;
  let commandStdout = "";
  let commandStderr = "";

  try {
    const liveResult = await provider.launchLoop({
      promptBundle,
      outputLastMessagePath: lastMessagePath,
      runDir: metadata.execution?.worktree_path || cwd,
      providerRunDir,
      timeoutMs,
    });
    const finalMessage = await readFile(lastMessagePath, "utf8");
    const collected = provider.collectArtifacts({
      bundle,
      handoffArtifact: metadata.handoff_artifact,
      verificationCommand: "pnpm ops run -- --dispatch <dispatch> --execute --live-provider --detach",
      timeoutMs,
      finalMessage,
      commandStdout: liveResult.stdout || "",
      commandStderr: liveResult.stderr || "",
    });
    providerRunStatus = collected.providerRunStatus;
    completionResult = collected.result;
    commandStdout = collected.commandStdout || "";
    commandStderr = collected.commandStderr || "";
  } catch (error) {
    const finalMessage = (await pathExists(lastMessagePath)) ? await readFile(lastMessagePath, "utf8") : "";
    const collected = provider.collectArtifacts({
      bundle,
      handoffArtifact: metadata.handoff_artifact,
      verificationCommand: "pnpm ops run -- --dispatch <dispatch> --execute --live-provider --detach",
      timeoutMs,
      finalMessage,
      commandStdout: `${error.stdout || ""}`,
      error,
    });
    providerRunStatus = collected.providerRunStatus;
    completionResult = collected.result;
    commandStdout = collected.commandStdout || "";
    commandStderr = collected.commandStderr || "";
  }

  metadata.status = providerRunStatus;
  metadata.completed_at = nowIso();
  metadata.command_output = {
    stdout: commandStdout,
    stderr: commandStderr,
  };
  metadata.runtime = {
    ...(metadata.runtime || {}),
    stop_condition: providerRunStatus === "blocked"
      ? "The provider reports a blocked, cancelled, or timed-out result."
      : "Acceptance criteria are satisfied and verification is complete.",
    escalation_reason: providerRunStatus === "blocked"
      ? (completionResult.followUps?.[0] || "Inspect provider output before retrying.")
      : "",
    log_paths: {
      stdout: stdoutLogPath,
      stderr: stderrLogPath,
    },
  };
  metadata.result = {
    summary: completionResult.summary,
    follow_ups: completionResult.followUps,
    gaps: completionResult.gaps,
  };

  await mkdir(path.dirname(metadata.completion_report_target), { recursive: true });
  await writeFile(stdoutLogPath, commandStdout, "utf8");
  await writeFile(stderrLogPath, commandStderr, "utf8");
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  const completionReport = renderExecutionCompletionReport({
    dispatch: {
      dispatch_id: metadata.dispatch_id,
      issue_id: metadata.issue_id,
      handoff_artifact: metadata.handoff_artifact,
      completion_report_target: metadata.completion_report_target,
      title: bundle.title,
    },
    providerRun: metadata,
    result: completionResult,
    loopSpecPath: metadata.loop_spec_path || "",
    bundlePath: metadata.bundle_path,
    metadataPath,
  });
  await writeFile(metadata.completion_report_target, completionReport, "utf8");
}

main().catch(async (error) => {
  try {
    const args = process.argv.slice(2);
    const metadataPath = readOption(args, "metadata");
    if (metadataPath) {
      const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
      metadata.status = "blocked";
      metadata.completed_at = nowIso();
      metadata.command_output = {
        stdout: "",
        stderr: `${error.stack || error.message || error}`,
      };
      metadata.runtime = {
        ...(metadata.runtime || {}),
        stop_condition: "The provider reports a blocked, cancelled, or timed-out result.",
        escalation_reason: "Inspect the worker error and retry the run.",
        log_paths: {
          stdout: metadata.stdout_log_path || "",
          stderr: metadata.stderr_log_path || "",
        },
      };
      metadata.result = {
        summary: "Detached provider-run worker failed unexpectedly.",
        follow_ups: ["Inspect the worker error and retry the run."],
        gaps: [`${error.stack || error.message || error}`],
      };
      await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    }
  } catch {
    // Ignore secondary failures during worker error handling.
  }
  process.exitCode = 1;
});
