import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("provider image publish workflow uses GHCR package permissions and repo publish command", async () => {
  const workflow = await readFile(".github/workflows/provider-image-publish.yml", "utf8");

  assert.match(workflow, /^name: Provider Image Publish/m);
  assert.match(workflow, /^\s*workflow_dispatch:/m);
  assert.match(workflow, /^\s*packages: write/m);
  assert.match(workflow, /docker:build-provider -- --tag autopocock-provider-runner:ci --validate/);
  assert.match(workflow, /docker login ghcr\.io/);
  assert.match(workflow, /docker:publish-provider/);
  assert.match(workflow, /--source-tag autopocock-provider-runner:ci/);
  assert.match(workflow, /--target-tag "\$target_tag"/);
  assert.match(workflow, /--write-plan/);
  assert.match(workflow, /--apply/);
  assert.match(workflow, /--approved-by "github-actions:\$\{GITHUB_RUN_ID\}"/);
});
