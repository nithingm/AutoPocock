import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

function buildClaudeCommandArgs({ prompt, runDir, providerRunDir, cwd }) {
  const mockScript = process.env.AUTOPOCOCK_CLAUDE_EXEC_SCRIPT || "";
  const command = mockScript ? process.execPath : "claude";
  const args = mockScript
    ? [
        mockScript,
        "--print",
        "--output-format",
        "text",
        "--no-session-persistence",
        "--permission-mode",
        "plan",
        "--add-dir",
        cwd,
        "--add-dir",
        providerRunDir,
        prompt,
      ]
    : [
        "--print",
        "--output-format",
        "text",
        "--no-session-persistence",
        "--permission-mode",
        "plan",
        "--add-dir",
        cwd,
        "--add-dir",
        providerRunDir,
        prompt,
      ];

  return { command, args, cwd: runDir || cwd };
}

export async function runClaudePrint({ prompt, outputLastMessagePath, runDir, providerRunDir, timeoutMs, cwd }) {
  const commandSpec = buildClaudeCommandArgs({ prompt, runDir, providerRunDir, cwd });

  return await new Promise((resolve, reject) => {
    const child = spawn(commandSpec.command, commandSpec.args, {
      cwd: commandSpec.cwd,
      windowsHide: true,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const finishReject = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    const finishResolve = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      error.stdout = stdout;
      error.stderr = stderr;
      finishReject(error);
    });

    const killTimer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.on("close", async (code, signal) => {
      clearTimeout(killTimer);

      if (outputLastMessagePath && stdout) {
        await writeFile(outputLastMessagePath, stdout, "utf8");
      }

      if (timedOut) {
        const error = new Error(`Command timed out after ${timeoutMs} ms`);
        error.code = code;
        error.signal = signal;
        error.killed = true;
        error.stdout = stdout;
        error.stderr = stderr;
        finishReject(error);
        return;
      }

      if (code === 0) {
        finishResolve({ stdout, stderr });
        return;
      }

      const error = new Error(stderr || `Command failed with exit code ${code}${signal ? ` (${signal})` : ""}`);
      error.code = code;
      error.signal = signal;
      error.stdout = stdout;
      error.stderr = stderr;
      finishReject(error);
    });

    child.stdin?.end();
  });
}
