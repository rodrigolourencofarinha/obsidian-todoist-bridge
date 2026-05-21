const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const releaseWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "release.yml"), "utf8");
const repairScript = fs.readFileSync(path.join(root, "scripts", "repair-completed-todoist-tasks.cjs"), "utf8");

test("manifest uses public community plugin metadata", () => {
  assert.equal(manifest.id, "todoist-bridge");
  assert.equal(manifest.id.includes("obsidian"), false);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.minAppVersion, "1.12.7");
  assert.equal(manifest.isDesktopOnly, false);
  assert.equal("fundingUrl" in manifest, false);
  assert.equal(manifest.description.length <= 250, true);
  assert.equal(manifest.description.endsWith("."), true);
});

test("command palette exposes only manual sync", () => {
  const commandIds = Array.from(main.matchAll(/id: "(todoist-bridge-[^"]+)"/g), (match) => match[1]);
  assert.deepEqual(commandIds, ["todoist-bridge-now"]);
  assert.equal(main.includes('name: "Sync now (Todoist ⇄ Obsidian)"'), true);
});

test("settings tab exposes maintenance actions with explicit descriptions", () => {
  const maintenanceRows = [
    ["Audit Todoist Bridge", "Dry-run scan. Writes a report only; does not change notes or Todoist."],
    ["Repair Todoist Bridge", "Applies Todoist-confirmed completions and rebuilds verified open-task state. Review an audit first."],
    ["Export Todoist Bridge Diagnostics", "Writes a sanitized diagnostics report without exposing the Todoist API token."],
    ["Rebuild Todoist Bridge Cache", "Rebuilds local bridge state from unchecked #todoist task lines and Todoist verification."],
    ["Backup Todoist Data", "Writes a Todoist backup JSON file into the vault."]
  ];

  assert.equal(main.includes('createEl("h3", { text: "Maintenance" })'), true);
  for (const [name, description] of maintenanceRows) {
    assert.equal(main.includes(`setName("${name}")`), true, name);
    assert.equal(main.includes(`setDesc("${description}")`), true, description);
  }
  assert.equal(main.includes("!confirm(confirmMessage)"), true);
  assert.equal(main.includes('"Repair Todoist Bridge?\\n\\n'), true);
  assert.equal(main.includes('"Rebuild Todoist Bridge Cache?\\n\\n'), true);
  assert.equal(main.includes('"Backup Todoist Data?\\n\\n'), true);
});

test("settings descriptions explain operational impact", () => {
  const expectedDescriptions = [
    "Select a Todoist API token from Obsidian SecretStorage. The token value is not saved in plugin data.",
    "Todoist project used for new Obsidian #todoist tasks. Existing bridged tasks stay where they are.",
    "On: run lightweight sync while Obsidian is open. Off: sync only when you use Sync now. Mobile timers are best-effort.",
    "On: pull Todoist completions, reopens, label removals, and content updates into Obsidian. Off: Obsidian changes can still push, but Todoist changes are ignored.",
    "Seconds between automatic sync runs. Minimum 20; mobile background timers are best-effort.",
    "On: write detailed sync and diagnostics messages to the developer console. Off: keep logging minimal."
  ];

  for (const description of expectedDescriptions) {
    assert.equal(main.includes(`setDesc("${description}")`), true, description);
  }
});

test("settings use SecretStorage for Todoist token selection", () => {
  assert.equal(main.includes("new import_obsidian.SecretComponent(this.app, el)"), true);
  assert.equal(main.includes("todoistAPISecretName"), true);
  assert.equal(main.includes(".settings.todoistAPIToken = value"), false);
  assert.equal(main.includes(".setValue(this.plugin.settings.todoistAPIToken)"), false);
  assert.equal(main.includes("getSecret("), true);
});

test("repair script uses environment token instead of plugin data token", () => {
  assert.equal(repairScript.includes("process.env.TODOIST_API_TOKEN"), true);
  assert.equal(repairScript.includes("settings.todoistAPIToken"), false);
});

test("automatic scheduled sync does not iterate every cached metadata file", () => {
  assert.equal(main.includes("const filesToSync = this.settings.fileMetadata"), false);
  assert.equal(main.includes("for (let fileKey in filesToSync)"), false);
});

test("legacy numeric migration is not exposed as normal product surface", () => {
  assert.equal(main.includes("Migrate Legacy Numeric Todoist IDs"), false);
  assert.equal(main.includes("runLegacyIdMigration"), false);
});

test("repair surface reports legacy numeric links separately", () => {
  assert.equal(main.includes("Legacy numeric links kept local-only"), true);
  assert.equal(main.includes('"Legacy Numeric Links"'), true);
  assert.equal(main.includes("legacy numeric todoist_id is local-only under Todoist API v1"), true);
});

test("bundled community plugin avoids direct Node filesystem access", () => {
  const disallowed = [
    'require("fs")',
    'require("path")',
    'require("node:fs")',
    'require("node:path")',
    "node:sqlite",
    "todoist-bridge-state.sqlite",
    "loadNodeModule",
    "class BridgeStateStore",
    "new import_bridge_state_store.BridgeStateStore",
    "requires Node filesystem modules"
  ];

  for (const text of disallowed) {
    assert.equal(main.includes(text), false, text);
  }
});

test("release workflow attests community plugin assets", () => {
  assert.match(releaseWorkflow, /id-token:\s*write/);
  assert.match(releaseWorkflow, /attestations:\s*write/);
  assert.match(releaseWorkflow, /artifact-metadata:\s*write/);
  assert.match(releaseWorkflow, /uses:\s*actions\/attest@v4/);
  assert.equal(releaseWorkflow.includes("main.js"), true);
  assert.equal(releaseWorkflow.includes("manifest.json"), true);
  assert.equal(releaseWorkflow.includes("styles.css"), true);
});

test("readme is consumer-facing instead of developer-facing", () => {
  const requiredHeadings = [
    "## Why Use Todoist Bridge?",
    "## In One Minute",
    "## Quick Start",
    "## Active And Detached Tasks",
    "## Everyday Sync",
    "## Deleting Or Disconnecting Tasks",
    "## Mobile Sync",
    "## FAQ"
  ];

  for (const heading of requiredHeadings) {
    assert.equal(readme.includes(heading), true, heading);
  }

  assert.equal(/^## Install\b/m.test(readme), false);
  assert.equal(/^## Development\b/m.test(readme), false);
  assert.equal(readme.includes("npm run"), false);
  assert.equal(readme.includes("Manual install"), false);
  assert.equal(readme.includes("CLI"), false);
  assert.equal(readme.includes("runtime"), false);
  assert.equal(readme.includes("cache"), false);
});
