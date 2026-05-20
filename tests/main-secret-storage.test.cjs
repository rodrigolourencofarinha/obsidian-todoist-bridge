const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

test("plugin resolves Todoist token from Obsidian SecretStorage", () => {
  const originalLoad = Module._load;

  Module._load = function loadWithObsidianMock(request, parent, isMain) {
    if (request === "obsidian") {
      class Plugin {}
      class PluginSettingTab {}
      class Setting {}
      class Notice {}
      class MarkdownView {}
      class TFile {}
      class SecretComponent {}
      return { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile, SecretComponent };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const PluginClass = require("../main.js").default;
    const plugin = new PluginClass();
    plugin.app = {
      secretStorage: {
        get(name) {
          return name === "todoist-main" ? "resolved-token" : null;
        }
      }
    };
    plugin.settings = {
      todoistAPISecretName: "todoist-main"
    };

    assert.equal(plugin.getTodoistAPIToken(), "resolved-token");
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});

test("settings save the SecretStorage name but strip legacy plaintext token", () => {
  const originalLoad = Module._load;

  Module._load = function loadWithObsidianMock(request, parent, isMain) {
    if (request === "obsidian") {
      class Plugin {}
      class PluginSettingTab {}
      class Setting {}
      class Notice {}
      class MarkdownView {}
      class TFile {}
      class SecretComponent {}
      return { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, TFile, SecretComponent };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../main.js")];
    const PluginClass = require("../main.js").default;
    const plugin = new PluginClass();
    plugin.settings = {
      todoistAPISecretName: "todoist-main",
      todoistAPIToken: "legacy-plaintext-token",
      automaticSynchronizationEnabled: true
    };

    const saved = plugin.prepareSettingsForSave();

    assert.equal(saved.todoistAPISecretName, "todoist-main");
    assert.equal("todoistAPIToken" in saved, false);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../main.js")];
  }
});
