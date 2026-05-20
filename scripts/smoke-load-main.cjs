#!/usr/bin/env node
const Module = require("node:module");

const originalLoad = Module._load;

Module._load = function loadWithObsidianMock(request, parent, isMain) {
  if (request === "obsidian") {
    class Plugin {
      addCommand() {}
      addSettingTab() {}
      addStatusBarItem() {
        return { remove() {}, style: {} };
      }
      loadData() {
        return Promise.resolve({});
      }
      saveData() {
        return Promise.resolve();
      }
      registerDomEvent() {}
      registerEvent() {}
      registerInterval(id) {
        return id;
      }
    }
    class PluginSettingTab {
      constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
      }
    }
    class Setting {
      setName() { return this; }
      setDesc() { return this; }
      addText() { return this; }
      addComponent() { return this; }
      addExtraButton() { return this; }
      addToggle() { return this; }
      addDropdown() { return this; }
      addButton() { return this; }
    }
    class SecretComponent {}
    class Notice {
      constructor(message) {
        this.message = message;
      }
    }
    class MarkdownView {}
    return { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, SecretComponent };
  }
  return originalLoad.apply(this, arguments);
};

const pluginModule = require("../main.js");

if (typeof pluginModule.default !== "function") {
  throw new Error("main.js did not export a plugin class as default");
}

console.log("main.js load smoke passed");
