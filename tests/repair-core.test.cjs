const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyBridgeLine,
  isLegacyNumericTodoistId,
  normalizeCompletionLine,
  rebuildSettingsForOpenTasks
} = require("../src/repair/repair-core.cjs");

test("marks a stale-path Todoist completion using the task id in the moved note", () => {
  const line = "- [ ] #task Write concrete points #todoist <span class=\"todoist-bridge\">[todoist_id:: 6gXHmvqfrc4C88H4] </span> [link](https://app.todoist.com/app/task/6gXHmvqfrc4C88H4)";
  const classification = classifyBridgeLine({
    line,
    path: "Projects/2020 Product Development Strategy/Meetings/2026-05-05 - Meeting - NPD - Channels Model Results Discussion.md",
    lineNumber: 212,
    remoteTask: { id: "6gXHmvqfrc4C88H4", checked: true },
    cachedTask: { id: "6gXHmvqfrc4C88H4", path: "2026-05-05 - Meeting - NPD - Channels Model Results Discussion.md" }
  });

  assert.equal(classification.shouldComplete, true);
  assert.deepEqual(classification.issues, ["stale cached path (2026-05-05 - Meeting - NPD - Channels Model Results Discussion.md)"]);
});

test("Unicode-equivalent cached paths are not reported as stale", () => {
  const line = "- [ ] #task Review notes #todoist <span class=\"todoist-bridge\">[todoist_id:: task1] </span> [link](https://app.todoist.com/app/task/task1)";
  const notePath = "Areas/Decomposer/Meetings/2026-02-10 - Meeting - Reunia\u0303o Semanal Decoupling.md";
  const cachedPath = "Areas/Decomposer/Meetings/2026-02-10 - Meeting - Reuni\u00e3o Semanal Decoupling.md";
  const classification = classifyBridgeLine({
    line,
    path: notePath,
    lineNumber: 10,
    remoteTask: { id: "task1", checked: false },
    cachedTask: { id: "task1", path: cachedPath }
  });

  assert.deepEqual(classification.issues, []);
});

test("completion metadata is normalized without duplicate todoist completion tokens", () => {
  const input = "- [x] #task Done #todoist <span class=\"todoist-bridge\">[todoist_id:: abc123] [todoist_completion:: 2026-05-01] [todoist_completion:: 2026-05-02] </span> [link](https://app.todoist.com/app/task/abc123)";
  const output = normalizeCompletionLine(input, "abc123", "2026-05-19T12:30:00.000Z");

  assert.match(output, /^- \[x\]/);
  assert.match(output, /\[todoist_id:: abc123\]/);
  assert.match(output, /\[todoist_completion:: 2026-05-19\]/);
  assert.equal((output.match(/\[todoist_completion::/g) || []).length, 1);
});

test("remote errors and missing tasks are reported but not completed", () => {
  const line = "- [ ] #task Broken #todoist <span class=\"todoist-bridge\">[todoist_id:: missing123] </span> [link](https://app.todoist.com/app/task/missing123)";
  const missing = classifyBridgeLine({ line, path: "Projects/a.md", lineNumber: 1, remoteTask: { __missing: true } });
  const error = classifyBridgeLine({ line, path: "Projects/a.md", lineNumber: 1, remoteTask: { __error: "429" } });

  assert.equal(missing.shouldComplete, false);
  assert.deepEqual(missing.issues, ["missing in Todoist"]);
  assert.equal(error.shouldComplete, false);
  assert.deepEqual(error.issues, ["Todoist fetch error: 429"]);
});

test("legacy numeric Todoist ids are treated as local-only bridge markers", () => {
  const line = "- [ ] #task Old bridged task #todoist <span class=\"todoist-bridge\">[todoist_id:: 8879450871] </span> [link](https://app.todoist.com/app/task/8879450871)";
  const classification = classifyBridgeLine({
    line,
    path: "Archive/old.md",
    lineNumber: 7,
    remoteTask: { __missing: true }
  });

  assert.equal(isLegacyNumericTodoistId("8879450871"), true);
  assert.equal(isLegacyNumericTodoistId("6gXHmvqfrc4C88H4"), false);
  assert.equal(classification.legacyNumeric, true);
  assert.equal(classification.shouldComplete, false);
  assert.deepEqual(classification.issues, ["legacy numeric todoist_id is local-only under Todoist API v1"]);
});

test("rebuilt settings keep only verified open tasks with canonical file paths", () => {
  const settings = {
    todoistTasksData: { tasks: [{ id: "old" }], projects: [{ id: "p" }], events: [{ eventKey: "k" }] },
    fileMetadata: { "stale.md": { todoistTasks: ["open1"], todoistCount: 1 } }
  };
  const rebuilt = rebuildSettingsForOpenTasks(settings, [
    { path: "Projects/live.md", task: { id: "open1", content: "Open" } },
    { path: "Projects/live.md", task: { id: "open1", content: "Open duplicate" } },
    { path: "Projects/other.md", task: { id: "open2", content: "Other" } }
  ]);

  assert.deepEqual(rebuilt.todoistTasksData.tasks.map((task) => [task.id, task.path]), [
    ["open1", "Projects/live.md"],
    ["open2", "Projects/other.md"]
  ]);
  assert.deepEqual(rebuilt.fileMetadata, {
    "Projects/live.md": { todoistTasks: ["open1"], todoistCount: 1 },
    "Projects/other.md": { todoistTasks: ["open2"], todoistCount: 1 }
  });
  assert.deepEqual(rebuilt.todoistTasksData.events, [{ eventKey: "k" }]);
});
