#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const {
  bridgePathsEqual,
  classifyBridgeLine,
  getTodoistIdFromLine,
  getTodoistLinkTaskId,
  isUncheckedTodoistTaskLine,
  normalizeCompletionLine,
  normalizeRemoteOpenTask
} = require("../repair-core.cjs");
const {
  BridgeStateStore,
  settingsWithoutRuntimeState
} = require("../src/state/bridge-state-store.cjs");
const {
  fetchTodoistTask
} = require("../src/repair/todoist-fetch.cjs");

const pluginDir = path.resolve(__dirname, "..");
const defaultVaultDir = path.resolve(pluginDir, "../../..");

function parseArgs(argv) {
  const args = { apply: false, vault: defaultVaultDir, plugin: pluginDir };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--dry-run") args.apply = false;
    else if (arg === "--vault") args.vault = path.resolve(argv[++i]);
    else if (arg === "--plugin") args.plugin = path.resolve(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: TODOIST_API_TOKEN=... node scripts/repair-completed-todoist-tasks.cjs [--dry-run] [--apply] [--vault PATH] [--plugin PATH]");
      process.exit(0);
    }
  }
  return args;
}

function timestampStrings(timeZone = "America/Sao_Paulo") {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    display: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`,
    filename: `${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}`
  };
}

function walkMarkdownFiles(root) {
  const files = [];
  const skip = new Set([".git", ".obsidian", "node_modules"]);
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(full);
      }
    }
  };
  visit(root);
  return files;
}

function scanUncheckedBridgeTasks(vaultDir) {
  const candidates = [];
  for (const file of walkMarkdownFiles(vaultDir)) {
    const rel = path.relative(vaultDir, file).split(path.sep).join("/");
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!isUncheckedTodoistTaskLine(lines[i])) continue;
      candidates.push({
        absolutePath: file,
        path: rel,
        lineIndex: i,
        lineNumber: i + 1,
        line: lines[i],
        taskId: getTodoistIdFromLine(lines[i]),
        linkTaskId: getTodoistLinkTaskId(lines[i])
      });
    }
  }
  return candidates;
}

function cacheById(settings, stateSnapshot) {
  const map = new Map();
  const stateTasks = stateSnapshot && Array.isArray(stateSnapshot.tasks) ? stateSnapshot.tasks : [];
  const legacyTasks = settings && settings.todoistTasksData && Array.isArray(settings.todoistTasksData.tasks) ? settings.todoistTasksData.tasks : [];
  const tasks = stateTasks.length ? stateTasks : legacyTasks;
  for (const task of tasks) {
    if (task && task.id != null) map.set(String(task.id), task);
  }
  return map;
}

function hasLegacyRuntime(settings) {
  return !!(settings && (settings.todoistTasksData || settings.fileMetadata));
}

function isStateEmpty(snapshot) {
  return (!snapshot || !Array.isArray(snapshot.tasks) || snapshot.tasks.length === 0) &&
    (!snapshot || !Array.isArray(snapshot.events) || snapshot.events.length === 0) &&
    (!snapshot || !snapshot.fileMetadata || Object.keys(snapshot.fileMetadata).length === 0);
}

function writeReport(vaultDir, result) {
  const stamp = timestampStrings();
  const mode = result.apply ? "Apply" : "Dry Run";
  const lines = [
    `# Todoist Bridge Repair - ${mode} (${stamp.display})`,
    "",
    "## Summary",
    `- Unchecked bridged tasks scanned: ${result.scanned}`,
    `- Verified Todoist completions: ${result.toComplete.length}`,
    `- Verified open tasks retained in bridge state: ${result.openRecords.length}`,
    `- Broken or unverifiable links: ${result.broken.length}`,
    `- URL/id mismatches: ${result.urlMismatches.length}`,
    `- Stale cached paths: ${result.stalePaths.length}`,
    `- Files changed: ${result.changedFiles.length}`,
    ""
  ];
  const addSection = (title, rows, render) => {
    lines.push(`## ${title}`);
    if (!rows.length) {
      lines.push("- None", "");
      return;
    }
    for (const row of rows) {
      lines.push(render(row));
    }
    lines.push("");
  };
  addSection("Verified Completions", result.toComplete, (row) => `- ${row.path}:${row.lineNumber} \`${row.taskId}\` - ${row.remoteTask.completed_at || row.remoteTask.updated_at || "completed date unavailable"}`);
  addSection("Broken or Unverifiable Links", result.broken, (row) => `- ${row.path}:${row.lineNumber} \`${row.taskId}\` - ${row.reason}`);
  addSection("URL/id Mismatches", result.urlMismatches, (row) => `- ${row.path}:${row.lineNumber} \`${row.taskId}\` link points to \`${row.linkTaskId}\``);
  addSection("Stale Cached Paths", result.stalePaths, (row) => `- \`${row.taskId}\` cache: \`${row.cachedPath}\` -> note: \`${row.path}\``);
  const reportName = `todoist_bridge_repair_${stamp.filename}${result.apply ? "_applied" : "_dry_run"}.md`;
  const reportPath = path.join(vaultDir, reportName);
  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
  return reportPath;
}

async function main() {
  const args = parseArgs(process.argv);
  const dataPath = path.join(args.plugin, "data.json");
  const settings = fs.existsSync(dataPath) ? JSON.parse(fs.readFileSync(dataPath, "utf8")) : {};
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) throw new Error("TODOIST_API_TOKEN environment variable is required.");

  const stateStore = new BridgeStateStore({ dir: args.plugin, preferSqlite: true });
  let stateSnapshot = stateStore.snapshot();
  if (hasLegacyRuntime(settings) && isStateEmpty(stateSnapshot)) {
    stateSnapshot = stateStore.migrateFromSettings(settings);
  }
  const cachedById = cacheById(settings, stateSnapshot);
  const candidates = scanUncheckedBridgeTasks(args.vault);
  const result = {
    apply: args.apply,
    scanned: candidates.length,
    toComplete: [],
    openRecords: [],
    broken: [],
    urlMismatches: [],
    stalePaths: [],
    changedFiles: []
  };

  const contentByFile = new Map();
  for (const candidate of candidates) {
    const cachedTask = cachedById.get(candidate.taskId) || null;
    const remoteTask = await fetchTodoistTask(token, candidate.taskId);
    const classification = classifyBridgeLine({ ...candidate, remoteTask, cachedTask });
    if (candidate.linkTaskId && candidate.linkTaskId !== candidate.taskId) {
      result.urlMismatches.push(candidate);
    }
    if (cachedTask && cachedTask.path && !bridgePathsEqual(cachedTask.path, candidate.path)) {
      result.stalePaths.push({ ...candidate, cachedPath: cachedTask.path });
    }
    if (classification.shouldComplete) {
      result.toComplete.push({ ...candidate, remoteTask, cachedTask });
      if (args.apply) {
        if (!contentByFile.has(candidate.absolutePath)) {
          contentByFile.set(candidate.absolutePath, fs.readFileSync(candidate.absolutePath, "utf8").split("\n"));
        }
        const lines = contentByFile.get(candidate.absolutePath);
        const completedAt = remoteTask.completed_at || remoteTask.completedAt || remoteTask.updated_at || remoteTask.updatedAt || new Date().toISOString();
        lines[candidate.lineIndex] = normalizeCompletionLine(lines[candidate.lineIndex], candidate.taskId, completedAt);
      }
      continue;
    }
    if (remoteTask && !remoteTask.__missing && !remoteTask.__error && remoteTask.checked !== true && remoteTask.completed !== true && remoteTask.isCompleted !== true) {
      result.openRecords.push({
        path: candidate.path,
        task: normalizeRemoteOpenTask(remoteTask, candidate, cachedTask)
      });
    } else {
      const reason = classification.issues.length ? classification.issues.join("; ") : "not verified open or complete";
      result.broken.push({ ...candidate, reason });
    }
  }

  if (args.apply) {
    for (const [file, lines] of contentByFile.entries()) {
      fs.writeFileSync(file, lines.join("\n"), "utf8");
      result.changedFiles.push(path.relative(args.vault, file).split(path.sep).join("/"));
    }
    stateStore.rebuildFromOpenRecords(result.openRecords);
    if (fs.existsSync(dataPath)) {
      fs.writeFileSync(dataPath, JSON.stringify(settingsWithoutRuntimeState(settings), null, 2), "utf8");
    }
  }

  const reportPath = writeReport(args.vault, result);
  console.log(JSON.stringify({
    mode: args.apply ? "apply" : "dry-run",
    reportPath,
    scanned: result.scanned,
    toComplete: result.toComplete.length,
    openRecords: result.openRecords.length,
    broken: result.broken.length,
    stalePaths: result.stalePaths.length,
    urlMismatches: result.urlMismatches.length,
    changedFiles: result.changedFiles.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
