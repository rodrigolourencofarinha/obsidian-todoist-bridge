const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");

test("manifest allows Obsidian mobile to load the plugin", () => {
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

  assert.equal(manifest.isDesktopOnly, false);
});

test("main.js loads in a mobile-like runtime without Node filesystem modules", () => {
  const originalLoad = Module._load;

  Module._load = function loadWithMobileRuntime(request, parent, isMain) {
    if (request === "obsidian") {
      class Plugin {}
      class PluginSettingTab {}
      class Setting {}
      class Notice {}
      class MarkdownView {}
      class TFile {}
      return { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile };
    }
    if (request === "fs" || request === "path" || request === "node:fs" || request === "node:path" || request === "node:sqlite") {
      throw new Error(`${request} is not available on mobile`);
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const pluginModule = require("../main.js");
    assert.equal(typeof pluginModule.default, "function");
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("mobile runtime loads lightweight bridge state from the Obsidian adapter", async () => {
  const originalLoad = Module._load;

  Module._load = function loadWithMobileRuntime(request, parent, isMain) {
    if (request === "obsidian") {
      class Plugin {}
      class PluginSettingTab {}
      class Setting {}
      class Notice {}
      class MarkdownView {}
      class TFile {}
      return { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile };
    }
    if (request === "fs" || request === "path" || request === "node:fs" || request === "node:path" || request === "node:sqlite") {
      throw new Error(`${request} is not available on mobile`);
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const PluginClass = require("../main.js").default;
    const statePath = "config/plugins/todoist-bridge/todoist-bridge-state.json";
    const files = {
      [statePath]: JSON.stringify({
        version: 1,
        revision: 7,
        tasks: [{ id: "task1", path: "Projects/mobile.md", content: "Mobile task" }],
        projects: [],
        events: [],
        fileMetadata: { "Projects/mobile.md": { todoistTasks: ["task1"], todoistCount: 1 } },
        dirtyFiles: ["Projects/mobile.md"],
        dirtyTaskIds: [],
        reconcileCursor: 3,
        updatedAt: "2026-05-20T00:00:00.000Z"
      })
    };
    const plugin = new PluginClass();
    plugin.app = {
      vault: {
        configDir: "config",
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
          async mkdir() {}
        }
      }
    };
    plugin.loadData = async () => ({
      todoistAPISecretName: "todoist-main",
      automaticSynchronizationEnabled: true,
      automaticSynchronizationInterval: 300,
      disableTodoistInboundSync: false,
      debugMode: false
    });

    const loaded = await plugin.loadSettings();

    assert.equal(loaded, true);
    assert.deepEqual(plugin.settings.todoistTasksData.tasks.map((task) => [task.id, task.path]), [
      ["task1", "Projects/mobile.md"]
    ]);
    assert.deepEqual(Array.from(plugin.dirtyFiles), ["Projects/mobile.md"]);
    assert.equal(plugin.reconcileCursor, 3);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("mobile scheduled sync persists the remaining lightweight dirty queue", async () => {
  const originalLoad = Module._load;
  class Plugin {}
  class PluginSettingTab {}
  class Setting {}
  class Notice {}
  class MarkdownView {}
  class TFile {
    constructor(path) {
      this.path = path;
    }
  }
  const obsidianMock = { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile };

  Module._load = function loadWithMobileRuntime(request, parent, isMain) {
    if (request === "obsidian") {
      return obsidianMock;
    }
    if (request === "fs" || request === "path" || request === "node:fs" || request === "node:path" || request === "node:sqlite") {
      throw new Error(`${request} is not available on mobile`);
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const PluginClass = require("../main.js").default;
    const { TFile } = require("obsidian");
    const statePath = "config/plugins/todoist-bridge/todoist-bridge-state.json";
    const dirtyFiles = Array.from({ length: 30 }, (_value, index) => `Projects/mobile-${String(index + 1).padStart(2, "0")}.md`);
    const files = {
      [statePath]: JSON.stringify({
        version: 1,
        revision: 1,
        tasks: [],
        projects: [],
        events: [],
        fileMetadata: {},
        dirtyFiles,
        dirtyTaskIds: [],
        reconcileCursor: 0,
        updatedAt: "2026-05-20T00:00:00.000Z"
      })
    };
    const tFiles = new Map(dirtyFiles.map((path) => [path, new TFile(path)]));
    const processed = [];
    const savedSettings = [];
    const plugin = new PluginClass();
    plugin.app = {
      vault: {
        configDir: "config",
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
          async mkdir() {}
        },
        getAbstractFileByPath(path) {
          return tFiles.get(path) || null;
        },
        async cachedRead(file) {
          return `- [ ] ${file.path}`;
        }
      },
      workspace: {
        getActiveFile() {
          return null;
        }
      }
    };
    plugin.loadData = async () => ({
      todoistAPISecretName: "todoist-main",
      automaticSynchronizationEnabled: true,
      automaticSynchronizationInterval: 300,
      disableTodoistInboundSync: false,
      debugMode: false
    });
    plugin.saveData = async (data) => {
      savedSettings.push(data);
    };

    await plugin.loadSettings();
    plugin.settings.apiInitialized = true;
    plugin.cacheOperation = { loadTasksFromCache: () => [] };
    plugin.todoistRestAPI = {};
    plugin.todoistSyncAPI = {};
    plugin.fileOperation = {};
    plugin.taskParser = {};
    plugin.todoistSync = {
      async syncTodoistToObsidian() {
        return { completed: 0, deleted: 0, cached: 0 };
      },
      async fullTextNewTaskCheck(path) {
        processed.push(["new", path]);
        return false;
      },
      async deletedTaskCheck(path) {
        processed.push(["deleted", path]);
      },
      async fullTextModifiedTaskCheck(path) {
        processed.push(["modified", path]);
      }
    };

    const summary = await plugin.scheduledSynchronization();
    const persistedState = JSON.parse(files[statePath]);

    assert.deepEqual(summary, { completed: 0, deleted: 0, cached: 0 });
    assert.equal(processed.filter(([kind]) => kind === "new").length, 25);
    assert.deepEqual(persistedState.dirtyFiles, dirtyFiles.slice(25));
    assert.equal(savedSettings.length > 0, true);
    assert.equal("todoistTasksData" in savedSettings.at(-1), false);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("mobile diagnostics await adapter state metadata without Node filesystem modules", async () => {
  const originalLoad = Module._load;
  class Plugin {}
  class PluginSettingTab {}
  class Setting {}
  class Notice {}
  class MarkdownView {}
  class TFile {}
  const obsidianMock = { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile };

  Module._load = function loadWithMobileRuntime(request, parent, isMain) {
    if (request === "obsidian") return obsidianMock;
    if (request === "fs" || request === "path" || request === "node:fs" || request === "node:path" || request === "node:sqlite") {
      throw new Error(`${request} is not available on mobile`);
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const PluginClass = require("../main.js").default;
    const statePath = "config/plugins/todoist-bridge/todoist-bridge-state.json";
    const files = {
      [statePath]: JSON.stringify({
        version: 1,
        revision: 9,
        tasks: [{ id: "task1", path: "Projects/mobile.md", content: "Mobile task" }],
        projects: [],
        events: [],
        fileMetadata: { "Projects/mobile.md": { todoistTasks: ["task1"], todoistCount: 1 } },
        dirtyFiles: ["Projects/mobile.md"],
        dirtyTaskIds: [],
        reconcileCursor: 3,
        tombstones: [{ taskId: "old", path: "Projects/old.md", reason: "detached", source: "mobile", createdAt: "2026-05-20T00:00:00.000Z" }],
        lastWriterDevice: "mobile-adapter",
        lastWriteReason: "scheduled-sync",
        lastWriteAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z"
      })
    };
    let createdReport = "";
    const plugin = new PluginClass();
    plugin.app = {
      vault: {
        configDir: "config",
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
          async mkdir() {}
        },
        async create(_path, content) {
          createdReport = content;
        }
      }
    };
    plugin.loadData = async () => ({
      todoistAPISecretName: "todoist-main",
      automaticSynchronizationEnabled: true,
      automaticSynchronizationInterval: 300,
      disableTodoistInboundSync: false,
      debugMode: false
    });
    plugin.getTimestampStrings = () => ({ display: "2026-05-20 06:30:00", filename: "2026-05-20_06-30-00" });

    await plugin.loadSettings();
    const reportPath = await plugin.runDiagnosticsExport();

    assert.equal(reportPath, "todoist_bridge_diagnostics_2026-05-20_06-30-00.md");
    assert.match(createdReport, /- Backend: adapter/);
    assert.match(createdReport, /- Revision: 9/);
    assert.match(createdReport, /- Dirty files: 1/);
    assert.match(createdReport, /- Tombstones: 1/);
    assert.match(createdReport, /- Last writer: mobile-adapter/);
    assert.match(createdReport, /- Last write reason: scheduled-sync/);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("mobile activity logging writes through the Obsidian adapter without Node filesystem modules", async () => {
  const originalLoad = Module._load;
  class Plugin {}
  class PluginSettingTab {}
  class Setting {}
  class Notice {}
  class MarkdownView {}
  class TFile {}
  const obsidianMock = { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile };

  Module._load = function loadWithMobileRuntime(request, parent, isMain) {
    if (request === "obsidian") return obsidianMock;
    if (request === "fs" || request === "path" || request === "node:fs" || request === "node:path" || request === "node:sqlite") {
      throw new Error(`${request} is not available on mobile`);
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const PluginClass = require("../main.js").default;
    const files = {};
    const plugin = new PluginClass();
    plugin.app = {
      vault: {
        configDir: "config",
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
      }
    };

    await plugin.logTaskActivity(
      { id: "task1", content: "Mobile done", path: "Projects/mobile.md", url: null, addedAt: null, createdAt: null },
      { status: "completed", dateClosedIso: "2026-05-20T00:00:00.000Z", source: "todoist" }
    );

    const logPath = "config/plugins/todoist-bridge/todoist-completions.log";
    assert.equal(Object.prototype.hasOwnProperty.call(files, logPath), true);
    const entries = files[logPath].trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(entries.map((entry) => [entry.taskId, entry.filePath, entry.status]), [
      ["task1", "Projects/mobile.md", "completed"]
    ]);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("mobile diagnostics report adapter-visible runtime state conflict files", async () => {
  const originalLoad = Module._load;
  class Plugin {}
  class PluginSettingTab {}
  class Setting {}
  class Notice {}
  class MarkdownView {}
  class TFile {}
  const obsidianMock = { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile };

  Module._load = function loadWithMobileRuntime(request, parent, isMain) {
    if (request === "obsidian") return obsidianMock;
    if (request === "fs" || request === "path" || request === "node:fs" || request === "node:path" || request === "node:sqlite") {
      throw new Error(`${request} is not available on mobile`);
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const PluginClass = require("../main.js").default;
    const statePath = "config/plugins/todoist-bridge/todoist-bridge-state.json";
    const conflictPath = "config/plugins/todoist-bridge/todoist-bridge-state (conflicted copy).json";
    const files = {
      [statePath]: JSON.stringify({
        version: 1,
        revision: 9,
        tasks: [],
        projects: [],
        events: [],
        fileMetadata: {},
        dirtyFiles: [],
        dirtyTaskIds: [],
        reconcileCursor: 3,
        tombstones: [],
        lastWriterDevice: "mobile-adapter",
        lastWriteReason: "scheduled-sync",
        lastWriteAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z"
      }),
      [conflictPath]: "{}"
    };
    let createdReport = "";
    const plugin = new PluginClass();
    plugin.app = {
      vault: {
        configDir: "config",
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
          async mkdir() {},
          async list(path) {
            const prefix = `${path}/`;
            return {
              files: Object.keys(files).filter((filePath) => filePath.startsWith(prefix)),
              folders: []
            };
          }
        },
        async create(_path, content) {
          createdReport = content;
        }
      }
    };
    plugin.loadData = async () => ({
      todoistAPISecretName: "todoist-main",
      automaticSynchronizationEnabled: true,
      automaticSynchronizationInterval: 300,
      disableTodoistInboundSync: false,
      debugMode: false
    });
    plugin.getTimestampStrings = () => ({ display: "2026-05-20 06:30:00", filename: "2026-05-20_06-30-00" });

    await plugin.loadSettings();
    await plugin.runDiagnosticsExport();

    assert.match(createdReport, /- State conflict files: 1/);
    assert.match(createdReport, /todoist-bridge-state \(conflicted copy\)\.json/);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});
