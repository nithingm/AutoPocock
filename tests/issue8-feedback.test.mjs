import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import {
  classifyFeedback,
  FEEDBACK_ARTIFACT_DIR,
  renderFeedbackClassification,
} from "../scripts/lib/feedback-classifier.mjs";

test("classifyFeedback rejects missing required inputs", () => {
  assert.throws(() => classifyFeedback({ issue: "", pr: "12", finding: "typo" }), /requires issue/);
  assert.throws(() => classifyFeedback({ issue: "8", pr: "abc", finding: "typo" }), /numeric pr/);
  assert.throws(() => classifyFeedback({ issue: "8", pr: "12", finding: "   " }), /requires finding/);
});

test("classifyFeedback returns a Same-PR Fix candidate for clearly minor QA findings", () => {
  const result = classifyFeedback(
    {
      issue: "8",
      pr: "314",
      finding: `Title: Button copy typo
Evidence: The review screen says "Approe" instead of "Approve".
Expected Behavior: The button label should say "Approve".
Actual Behavior: The label is misspelled.
Verification Notes: Re-open the review screen and confirm the corrected label.`,
    },
    { createdAt: "2026-05-14T12:00:00.000Z" },
  );

  const markdown = renderFeedbackClassification(result);

  assert.equal(result.kind, "same-pr-fix");
  assert.equal(result.requires_solo_operator_approval, true);
  assert.deepEqual(result.candidate_fix.evidence, ['The review screen says "Approe" instead of "Approve".']);
  assert.equal(result.artifact_suggestion.dir, FEEDBACK_ARTIFACT_DIR);
  assert.equal(
    result.artifact_suggestion.json_path,
    path.join(FEEDBACK_ARTIFACT_DIR, "2026-05-14-issue-8-pr-314-the-label-is-misspelled.json"),
  );
  assert.equal(
    result.artifact_suggestion.markdown_path,
    path.join(FEEDBACK_ARTIFACT_DIR, "2026-05-14-issue-8-pr-314-the-label-is-misspelled.md"),
  );
  assert.equal(result.artifact_suggestion.json_payload.github_mutation, "disabled");
  assert.equal(result.artifact_suggestion.json_payload.same_pr_fix.original_issue, "#8");
  assert.match(result.artifact_suggestion.markdown_payload, /^# Feedback Summary/m);
  assert.doesNotMatch(result.artifact_suggestion.markdown_payload, /## Suggested Local Artifact/);
  assert.match(markdown, /## Same-PR Fix Candidate/);
  assert.match(markdown, /## Suggested Local Artifact/);
  assert.match(markdown, /docs[\\/]agents[\\/]feedback[\\/]2026-05-14-issue-8-pr-314-the-label-is-misspelled\.md/);
  assert.match(markdown, /Solo Operator approval required: yes/);
  assert.match(markdown, /No GitHub issue or comment was created\./);
});

test("classifyFeedback defaults to a new bug draft for broader defects", () => {
  const result = classifyFeedback(
    {
      issue: "8",
      pr: "314",
      finding: `Evidence:
- QA reproduced a 500 error after submitting feedback twice.
Expected Behavior:
- Submitting feedback twice should keep the flow stable and return the saved state.
Actual Behavior:
- The second submit returns a 500 error and the page stops rendering.
Verification Notes:
- Reproduced in local QA with the same payload on two consecutive submits.`,
    },
    { createdAt: "2026-05-14T12:00:00.000Z" },
  );

  const markdown = renderFeedbackClassification(result);

  assert.equal(result.kind, "new-bug-draft");
  assert.equal(result.bug_draft.original_issue, "#8");
  assert.equal(result.bug_draft.original_pr, "#314");
  assert.deepEqual(result.bug_draft.evidence, ["QA reproduced a 500 error after submitting feedback twice."]);
  assert.deepEqual(result.bug_draft.expected_behavior, [
    "Submitting feedback twice should keep the flow stable and return the saved state.",
  ]);
  assert.deepEqual(result.bug_draft.actual_behavior, [
    "The second submit returns a 500 error and the page stops rendering.",
  ]);
  assert.deepEqual(result.bug_draft.verification_notes, [
    "Reproduced in local QA with the same payload on two consecutive submits.",
  ]);
  assert.equal(result.artifact_suggestion.json_payload.github_mutation, "disabled");
  assert.equal(result.artifact_suggestion.json_payload.bug_draft.title, result.bug_draft.title);
  assert.match(
    result.artifact_suggestion.markdown_path,
    /docs[\\/]agents[\\/]feedback[\\/]2026-05-14-issue-8-pr-314-the-second-submit-returns-a-500-error-and-the-page-stops-re.*\.md$/,
  );
  assert.match(markdown, /## New Bug Draft/);
  assert.match(markdown, /Links back to original issue: #8/);
  assert.match(markdown, /Links back to original PR: #314/);
  assert.match(markdown, /### Evidence/);
  assert.match(markdown, /### Expected Behavior/);
  assert.match(markdown, /### Actual Behavior/);
  assert.match(markdown, /### Verification Notes/);
  assert.match(markdown, /## Suggested Local Artifact/);
});

test("classifyFeedback falls back to using the finding text as evidence when sections are absent", () => {
  const result = classifyFeedback({
    issue: "8",
    pr: "314",
    finding: "Users can save a draft, but reopening it drops the saved reviewer selection.",
  });

  assert.equal(result.kind, "new-bug-draft");
  assert.deepEqual(result.bug_draft.evidence, [
    "Users can save a draft, but reopening it drops the saved reviewer selection.",
  ]);
  assert.deepEqual(result.bug_draft.actual_behavior, [
    "Users can save a draft, but reopening it drops the saved reviewer selection.",
  ]);
});
