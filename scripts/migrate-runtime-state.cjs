#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const {
  BridgeStateStore,
  settingsWithoutRuntimeState
} = require("../src/state/bridge-state-store.cjs");

const pluginDir = path.resolve(__dirname, "..");
const dataPath = path.join(pluginDir, "data.json");

function isStateEmpty(snapshot) {
  return (!snapshot || !Array.isArray(snapshot.tasks) || snapshot.tasks.length === 0) &&
    (!snapshot || !Array.isArray(snapshot.events) || snapshot.events.length === 0) &&
    (!snapshot || !snapshot.fileMetadata || Object.keys(snapshot.fileMetadata).length === 0);
}

function main() {
  const settings = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const store = new BridgeStateStore({ dir: pluginDir, preferSqlite: true });
  const current = store.snapshot();
  const force = process.argv.includes("--force");
  const snapshot = force || isStateEmpty(current) ? store.migrateFromSettings(settings) : current;
  fs.writeFileSync(dataPath, JSON.stringify(settingsWithoutRuntimeState(settings), null, 2), "utf8");
  console.log(JSON.stringify({
    backend: snapshot.backend,
    revision: snapshot.revision,
    tasks: snapshot.tasks.length,
    projects: snapshot.projects.length,
    events: snapshot.events.length,
    fileMetadata: Object.keys(snapshot.fileMetadata || {}).length,
    migratedRuntimeState: force || isStateEmpty(current)
  }, null, 2));
}

main();
