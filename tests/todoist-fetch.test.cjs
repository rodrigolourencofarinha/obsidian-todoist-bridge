const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { fetchTodoistTask } = require("../src/repair/todoist-fetch.cjs");

test("Todoist task fetch returns a timeout error instead of hanging", async () => {
  const server = http.createServer((_req, _res) => {
    // Leave the request open to simulate a stalled Todoist edge/API response.
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const startedAt = Date.now();
    const result = await fetchTodoistTask("token", "task1", {
      baseUrl: `http://127.0.0.1:${port}/api/v1/tasks`,
      maxNetworkAttempts: 1,
      timeoutMs: 25
    });
    const elapsedMs = Date.now() - startedAt;

    assert.equal(result.__error, "timeout after 25ms");
    assert.ok(elapsedMs < 1000, `fetch took ${elapsedMs}ms`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
