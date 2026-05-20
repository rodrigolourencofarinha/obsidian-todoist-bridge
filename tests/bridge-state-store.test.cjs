const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  AdapterBridgeStateStore,
  ADAPTER_STATE_PATH,
  BridgeStateStore,
  addRuntimeTombstone,
  mergeRuntimeStates,
  normalizePersistedSettings,
  settingsWithoutRuntimeState
} = require("../src/state/bridge-state-store.cjs");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "todoist-bridge-state-"));
}

test("settings persistence strips runtime cache while preserving user settings", () => {
  const persisted = settingsWithoutRuntimeState({
    todoistAPIToken: "secret",
    todoistAPISecretName: "todoist-main",
    defaultProjectName: "Inbox",
    automaticSynchronizationEnabled: true,
    initialized: true,
    apiInitialized: true,
    todoistCreationOnlyMode: true,
    enableFullVaultSync: true,
    cleanupMissingRemoteTasksOnSync: true,
    excludedTagsFromTodoist: ["todoist"],
    todoistTasksData: {
      tasks: [{ id: "task1", path: "Projects/a.md" }],
      projects: [{ id: "project1", name: "Work" }],
      events: [{ eventKey: "completed|item|task1||2026-05-19" }]
    },
    fileMetadata: {
      "Projects/a.md": { todoistTasks: ["task1"], todoistCount: 1 }
    }
  });

  assert.equal(persisted.todoistAPISecretName, "todoist-main");
  assert.equal("todoistAPIToken" in persisted, false);
  assert.equal("defaultProjectName" in persisted, false);
  assert.equal("initialized" in persisted, false);
  assert.equal("apiInitialized" in persisted, false);
  assert.equal("todoistCreationOnlyMode" in persisted, false);
  assert.equal("enableFullVaultSync" in persisted, false);
  assert.equal("cleanupMissingRemoteTasksOnSync" in persisted, false);
  assert.equal("excludedTagsFromTodoist" in persisted, false);
  assert.equal("todoistTasksData" in persisted, false);
  assert.equal("fileMetadata" in persisted, false);
});

test("settings persistence drops legacy toggles and derived state", () => {
  const persisted = normalizePersistedSettings({
    initialized: true,
    apiInitialized: true,
    defaultProjectName: "Inbox",
    todoistCreationOnlyMode: true,
    enableFullVaultSync: true,
    removeCompletedTagOnReopen: true,
    cleanupMissingRemoteTasksOnSync: true,
    removeMarkersOnTodoistDelete: true,
    todoistContentSanitized: true,
    excludedTagsFromTodoist: ["obsidian"],
    excludedTagsFromObsidian: ["todoist"],
    todoistAPIToken: "secret",
    todoistAPISecretName: "todoist-main",
    defaultProjectId: "project1",
    automaticSynchronizationEnabled: true,
    automaticSynchronizationInterval: 300,
    disableTodoistInboundSync: false,
    debugMode: true
  });

  assert.deepEqual(Object.keys(persisted).sort(), [
    "automaticSynchronizationEnabled",
    "automaticSynchronizationInterval",
    "debugMode",
    "defaultProjectId",
    "disableTodoistInboundSync",
    "todoistAPISecretName"
  ]);
});

test("runtime state preserves dirty queues and reconciliation cursor", () => {
  const store = new BridgeStateStore({ dir: tempDir(), preferSqlite: false });

  store.replaceState({
    tasks: [{ id: "task1", path: "Projects/a.md" }],
    dirtyFiles: ["Projects/a.md", "Projects/a.md", ""],
    dirtyTaskIds: ["task1", "task2", "task1"],
    reconcileCursor: 25
  });

  const snapshot = store.snapshot();
  assert.deepEqual(snapshot.dirtyFiles, ["Projects/a.md"]);
  assert.deepEqual(snapshot.dirtyTaskIds, ["task1", "task2"]);
  assert.equal(snapshot.reconcileCursor, 25);
});

test("state writes record writer metadata", () => {
  const store = new BridgeStateStore({ dir: tempDir(), preferSqlite: false, writerDevice: "desktop-test" });

  store.replaceState({
    tasks: [{ id: "task1", path: "Projects/a.md" }]
  }, { reason: "unit-test" });

  const snapshot = store.snapshot();
  assert.equal(snapshot.lastWriterDevice, "desktop-test");
  assert.equal(snapshot.lastWriteReason, "unit-test");
  assert.match(snapshot.lastWriteAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("tombstones prevent stale local state from resurrecting detached tasks", () => {
  const loaded = {
    tasks: [{ id: "detached", path: "Projects/a.md" }],
    tombstones: []
  };
  const current = addRuntimeTombstone({
    tasks: [],
    tombstones: []
  }, {
    taskId: "detached",
    path: "Projects/a.md",
    reason: "todoist-tag-removed",
    source: "mobile",
    createdAt: "2026-05-20T00:00:00.000Z"
  });
  const local = {
    tasks: [{ id: "detached", path: "Projects/a.md", content: "stale desktop copy" }],
    tombstones: []
  };

  const merged = mergeRuntimeStates({ loaded, current, local });

  assert.deepEqual(merged.tasks, []);
  assert.deepEqual(merged.tombstones.map((entry) => [entry.taskId, entry.path, entry.reason, entry.source]), [
    ["detached", "Projects/a.md", "todoist-tag-removed", "mobile"]
  ]);
});

test("adapter state store preserves lightweight mobile runtime state", async () => {
  const files = {};
  const store = new AdapterBridgeStateStore({
    adapter: {
      async exists(path) {
        return Object.prototype.hasOwnProperty.call(files, path);
      },
      async read(path) {
        return files[path];
      },
      async write(path, content) {
        files[path] = content;
      },
      async mkdir(path) {
        files[path] = files[path] || "";
      }
    }
  });

  const snapshot = await store.replaceState({
    tasks: [{ id: "task1", path: "Projects/mobile.md" }],
    dirtyFiles: ["Projects/mobile.md"],
    reconcileCursor: 4
  });

  assert.equal(snapshot.backend, "adapter");
  assert.equal(snapshot.tasks.length, 1);
  assert.deepEqual(snapshot.dirtyFiles, ["Projects/mobile.md"]);
  assert.equal(snapshot.reconcileCursor, 4);
  assert.ok(Object.prototype.hasOwnProperty.call(files, ADAPTER_STATE_PATH));
});

test("desktop sqlite store reconciles a fresher json mirror written by mobile", (t) => {
  const dir = tempDir();
  const desktop = new BridgeStateStore({ dir, preferSqlite: true, writerDevice: "desktop-test" });
  if (desktop.backend !== "sqlite") {
    t.skip("node:sqlite is unavailable in this runtime");
    return;
  }
  desktop.replaceState({
    tasks: [{ id: "desktop-task", path: "Projects/desktop.md" }],
    dirtyFiles: ["Projects/desktop.md"]
  }, { reason: "desktop-save" });
  const mobileMirror = {
    version: 1,
    revision: desktop.snapshot().revision + 5,
    tasks: [{ id: "mobile-task", path: "Projects/mobile.md" }],
    projects: [],
    events: [],
    fileMetadata: { "Projects/mobile.md": { todoistTasks: ["mobile-task"], todoistCount: 1 } },
    dirtyFiles: ["Projects/mobile.md"],
    dirtyTaskIds: [],
    reconcileCursor: 7,
    tombstones: [],
    updatedAt: "2026-05-20T00:00:00.000Z",
    lastWriterDevice: "mobile-adapter",
    lastWriteReason: "scheduled-sync",
    lastWriteAt: "2026-05-20T00:00:00.000Z"
  };
  fs.writeFileSync(path.join(dir, "todoist-bridge-state.json"), JSON.stringify(mobileMirror, null, 2), "utf8");

  const reconciled = new BridgeStateStore({ dir, preferSqlite: true, writerDevice: "desktop-test" }).snapshot();

  assert.equal(reconciled.backend, "sqlite");
  assert.deepEqual(reconciled.tasks.map((task) => [task.id, task.path]), [
    ["mobile-task", "Projects/mobile.md"]
  ]);
  assert.deepEqual(reconciled.dirtyFiles, ["Projects/mobile.md"]);
  assert.equal(reconciled.lastWriterDevice, "mobile-adapter");
});

test("state store migrates legacy data.json runtime state into dedicated storage", () => {
  const store = new BridgeStateStore({ dir: tempDir(), preferSqlite: false });

  store.migrateFromSettings({
    todoistTasksData: {
      tasks: [{ id: "task1", path: "Projects/a.md", content: "Open" }],
      projects: [{ id: "project1", name: "Inbox" }],
      events: [{ eventKey: "completed|item|task1||2026-05-19", object_id: "task1" }]
    },
    fileMetadata: {
      "Projects/a.md": { todoistTasks: ["task1"], todoistCount: 1 }
    }
  });

  const snapshot = store.snapshot();
  assert.equal(snapshot.backend, "json");
  assert.deepEqual(snapshot.tasks.map((task) => [task.id, task.path]), [["task1", "Projects/a.md"]]);
  assert.deepEqual(snapshot.projects.map((project) => project.id), ["project1"]);
  assert.deepEqual(snapshot.events.map((event) => event.eventKey), ["completed|item|task1||2026-05-19"]);
  assert.deepEqual(snapshot.fileMetadata, {
    "Projects/a.md": { todoistTasks: ["task1"], todoistCount: 1 }
  });
});

test("rebuild from open records keeps only canonical open Todoist tasks", () => {
  const store = new BridgeStateStore({ dir: tempDir(), preferSqlite: false });
  store.migrateFromSettings({
    todoistTasksData: {
      tasks: [{ id: "stale", path: "stale.md" }],
      events: [{ eventKey: "old" }]
    },
    fileMetadata: { "stale.md": { todoistTasks: ["stale"], todoistCount: 1 } }
  });

  store.rebuildFromOpenRecords([
    { path: "Projects/live.md", task: { id: "open1", content: "Open" } },
    { path: "Projects/live.md", task: { id: "open1", content: "Duplicate" } },
    { path: "Projects/other.md", task: { id: "open2", content: "Other" } }
  ]);

  const snapshot = store.snapshot();
  assert.deepEqual(snapshot.tasks.map((task) => [task.id, task.path]), [
    ["open1", "Projects/live.md"],
    ["open2", "Projects/other.md"]
  ]);
  assert.deepEqual(snapshot.fileMetadata, {
    "Projects/live.md": { todoistTasks: ["open1"], todoistCount: 1 },
    "Projects/other.md": { todoistTasks: ["open2"], todoistCount: 1 }
  });
  assert.deepEqual(snapshot.events.map((event) => event.eventKey), ["old"]);
  assert.equal(snapshot.lastWriterDevice, "desktop");
  assert.equal(snapshot.lastWriteReason, "rebuild-open-records");
});

test("revision guard can detect external state changes before stale save", () => {
  const dir = tempDir();
  const first = new BridgeStateStore({ dir, preferSqlite: false });
  first.rebuildFromOpenRecords([{ path: "Projects/a.md", task: { id: "task1" } }]);
  const loadedRevision = first.getRevision();

  const second = new BridgeStateStore({ dir, preferSqlite: false });
  second.rebuildFromOpenRecords([{ path: "Projects/b.md", task: { id: "task2" } }]);

  assert.notEqual(first.getRevision(), loadedRevision);
  assert.deepEqual(first.snapshot().tasks.map((task) => task.id), ["task2"]);
});

test("merge guard preserves external removals while keeping new local tasks", () => {
  const loaded = {
    tasks: [
      { id: "external-completed", path: "Projects/a.md" },
      { id: "still-open", path: "Projects/b.md" }
    ],
    events: [],
    fileMetadata: {}
  };
  const current = {
    tasks: [{ id: "still-open", path: "Projects/b.md", content: "External" }],
    events: [{ eventKey: "external-event" }],
    fileMetadata: { "Projects/b.md": { todoistTasks: ["still-open"], todoistCount: 1 } }
  };
  const local = {
    tasks: [
      { id: "external-completed", path: "Projects/a.md", content: "Stale local copy" },
      { id: "still-open", path: "Projects/new-b.md", content: "Local update" },
      { id: "new-local", path: "Projects/c.md", content: "New local task" }
    ],
    events: [{ eventKey: "local-event" }],
    fileMetadata: {}
  };

  const merged = mergeRuntimeStates({ loaded, current, local });

  assert.deepEqual(merged.tasks.map((task) => [task.id, task.path]), [
    ["still-open", "Projects/new-b.md"],
    ["new-local", "Projects/c.md"]
  ]);
  assert.deepEqual(merged.events.map((event) => event.eventKey), ["external-event", "local-event"]);
  assert.deepEqual(merged.fileMetadata, {
    "Projects/new-b.md": { todoistTasks: ["still-open"], todoistCount: 1 },
    "Projects/c.md": { todoistTasks: ["new-local"], todoistCount: 1 }
  });
});
