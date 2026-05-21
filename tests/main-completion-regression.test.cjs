const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

test("checkbox completion path uses shared completion handler", async () => {
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
    plugin.app = { vault: {}, workspace: {} };
    plugin.initializeModuleClass();

    const calls = [];
    plugin.todoistRestAPI = {
      async CloseTask(taskId) {
        calls.push(["close", taskId]);
      }
    };
    plugin.fileOperation = {
      async completeTaskInTheFile() {
        throw new Error("closeTask should delegate note/cache cleanup to handleTaskCompletion");
      }
    };
    plugin.cacheOperation = {
      async closeTaskToCacheByID() {
        throw new Error("closeTask should delegate cache cleanup to handleTaskCompletion");
      }
    };
    plugin.handleTaskCompletion = async (taskId, options) => {
      calls.push(["handle", taskId, options.source, typeof options.completedAt]);
      return true;
    };
    plugin.saveSettings = async () => {
      calls.push(["save"]);
    };

    await plugin.todoistSync.closeTask("task1");

    assert.deepEqual(calls, [
      ["close", "task1"],
      ["handle", "task1", "obsidian", "string"],
      ["save"]
    ]);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("Todoist reopen events are processed after completed tasks leave active cache", async () => {
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
    plugin.app = { vault: {}, workspace: {} };
    plugin.initializeModuleClass();

    const calls = [];
    const event = {
      event_type: "uncompleted",
      object_type: "item",
      object_id: "task1",
      event_date: "2026-05-20T17:30:00.000Z"
    };

    plugin.settings = { disableTodoistInboundSync: false, debugMode: false };
    plugin.todoistSyncAPI = {
      async getNonObsidianAllActivityEvents() {
        return [event];
      },
      filterActivityEvents(events, options) {
        return events.filter(
          (candidate) => candidate.event_type === options.event_type && candidate.object_type === options.object_type
        );
      }
    };
    plugin.cacheOperation = {
      loadEventsFromCache() {
        return [];
      },
      getEventCacheKey(candidate) {
        return [candidate.event_type, candidate.object_type, candidate.object_id, candidate.parent_item_id || "", candidate.event_date || ""].join("|");
      },
      loadTasksFromCache() {
        return [];
      },
      async appendEventsToCache(events) {
        calls.push(["events", events.map((candidate) => candidate.object_id)]);
      },
      async reopenTaskToCacheByID(taskId) {
        calls.push(["reopen-cache", taskId]);
        return { id: taskId, path: "Projects/a.md" };
      },
      addTaskToMetadata(path, taskId) {
        calls.push(["metadata", path, taskId]);
      }
    };
    plugin.fileOperation = {
      async uncompleteTaskInTheFile(taskId) {
        calls.push(["uncomplete-file", taskId]);
        return { found: true, modified: true, filepath: "Projects/a.md" };
      }
    };
    plugin.shouldRunScheduledCompletionReconciliation = () => false;
    plugin.saveSettings = async () => {
      calls.push(["save"]);
    };

    const summary = await plugin.todoistSync.syncTodoistToObsidian({ interactive: false });

    assert.equal(summary.cached, 0);
    assert.deepEqual(calls.slice(0, 5), [
      ["uncomplete-file", "task1"],
      ["reopen-cache", "task1"],
      ["metadata", "Projects/a.md", "task1"],
      ["events", ["task1"]],
      ["save"]
    ]);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("uncompleting a task removes bracketed todoist completion metadata", async () => {
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
    const file = { path: "Projects/a.md" };
    const originalLine = '- [x] #task Done #todoist <span class="todoist-bridge">[todoist_id:: task1] [ ] [todoist_completion:: 2026-05-20] </span> [link](https://app.todoist.com/app/task/task1)';
    let written = "";

    plugin.app = {
      vault: {
        getAbstractFileByPath(path) {
          return path === file.path ? file : null;
        },
        async read() {
          return originalLine;
        },
        async modify(_file, content) {
          written = content;
        },
        getMarkdownFiles() {
          return [file];
        }
      },
      workspace: {}
    };
    plugin.initializeModuleClass();
    plugin.cacheOperation = {
      async loadTaskFromCacheyID() {
        return { id: "task1", path: file.path };
      },
      canonicalizeTaskPath() {}
    };

    const result = await plugin.fileOperation.uncompleteTaskInTheFile("task1");

    assert.equal(result.found, true);
    assert.equal(result.modified, true);
    assert.equal(written, '- [ ] #task Done #todoist <span class="todoist-bridge">[todoist_id:: task1] </span> [link](https://app.todoist.com/app/task/task1)');
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});
