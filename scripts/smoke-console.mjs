import assert from "node:assert/strict";
import { startWorkflowConsole } from "./lib/workflow-console.mjs";

const { server, port } = await startWorkflowConsole({
  cwd: process.cwd(),
  host: "127.0.0.1",
  port: 0,
});

try {
  const base = `http://127.0.0.1:${port}`;

  const htmlResponse = await fetch(`${base}/`);
  assert.equal(htmlResponse.status, 200);
  const html = await htmlResponse.text();
  assert.match(html, /Workflow Console/);
  assert.match(html, /data-view="setup"/);
  assert.match(html, /data-view="graph"/);
  assert.match(html, /data-view="execution"/);

  const stateResponse = await fetch(`${base}/api/state`);
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  assert.equal(state.workspace.endsWith("AutoPocock"), true);
  assert.equal(Array.isArray(state.onboarding), true);
  assert.equal(typeof state.setup, "object");

  process.stdout.write(`workflow console smoke passed on http://127.0.0.1:${port}\n`);
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
