import { spawn } from "node:child_process";

function buildCodexCommandArgs({ prompt, outputLastMessagePath, runDir, providerRunDir, cwd }) {
  const mockScript = process.env.AUTOPOCOCK_CODEX_EXEC_SCRIPT || "";
  const command = mockScript ? process.execPath : "codex";
  const args = mockScript
    ? [
        mockScript,
        "exec",
        "--skip-git-repo-check",
        "--sandbox",
        "workspace-write",
        "--cd",
        runDir,
        "--add-dir",
        cwd,
        "--add-dir",
        providerRunDir,
        "--output-last-message",
        outputLastMessagePath,
        prompt,
      ]
    : [
        "exec",
        "--skip-git-repo-check",
        "--sandbox",
        "workspace-write",
        "--cd",
        runDir,
        "--add-dir",
        cwd,
        "--add-dir",
        providerRunDir,
        "--output-last-message",
        outputLastMessagePath,
        prompt,
      ];

  return { command, args };
}

export async function runCodexExec({ prompt, outputLastMessagePath, runDir, providerRunDir, timeoutMs, cwd }) {
  const { command, args } = buildCodexCommandArgs({ prompt, outputLastMessagePath, runDir, providerRunDir, cwd });

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
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

    child.on("close", (code, signal) => {
      clearTimeout(killTimer);

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

    // Explicitly close stdin so codex cannot wait for unexpected piped input.
    child.stdin?.end();
  });
}
