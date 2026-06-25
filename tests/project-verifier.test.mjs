import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exportContainsRequestedIssue,
  exportReportsIssueAbsent,
  hasProjectReadScope,
  hasProjectWriteScope,
  parseTokenScopes,
  summarizeProjectVerification,
} from "../scripts/lib/project-verifier.mjs";

function passed(stdout = "") {
  return { status: "passed", stdout, stderr: "" };
}

test("project verifier distinguishes read and write Project scopes", () => {
  const readOnly = passed("Token scopes: 'admin:public_key', 'read:project', 'repo'");
  const write = passed("Token scopes: 'admin:public_key', 'project', 'repo'");

  assert.deepEqual(parseTokenScopes(readOnly.stdout), ["admin:public_key", "read:project", "repo"]);
  assert.equal(hasProjectReadScope(readOnly), true);
  assert.equal(hasProjectWriteScope(readOnly), false);
  assert.equal(hasProjectReadScope(write), true);
  assert.equal(hasProjectWriteScope(write), true);
});

test("project verifier recognizes requested issue visibility and absence messages", () => {
  assert.equal(
    exportContainsRequestedIssue(passed("Requested issue #45 is present in the exported queue snapshot."), "45"),
    true,
  );
  assert.equal(
    exportReportsIssueAbsent(passed("Requested issue #45 was not found in the exported queue snapshot."), "45"),
    true,
  );
});

test("project verifier exits successfully for local readiness with HITL external reconciliation", () => {
  const summary = summarizeProjectVerification({
    checks: [
      passed(),
      passed(),
      passed(),
      passed("Token scopes: 'read:project', 'repo'"),
      passed("Requested issue #45 was not found in the exported queue snapshot."),
    ],
    issue: "45",
  });

  assert.equal(summary.exitCode, 0);
  assert.equal(summary.projectReadReady, true);
  assert.equal(summary.projectWriteReady, false);
  assert.equal(summary.requestedIssueAbsent, true);
  assert.match(summary.finalLine, /External Project reconciliation remains HITL/);
});

test("project verifier strict external mode fails until write scope and visibility are present", () => {
  const summary = summarizeProjectVerification({
    checks: [
      passed(),
      passed(),
      passed(),
      passed("Token scopes: 'read:project', 'repo'"),
      passed("Requested issue #45 was not found in the exported queue snapshot."),
    ],
    issue: "45",
    strictExternal: true,
  });

  assert.equal(summary.exitCode, 1);
  assert.match(summary.finalLine, /Strict external verification failed/);
  assert.equal(summary.strictFailures.length, 2);
});

test("project verifier strict external mode passes when Project reconciliation is visible", () => {
  const summary = summarizeProjectVerification({
    checks: [
      passed(),
      passed(),
      passed(),
      passed("Token scopes: 'project', 'repo'"),
      passed("Requested issue #45 is present in the exported queue snapshot."),
    ],
    issue: "45",
    strictExternal: true,
  });

  assert.equal(summary.exitCode, 0);
  assert.equal(summary.projectWriteReady, true);
  assert.equal(summary.requestedIssueVisible, true);
  assert.match(summary.finalLine, /External Project reconciliation is ready/);
});
