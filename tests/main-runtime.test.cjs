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
    plugin.detachRemoteBridge = async (taskId, cachedTask) => {
      detachCalls.push({ taskId, labels: cachedTask.labels });
      return true;
    };
    plugin.todoistRestAPI.DeleteTask = async () => {
      throw new Error("DeleteTask must not be called for bridge detach");
    };

    const changed = await plugin.todoistSync.deletedTaskCheck(file.path, { file, content: await app.vault.read(file) });

    assert.equal(changed, true);
    assert.deepEqual(detachCalls, [{ taskId: "task1", labels: ["obsidian", "client"] }]);
    assert.deepEqual(plugin.settings.todoistTasksData.tasks, []);
    assert.deepEqual(plugin.settings.fileMetadata[file.path]?.todoistTasks || [], []);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("detachRemoteBridge removes only bridge labels through Todoist update path", async () => {
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
    const calls = [];
    plugin.todoistRestAPI = {
      async RemoveBridgeLabels(taskId, labels) {
        calls.push({ taskId, labels });
        return { id: taskId, labels: ["client"] };
      }
    };

    const detached = await plugin.detachRemoteBridge("task1", { labels: ["obsidian", "client"] });

    assert.equal(detached, true);
    assert.deepEqual(calls, [{ taskId: "task1", labels: ["obsidian", "client"] }]);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("detachRemoteBridge prefers current Todoist labels over stale cached labels", async () => {
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
    const calls = [];
    plugin.todoistRestAPI = {
      async getTaskById() {
        return { id: "task1", labels: ["obsidian", "client", "urgent"] };
      },
      async RemoveBridgeLabels(taskId, labels) {
        calls.push({ taskId, labels });
        return { id: taskId, labels: ["client", "urgent"] };
      }
    };

    const detached = await plugin.detachRemoteBridge("task1", { labels: ["obsidian", "client"] });

    assert.equal(detached, true);
    assert.deepEqual(calls, [{ taskId: "task1", labels: ["obsidian", "client", "urgent"] }]);
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
      async removeTodoistMarkersForTask() {
        return true;
      }
    };

    const handled = await plugin.handleTodoistTagRemoval("task1", { path: "Projects/a.md" });

    assert.equal(handled, true);
    assert.deepEqual(plugin.bridgeTombstones.map((entry) => [entry.taskId, entry.path, entry.reason, entry.source]), [
      ["task1", "Projects/a.md", "todoist-label-removed", "todoist"]
    ]);
    assert.equal(plugin.runtimeStateDirty, true);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});
