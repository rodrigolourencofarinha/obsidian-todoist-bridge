#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceMain = path.join(root, "src/main.cjs");
const releaseMain = path.join(root, "main.js");

if (!fs.existsSync(sourceMain)) {
  console.error("Missing source artifact: src/main.cjs");
  process.exit(1);
}

fs.copyFileSync(sourceMain, releaseMain);

const requiredFiles = [
  "main.js",
  "src/main.cjs",
  "manifest.json",
  "src/state/bridge-state-store.cjs",
  "src/repair/repair-core.cjs",
  "src/sync/sync-core.cjs",
  "scripts/smoke-load-main.cjs"
];

for (const file of requiredFiles) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`Missing required build artifact: ${file}`);
    process.exit(1);
  }
}

for (const file of requiredFiles.filter((file) => file.endsWith(".js") || file.endsWith(".cjs"))) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const smoke = spawnSync(process.execPath, [path.join(root, "scripts/smoke-load-main.cjs")], { stdio: "inherit" });
if (smoke.status !== 0) {
  process.exit(smoke.status || 1);
}

console.log("Todoist Bridge build validation passed.");
