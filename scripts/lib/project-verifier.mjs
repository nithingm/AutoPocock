export function combinedOutput(result) {
  return `${result?.stdout || ""}\n${result?.stderr || ""}`;
}

export function parseTokenScopes(output) {
  const match = String(output || "").match(/Token scopes:\s*(.+)/i);
  if (!match) {
    return [];
  }
  return match[1]
    .split(",")
    .map((scope) => scope.replace(/['"]/g, "").trim())
    .filter(Boolean);
}

export function hasProjectWriteScope(authResult) {
  return parseTokenScopes(combinedOutput(authResult)).includes("project");
}

export function hasProjectReadScope(authResult) {
  const scopes = parseTokenScopes(combinedOutput(authResult));
  return scopes.includes("read:project") || scopes.includes("project");
}

export function exportContainsRequestedIssue(exportResult, issue) {
  const output = combinedOutput(exportResult);
  return output.includes(`Requested issue #${issue} is present`)
    || output.includes(`Requested issue ${issue} is present`);
}

export function exportReportsIssueAbsent(exportResult, issue) {
  const output = combinedOutput(exportResult);
  return output.includes(`Requested issue #${issue} was not found`)
    || output.includes(`Requested issue ${issue} was not found`);
}

export function issueStateIsClosed(issueResult) {
  const output = combinedOutput(issueResult);
  return /"state"\s*:\s*"CLOSED"/i.test(output) || /\bstate:\s*CLOSED\b/i.test(output);
}

export function summarizeProjectVerification({ checks, issue = "45", strictExternal = false }) {
  const [setup, tests, consoleSmoke, auth, exportCheck, issueStateCheck = { status: "passed", stdout: "", stderr: "" }] = checks;
  const localFailures = [setup, tests, consoleSmoke].filter((result) => result.status !== "passed");
  const externalFailures = [auth, exportCheck, issueStateCheck].filter((result) => result.status !== "passed");
  const projectWriteReady = auth.status === "passed" && hasProjectWriteScope(auth);
  const projectReadReady = auth.status === "passed" && hasProjectReadScope(auth);
  const requestedIssueVisible = exportCheck.status === "passed" && exportContainsRequestedIssue(exportCheck, issue);
  const requestedIssueAbsent = exportCheck.status === "passed" && exportReportsIssueAbsent(exportCheck, issue);
  const requestedIssueClosed = issueStateCheck.status === "passed" && issueStateIsClosed(issueStateCheck);
  const requestedIssueTerminal = requestedIssueVisible || (requestedIssueAbsent && requestedIssueClosed);

  const strictFailures = [
    ...localFailures,
    ...externalFailures,
    ...(projectWriteReady ? [] : [{ label: "GitHub Project write scope" }]),
    ...(requestedIssueTerminal ? [] : [{ label: `Issue #${issue} Project active visibility or closed terminal state` }]),
  ];

  let exitCode = 0;
  let finalLine = "Project verification passed for local readiness.";
  if (strictExternal && strictFailures.length > 0) {
    exitCode = 1;
    finalLine = "Strict external verification failed.";
  } else if (localFailures.length > 0 || externalFailures.length > 0) {
    exitCode = 1;
    finalLine = "Project verification failed before external reconciliation.";
  } else if (!projectWriteReady || !requestedIssueTerminal) {
    finalLine = "Project verification passed for local readiness. External Project reconciliation remains HITL.";
  } else {
    finalLine = "Project verification passed for local readiness. External Project reconciliation is ready.";
  }

  return {
    localFailures,
    externalFailures,
    projectWriteReady,
    projectReadReady,
    requestedIssueVisible,
    requestedIssueAbsent,
    requestedIssueClosed,
    requestedIssueTerminal,
    strictFailures,
    exitCode,
    finalLine,
  };
}
