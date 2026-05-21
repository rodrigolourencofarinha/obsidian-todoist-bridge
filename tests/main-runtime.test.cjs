const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

test("Obsidian line removal dispatches bridge detach without deleting the remote task", async () => {
  const originalLoad = Module._load;

  class TFile {
    constructor(path) {
      this.path = path;
    }
  }

  Module._load = function loadWithObsidianMock(request, parent, isMain) {
    if (request === "obsidian") {
      class Plugin {}
      class PluginSettingTab {}
      class Setting {}
      class Notice {}
      class MarkdownView {}
      return { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const PluginClass = require("../main.js").default;
    const file = new TFile("Projects/live.md");
    const app = {
      vault: {
        getAbstractFileByPath(path) {
          return path === file.path ? file : null;
        },
        async read() {
          return "- [ ] #task Kept locally without bridge metadata";
        }
      },
      workspace: {}
    };

    const plugin = new PluginClass();
    plugin.app = app;
    plugin.settings = {
      apiInitialized: true,
      debugMode: false,
      todoistTasksData: {
        tasks: [{ id: "task1", path: file.path, content: "Kept locally", labels: ["obsidian", "client"] }],
        projects: [],
        events: []
      },
      fileMetadata: {
        [file.path]: { todoistTasks: ["task1"], todoistCount: 1 }
      }
    };
    plugin.markRuntimeStateDirty = () => {};
    plugin.saveSettings = async () => {};
    plugin.logTaskActivity = async () => {};
    plugin.initializeModuleClass();

    const detachCalls = [];
    plugin.detachRemoteBridge = async (taskId, cachedTask, options) => {
      detachCalls.push({ taskId, labels: cachedTask.labels, reason: options.reason });
      return true;
    };
    plugin.todoistRestAPI.DeleteTask = async () => {
      throw new Error("DeleteTask must not be called for bridge detach");
    };

    const changed = await plugin.todoistSync.deletedTaskCheck(file.path, { file, content: await app.vault.read(file) });

    assert.equal(changed, true);
    assert.deepEqual(detachCalls, [{ taskId: "task1", labels: ["obsidian", "client"], reason: "missing-line" }]);
    assert.deepEqual(plugin.settings.todoistTasksData.tasks, []);
    assert.deepEqual(plugin.settings.fileMetadata[file.path]?.todoistTasks || [], []);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("#todoist removal dispatches bridge detach with tag-removal reason", async () => {
  const originalLoad = Module._load;

  class TFile {
    constructor(path) {
      this.path = path;
    }
  }

  Module._load = function loadWithObsidianMock(request, parent, isMain) {
    if (request === "obsidian") {
      class Plugin {}
      class PluginSettingTab {}
      class Setting {}
      class Notice {}
      class MarkdownView {}
      return { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const PluginClass = require("../main.js").default;
    const file = new TFile("Projects/live.md");
    const content = "- [ ] #task Keep text <span class=\"todoist-bridge\">[todoist_id:: task1] </span>";
    const app = {
      vault: {
        getAbstractFileByPath(path) {
          return path === file.path ? file : null;
        },
        async read() {
          return content;
        },
        async cachedRead() {
          return content;
        }
      },
      workspace: {}
    };

    const plugin = new PluginClass();
    plugin.app = app;
    plugin.settings = {
      apiInitialized: true,
      debugMode: false,
      todoistTasksData: {
        tasks: [{ id: "task1", path: file.path, content: "Keep text", labels: ["obsidian", "client"] }],
        projects: [],
        events: []
      },
      fileMetadata: {
        [file.path]: { todoistTasks: ["task1"], todoistCount: 1 }
      }
    };
    plugin.markRuntimeStateDirty = () => {};
    plugin.saveSettings = async () => {};
    plugin.logTaskActivity = async () => {};
    plugin.initializeModuleClass();
    plugin.fileOperation.removeTodoistMarkersForTask = async () => true;
    const detachCalls = [];
    plugin.detachRemoteBridge = async (taskId, cachedTask, options) => {
      detachCalls.push({ taskId, labels: cachedTask.labels, reason: options.reason });
      return true;
    };
    plugin.todoistRestAPI.DeleteTask = async () => {
      throw new Error("DeleteTask must not be called for bridge detach");
    };

    const changed = await plugin.todoistSync.deletedTaskCheck(file.path, { file, content });

    assert.equal(changed, true);
    assert.deepEqual(detachCalls, [{ taskId: "task1", labels: ["obsidian", "client"], reason: "todoist-tag-removed" }]);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("scheduled sync detaches cached bridge when a dirty file was deleted", async () => {
  const originalLoad = Module._load;

  class TFile {
    constructor(path) {
      this.path = path;
    }
  }

  Module._load = function loadWithObsidianMock(request, parent, isMain) {
    if (request === "obsidian") {
      class Plugin {}
      class PluginSettingTab {}
      class Setting {}
      class Notice {}
      class MarkdownView {}
      return { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const PluginClass = require("../main.js").default;
    const deletedPath = "Untitled.md";
    const app = {
      vault: {
        getAbstractFileByPath() {
          return null;
        }
      },
      workspace: {
        getActiveFile() {
          return null;
        }
      }
    };

    const plugin = new PluginClass();
    plugin.app = app;
    plugin.settings = {
      apiInitialized: true,
      debugMode: false,
      disableTodoistInboundSync: false,
      todoistTasksData: {
        tasks: [{ id: "task1", path: deletedPath, content: "Test", labels: ["obsidian"] }],
        projects: [],
        events: []
      },
      fileMetadata: {
        [deletedPath]: { todoistTasks: ["task1"], todoistCount: 1 }
      }
    };
    plugin.dirtyFiles = new Set([deletedPath]);
    plugin.runtimeStateDirty = false;
    plugin.markRuntimeStateDirty = () => {
      plugin.runtimeStateDirty = true;
    };
    plugin.saveSettings = async () => {};
    plugin.saveRuntimeStateIfDirty = async () => {};
    plugin.logTaskActivity = async () => {};
    plugin.initializeModuleClass();
    plugin.todoistSync.syncTodoistToObsidian = async () => ({ completed: 0, deleted: 0, cached: 1 });
    const detachCalls = [];
    plugin.detachRemoteBridge = async (taskId, cachedTask, options) => {
      detachCalls.push({ taskId, labels: cachedTask.labels, reason: options.reason });
      return true;
    };
    plugin.todoistRestAPI.DeleteTask = async () => {
      throw new Error("DeleteTask must not be called for bridge detach");
    };

    await plugin.scheduledSynchronization({ interactive: true });

    assert.deepEqual(detachCalls, [{ taskId: "task1", labels: ["obsidian"], reason: "file-deleted" }]);
    assert.deepEqual(plugin.settings.todoistTasksData.tasks, []);
    assert.deepEqual(plugin.settings.fileMetadata[deletedPath]?.todoistTasks || [], []);
    assert.equal(plugin.dirtyFiles.has(deletedPath), false);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("detachRemoteBridge adds detached audit label, comment, and clears bridge-only description", async () => {
  const originalLoad = Module._load;

  Module._load = function loadWithObsidianMock(request, parent, isMain) {
    if (request === "obsidian") {
      class Plugin {}
      class PluginSettingTab {}
      class Setting {}
      class Notice {}
      class MarkdownView {}
      class TFile {}
      return { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const PluginClass = require("../main.js").default;
    const plugin = new PluginClass();
    const updates = [];
    const comments = [];
    const bridgeDescription = "[Projects/live.md](obsidian://open?vault=Rodrigo&file=Projects/live.md)";
    plugin.todoistRestAPI = {
      async getTaskById() {
        return {
          id: "task1",
          content: "Kept locally",
          labels: ["obsidian", "client", "obsidian_detached"],
          description: bridgeDescription,
          url: "https://app.todoist.com/app/task/task1"
        };
      },
      async UpdateTask(taskId, update) {
        updates.push({ taskId, update });
        return { id: taskId, ...update };
      },
      async AddComment(taskId, comment) {
        comments.push({ taskId, content: comment.content });
        return { taskId, content: comment.content };
      }
    };

    const detached = await plugin.detachRemoteBridge(
      "task1",
      { labels: ["obsidian", "client"], path: "Projects/live.md", description: bridgeDescription, content: "Kept locally" },
      { reason: "file-deleted", path: "Projects/live.md", detachedAt: "2026-05-21T12:00:00.000Z" }
    );

    assert.equal(detached, true);
    assert.deepEqual(updates, [{ taskId: "task1", update: { labels: ["client", "obsidian_detached"], description: "" } }]);
    assert.equal(comments.length, 1);
    assert.equal(comments[0].taskId, "task1");
    assert.match(comments[0].content, /Bridge detached from Obsidian/);
    assert.match(comments[0].content, /Reason: file deleted/);
    assert.match(comments[0].content, /Original Markdown path: Projects\/live\.md/);
    assert.match(comments[0].content, /Original Obsidian link: obsidian:\/\/open\?vault=Rodrigo&file=Projects\/live\.md/);
    assert.match(comments[0].content, /Detached at: 2026-05-21T12:00:00.000Z/);
    assert.match(comments[0].content, /Todoist task was not deleted or completed/);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("detachRemoteBridge treats comment failure as best-effort after label update", async () => {
  const originalLoad = Module._load;

  Module._load = function loadWithObsidianMock(request, parent, isMain) {
    if (request === "obsidian") {
      class Plugin {}
      class PluginSettingTab {}
      class Setting {}
      class Notice {}
      class MarkdownView {}
      class TFile {}
      return { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const PluginClass = require("../main.js").default;
    const plugin = new PluginClass();
    const updates = [];
    plugin.todoistRestAPI = {
      async getTaskById() {
        return { id: "task1", labels: ["obsidian", "client"], description: "Custom note" };
      },
      async UpdateTask(taskId, update) {
        updates.push({ taskId, update });
        return { id: taskId, ...update };
      },
      async AddComment() {
        throw new Error("network down");
      }
    };

    const originalConsoleError = console.error;
    console.error = () => {};
    let detached;
    try {
      detached = await plugin.detachRemoteBridge("task1", { labels: ["obsidian"], path: "Projects/a.md" }, { reason: "todoist-tag-removed", path: "Projects/a.md" });
    } finally {
      console.error = originalConsoleError;
    }

    assert.equal(detached, true);
    assert.deepEqual(updates, [{ taskId: "task1", update: { labels: ["client", "obsidian_detached"] } }]);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("handleTodoistTagRemoval records a runtime tombstone", async () => {
  const originalLoad = Module._load;

  Module._load = function loadWithObsidianMock(request, parent, isMain) {
    if (request === "obsidian") {
      class Plugin {}
      class PluginSettingTab {}
      class Setting {}
      class Notice {}
      class MarkdownView {}
      class TFile {}
      return { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const PluginClass = require("../main.js").default;
    const plugin = new PluginClass();
    plugin.settings = {
      todoistTasksData: {
        tasks: [{ id: "task1", path: "Projects/a.md", content: "A" }],
        projects: [],
        events: []
      },
      fileMetadata: {
        "Projects/a.md": { todoistTasks: ["task1"], todoistCount: 1 }
      },
      statistics: {}
    };
    plugin.cacheOperation = {
      async loadTaskFromCacheyID() {
        return { id: "task1", path: "Projects/a.md", content: "A" };
      },
      removeTaskFromMetadata() {},
      deleteTaskFromCache() {
        plugin.settings.todoistTasksData.tasks = [];
      }
    };
    plugin.fileOperation = {
      async detachDeletedTodoistTaskInFile() {
        return true;
      },
      async detachDeletedTodoistTaskByContent() {
        return false;
      },
      async detachDeletedTodoistTaskByUniquePlainLine() {
        return false;
      }
    };
    const updates = [];
    const comments = [];
    plugin.todoistRestAPI = {
      async getTaskById() {
        return { id: "task1", labels: ["client"], description: "Custom note" };
      },
      async UpdateTask(taskId, update) {
        updates.push({ taskId, update });
        return { id: taskId, ...update };
      },
      async AddComment(taskId, comment) {
        comments.push({ taskId, content: comment.content });
        return { taskId, content: comment.content };
      }
    };

    const handled = await plugin.handleTodoistTagRemoval("task1", { path: "Projects/a.md" });

    assert.equal(handled, true);
    assert.deepEqual(updates, [{ taskId: "task1", update: { labels: ["client", "obsidian_detached"] } }]);
    assert.match(comments[0].content, /Reason: Todoist bridge label removed/);
    assert.deepEqual(plugin.bridgeTombstones.map((entry) => [entry.taskId, entry.path, entry.reason, entry.source]), [
      ["task1", "Projects/a.md", "todoist-label-removed", "todoist"]
    ]);
    assert.equal(plugin.runtimeStateDirty, true);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("Todoist bridge label removal leaves a local detached audit marker", async () => {
  const originalLoad = Module._load;

  class TFile {
    constructor(path) {
      this.path = path;
    }
  }

  Module._load = function loadWithObsidianMock(request, parent, isMain) {
    if (request === "obsidian") {
      class Plugin {}
      class PluginSettingTab {}
      class Setting {}
      class Notice {}
      class MarkdownView {}
      return { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const PluginClass = require("../main.js").default;
    const file = new TFile("Projects/live.md");
    let content = "- [ ] Task 2 #todoist <span class=\"todoist-bridge\">[todoist_id:: task2] </span> [link](https://app.todoist.com/app/task/task2)";
    const app = {
      vault: {
        getAbstractFileByPath(path) {
          return path === file.path ? file : null;
        },
        getMarkdownFiles() {
          return [file];
        },
        async read() {
          return content;
        },
        async cachedRead() {
          return content;
        },
        async modify(target, nextContent) {
          assert.equal(target, file);
          content = nextContent;
        }
      },
      workspace: {}
    };

    const plugin = new PluginClass();
    plugin.app = app;
    plugin.settings = {
      debugMode: false,
      todoistTasksData: {
        tasks: [{ id: "task2", path: file.path, content: "Task 2", labels: ["obsidian"] }],
        projects: [],
        events: []
      },
      fileMetadata: {
        [file.path]: { todoistTasks: ["task2"], todoistCount: 1 }
      }
    };
    plugin.saveSettings = async () => {};
    plugin.markRuntimeStateDirty = () => {};
    plugin.initializeModuleClass();
    plugin.cacheOperation.loadTaskFromCacheyID = async () => ({
      id: "task2",
      path: file.path,
      content: "Task 2",
      labels: ["obsidian"]
    });
    plugin.cacheOperation.removeTaskFromMetadata = () => {};
    plugin.cacheOperation.deleteTaskFromCache = () => {};
    plugin.todoistRestAPI = {
      async getTaskById() {
        return { id: "task2", labels: ["client"], description: "Custom note" };
      },
      async UpdateTask(taskId, update) {
        return { id: taskId, ...update };
      },
      async AddComment() {
        return {};
      }
    };

    const handled = await plugin.handleTodoistTagRemoval("task2", { id: "task2", path: file.path });

    assert.equal(handled, true);
    assert.match(content, /^- \[ \] Task 2 #todoist_detached\n  <span class="todoist-bridge">Detached from Todoist: bridge label was removed in Todoist\. Original Todoist ID: task2\. .+Z\.<\/span>$/);
    assert.equal(content.includes("#todoist "), false);
    assert.equal(content.includes("[todoist_id::"), false);
    assert.equal(content.includes("https://app.todoist.com/app/task/task2"), false);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("Todoist deletion detaches the Obsidian task with a local audit marker", async () => {
  const originalLoad = Module._load;

  class TFile {
    constructor(path) {
      this.path = path;
    }
  }

  Module._load = function loadWithObsidianMock(request, parent, isMain) {
    if (request === "obsidian") {
      class Plugin {}
      class PluginSettingTab {}
      class Setting {}
      class Notice {}
      class MarkdownView {}
      return { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const PluginClass = require("../main.js").default;
    const file = new TFile("Projects/live.md");
    let content = "- [ ] Test #todoist <span class=\"todoist-bridge\">[todoist_id:: task1] </span> [link](https://app.todoist.com/app/task/task1)";
    const removedFromMetadata = [];
    const deletedFromCache = [];
    const processedEvents = [];
    const app = {
      vault: {
        getAbstractFileByPath(path) {
          return path === file.path ? file : null;
        },
        getFiles() {
          return [file];
        },
        async read() {
          return content;
        },
        async cachedRead() {
          return content;
        },
        async modify(target, nextContent) {
          assert.equal(target, file);
          content = nextContent;
        }
      },
      workspace: {}
    };

    const plugin = new PluginClass();
    plugin.app = app;
    plugin.settings = {
      debugMode: false,
      todoistTasksData: {
        tasks: [{ id: "task1", path: file.path, content: "Test" }],
        projects: [],
        events: []
      },
      fileMetadata: {
        [file.path]: { todoistTasks: ["task1"], todoistCount: 1 }
      }
    };
    plugin.saveSettings = async () => {};
    plugin.markRuntimeStateDirty = () => {};
    plugin.logTaskActivity = async () => {};
    plugin.initializeModuleClass();
    plugin.cacheOperation.getFileMetadata = async () => plugin.settings.fileMetadata[file.path];
    plugin.cacheOperation.getFileMetadatas = async () => plugin.settings.fileMetadata;
    plugin.cacheOperation.removeTaskFromMetadata = (path, taskId) => {
      removedFromMetadata.push({ path, taskId });
    };
    plugin.cacheOperation.deleteTaskFromCache = (taskId) => {
      deletedFromCache.push(taskId);
    };
    plugin.cacheOperation.appendEventsToCache = async (events) => {
      processedEvents.push(...events);
    };

    const count = await plugin.todoistSync.syncDeletedTasksToObsidian([
      { event_type: "deleted", object_type: "item", object_id: "task1", event_date: "2026-05-21T13:15:00.000Z" }
    ]);

    assert.equal(count, 1);
    assert.equal(content, [
      "- [ ] Test #todoist_detached",
      "  <span class=\"todoist-bridge\">Detached from Todoist: remote task was deleted or unavailable. Original Todoist ID: task1. 2026-05-21T13:15:00.000Z.</span>"
    ].join("\n"));
    assert.equal(content.includes("#todoist "), false);
    assert.equal(content.includes("[todoist_id::"), false);
    assert.equal(content.includes("https://app.todoist.com/app/task/task1"), false);
    assert.deepEqual(removedFromMetadata, [{ path: file.path, taskId: "task1" }]);
    assert.deepEqual(deletedFromCache, ["task1"]);
    assert.equal(processedEvents.length, 1);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("Todoist deletion recovers a tombstoned single plain task line without activity content", async () => {
  const originalLoad = Module._load;

  class TFile {
    constructor(path) {
      this.path = path;
    }
  }

  Module._load = function loadWithObsidianMock(request, parent, isMain) {
    if (request === "obsidian") {
      class Plugin {}
      class PluginSettingTab {}
      class Setting {}
      class Notice {}
      class MarkdownView {}
      return { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const PluginClass = require("../main.js").default;
    const file = new TFile("Untitled.md");
    let content = "- [ ] Task 2";
    const app = {
      vault: {
        getAbstractFileByPath(path) {
          return path === file.path ? file : null;
        },
        getFiles() {
          return [file];
        },
        async read() {
          return content;
        },
        async cachedRead() {
          return content;
        },
        async modify(target, nextContent) {
          assert.equal(target, file);
          content = nextContent;
        }
      },
      workspace: {}
    };

    const plugin = new PluginClass();
    plugin.app = app;
    plugin.settings = {
      debugMode: false,
      todoistTasksData: {
        tasks: [],
        projects: [],
        events: []
      },
      fileMetadata: {}
    };
    plugin.bridgeTombstones = [{ taskId: "task2", path: file.path, reason: "todoist-label-removed", source: "todoist" }];
    plugin.saveSettings = async () => {};
    plugin.markRuntimeStateDirty = () => {};
    plugin.logTaskActivity = async () => {};
    plugin.getLastTaskActivity = async () => null;
    plugin.initializeModuleClass();
    plugin.cacheOperation.getFileMetadata = async () => null;
    plugin.cacheOperation.getFileMetadatas = async () => ({});

    const count = await plugin.todoistSync.syncDeletedTasksToObsidian([
      { event_type: "deleted", object_type: "item", object_id: "task2", event_date: "2026-05-21T13:42:28.906Z" }
    ]);

    assert.equal(count, 1);
    assert.equal(content, [
      "- [ ] Task 2 #todoist_detached",
      "  <span class=\"todoist-bridge\">Detached from Todoist: remote task was deleted or unavailable. Original Todoist ID: task2. 2026-05-21T13:42:28.906Z.</span>"
    ].join("\n"));
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("local detached audit tag is not propagated as a Todoist label", async () => {
  const originalLoad = Module._load;

  Module._load = function loadWithObsidianMock(request, parent, isMain) {
    if (request === "obsidian") {
      class Plugin {}
      class PluginSettingTab {}
      class Setting {}
      class Notice {}
      class MarkdownView {}
      class TFile {}
      return { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const PluginClass = require("../main.js").default;
    const plugin = new PluginClass();
    plugin.app = { vault: { getName: () => "Test Vault" }, workspace: {} };
    plugin.settings = { defaultProjectId: "", debugMode: false };
    plugin.initializeModuleClass();
    plugin.cacheOperation.getProjectIdByNameFromCache = () => "inbox";
    plugin.cacheOperation.getProjectNameByIdFromCache = () => "Inbox";

    const task = await plugin.taskParser.convertTextToTodoistTaskObject(
      "- [ ] Test #todoist #todoist_detached #client",
      "Projects/live.md",
      1,
      "- [ ] Test #todoist #todoist_detached #client"
    );

    assert.deepEqual(task.labels.sort(), ["client", "obsidian"].sort());
    assert.equal(plugin.taskParser.hasTodoistTag("- [ ] Test #todoist_detached"), false);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("Todoist deletion can recover a local audit marker after bridge metadata was already stripped", async () => {
  const originalLoad = Module._load;

  class TFile {
    constructor(path) {
      this.path = path;
    }
  }

  Module._load = function loadWithObsidianMock(request, parent, isMain) {
    if (request === "obsidian") {
      class Plugin {}
      class PluginSettingTab {}
      class Setting {}
      class Notice {}
      class MarkdownView {}
      return { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const PluginClass = require("../main.js").default;
    const file = new TFile("Untitled.md");
    let content = "- [ ] Task 2";
    const app = {
      vault: {
        getAbstractFileByPath(path) {
          return path === file.path ? file : null;
        },
        getFiles() {
          return [file];
        },
        async read() {
          return content;
        },
        async cachedRead() {
          return content;
        },
        async modify(target, nextContent) {
          assert.equal(target, file);
          content = nextContent;
        }
      },
      workspace: {}
    };

    const plugin = new PluginClass();
    plugin.app = app;
    plugin.settings = {
      debugMode: false,
      todoistTasksData: {
        tasks: [],
        projects: [],
        events: []
      },
      fileMetadata: {}
    };
    plugin.bridgeTombstones = [{ taskId: "task2", path: file.path, reason: "missing-line", source: "obsidian" }];
    plugin.saveSettings = async () => {};
    plugin.markRuntimeStateDirty = () => {};
    plugin.logTaskActivity = async () => {};
    plugin.getLastTaskActivity = async () => ({
      taskId: "task2",
      taskName: "Task 2",
      filePath: file.path,
      status: "detached"
    });
    plugin.initializeModuleClass();
    plugin.cacheOperation.getFileMetadata = async () => null;
    plugin.cacheOperation.getFileMetadatas = async () => ({});

    const count = await plugin.todoistSync.syncDeletedTasksToObsidian([
      { event_type: "deleted", object_type: "item", object_id: "task2", event_date: "2026-05-21T13:27:35.050Z" }
    ]);

    assert.equal(count, 1);
    assert.equal(content, [
      "- [ ] Task 2 #todoist_detached",
      "  <span class=\"todoist-bridge\">Detached from Todoist: remote task was deleted or unavailable. Original Todoist ID: task2. 2026-05-21T13:27:35.050Z.</span>"
    ].join("\n"));
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});
