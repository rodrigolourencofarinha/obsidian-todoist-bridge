const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildRepairPlan,
  buildStateRecordsFromPlan,
  buildObsidianDetachPlan,
  removeBridgeLabels,
  selectDirtyFilesForSync,
  selectRollingReconciliationBatch
} = require("../src/sync/sync-core.cjs");

test("remote checked plus local unchecked yields completion action and no open record", () => {
  const plan = buildRepairPlan({
    candidates: [{
      taskId: "done1",
      path: "Projects/live.md",
      lineNumber: 3,
      line: "- [ ] #task Done #todoist <span class=\"todoist-bridge\">[todoist_id:: done1] </span>"
    }],
    cachedTasksById: new Map([["done1", { id: "done1", path: "stale.md" }]]),
    remoteTasksById: new Map([["done1", { id: "done1", checked: true, completed_at: "2026-05-19T12:00:00Z" }]])
  });

  assert.deepEqual(plan.toComplete.map((entry) => entry.taskId), ["done1"]);
  assert.deepEqual(plan.openRecords, []);
  assert.deepEqual(plan.stalePaths.map((entry) => [entry.taskId, entry.cachedPath, entry.path]), [
    ["done1", "stale.md", "Projects/live.md"]
  ]);
});

test("remote missing is reported and does not create completion action", () => {
  const plan = buildRepairPlan({
    candidates: [{
      taskId: "missing1",
      path: "Projects/live.md",
      lineNumber: 4,
      line: "- [ ] #task Broken #todoist <span class=\"todoist-bridge\">[todoist_id:: missing1] </span>"
    }],
    cachedTasksById: new Map(),
    remoteTasksById: new Map([["missing1", { __missing: true }]])
  });

  assert.deepEqual(plan.toComplete, []);
  assert.equal(plan.broken.length, 1);
  assert.match(plan.broken[0].reason, /missing in Todoist/);
});

test("URL mismatch is reported while embedded todoist_id remains authoritative", () => {
  const plan = buildRepairPlan({
    candidates: [{
      taskId: "right1",
      linkTaskId: "wrong1",
      path: "Projects/live.md",
      lineNumber: 5,
      line: "- [ ] #task Mismatch #todoist <span class=\"todoist-bridge\">[todoist_id:: right1] </span> [link](https://app.todoist.com/app/task/wrong1)"
    }],
    cachedTasksById: new Map(),
    remoteTasksById: new Map([["right1", { id: "right1", checked: true }]])
  });

  assert.deepEqual(plan.toComplete.map((entry) => entry.taskId), ["right1"]);
  assert.deepEqual(plan.urlMismatches.map((entry) => [entry.taskId, entry.linkTaskId]), [["right1", "wrong1"]]);
});

test("open remote tasks become canonical open records", () => {
  const plan = buildRepairPlan({
    candidates: [{
      taskId: "open1",
      path: "Projects/new.md",
      lineNumber: 8,
      line: "- [ ] #task Still open #todoist <span class=\"todoist-bridge\">[todoist_id:: open1] </span>"
    }],
    cachedTasksById: new Map([["open1", { id: "open1", path: "old.md", content: "Old" }]]),
    remoteTasksById: new Map([["open1", { id: "open1", checked: false, content: "Still open" }]])
  });

  const records = buildStateRecordsFromPlan(plan);
  assert.deepEqual(records.map((record) => [record.path, record.task.id, record.task.path]), [
    ["Projects/new.md", "open1", "Projects/new.md"]
  ]);
});

test("local missing line produces a detach action instead of a remote delete", () => {
  const plan = buildObsidianDetachPlan({
    path: "Projects/live.md",
    content: "- [ ] #task Still here #todoist <span class=\"todoist-bridge\">[todoist_id:: keep1] </span>",
    trackedTaskIds: ["keep1", "gone1"],
    cachedTasksById: new Map([
      ["keep1", { id: "keep1", labels: ["obsidian", "client"] }],
      ["gone1", { id: "gone1", labels: ["obsidian", "client"] }]
    ])
  });

  assert.deepEqual(plan.keep.map((entry) => entry.taskId), ["keep1"]);
  assert.deepEqual(plan.detach.map((entry) => [entry.taskId, entry.reason]), [["gone1", "missing-line"]]);
});

test("local #todoist removal produces a detach action while preserving task text", () => {
  const plan = buildObsidianDetachPlan({
    path: "Projects/live.md",
    content: "- [ ] #task Keep text <span class=\"todoist-bridge\">[todoist_id:: task1] </span> [link](https://app.todoist.com/app/task/task1)",
    trackedTaskIds: ["task1"],
    cachedTasksById: new Map([["task1", { id: "task1", labels: ["obsidian", "work"] }]])
  });

  assert.equal(plan.keep.length, 0);
  assert.equal(plan.detach.length, 1);
  assert.equal(plan.detach[0].reason, "todoist-tag-removed");
  assert.equal(plan.detach[0].lineNumber, 1);
});

test("remote bridge-label detach strips only control labels", () => {
  assert.deepEqual(removeBridgeLabels(["obsidian", "todoist", "task", "client", "DeepWork"]), ["client", "DeepWork"]);
});

test("dirty-file selection is bounded and deterministic", () => {
  const result = selectDirtyFilesForSync({
    dirtyFiles: ["b.md", "a.md", "b.md", "", null, "c.md"],
    activeFile: "active.md",
    maxFiles: 3
  });

  assert.deepEqual(result.files, ["active.md", "b.md", "a.md"]);
  assert.deepEqual(result.remainingDirtyFiles, ["c.md"]);
});

test("rolling reconciliation checks a bounded batch and advances cursor", () => {
  const result = selectRollingReconciliationBatch({
    tasks: [
      { id: "a" },
      { id: "b" },
      { id: "c" },
      { id: "d" }
    ],
    cursor: 2,
    limit: 3
  });

  assert.deepEqual(result.tasks.map((task) => task.id), ["c", "d", "a"]);
  assert.equal(result.nextCursor, 1);
});
