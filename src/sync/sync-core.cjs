const {
  classifyBridgeLine,
  getTodoistIdFromLine,
  isRemoteOpen,
  normalizeRemoteOpenTask
} = require("../repair/repair-core.cjs");

const BRIDGE_LABELS = new Set(["obsidian", "todoist", "task"]);

function normalizeString(value) {
  return value == null ? "" : String(value).trim();
}

function normalizePath(value) {
  return normalizeString(value).split("\\").join("/");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueStrings(values) {
  const seen = new Set();
  const output = [];
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizePath(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function hasTodoistTag(line) {
  return /(^|\s)#todoist\b/i.test(String(line || ""));
}

function lineContainsTaskId(line, taskId) {
  const id = normalizeString(taskId);
  if (!id) return false;
  return new RegExp(`\\b${escapeRegExp(id)}\\b`).test(String(line || ""));
}

function removeBridgeLabels(labels, bridgeLabels = BRIDGE_LABELS) {
  const control = new Set(Array.from(bridgeLabels || []).map((label) => String(label).toLowerCase()));
  return (Array.isArray(labels) ? labels : []).filter((label) => {
    const normalized = normalizeString(label).toLowerCase();
    return normalized && !control.has(normalized);
  });
}

function mapGet(mapLike, key) {
  if (!mapLike || key == null) return null;
  if (typeof mapLike.get === "function") return mapLike.get(String(key)) || null;
  return mapLike[String(key)] || null;
}

function buildRepairPlan({ candidates, cachedTasksById, remoteTasksById }) {
  const plan = {
    scanned: Array.isArray(candidates) ? candidates.length : 0,
    toComplete: [],
    openRecords: [],
    broken: [],
    legacyNumeric: [],
    urlMismatches: [],
    stalePaths: []
  };

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const taskId = candidate.taskId || null;
    const cachedTask = mapGet(cachedTasksById, taskId);
    const remoteTask = mapGet(remoteTasksById, taskId);
    const classification = classifyBridgeLine({
      line: candidate.line,
      path: candidate.path,
      lineNumber: candidate.lineNumber,
      remoteTask,
      cachedTask
    });

    if (candidate.linkTaskId && candidate.linkTaskId !== taskId) {
      plan.urlMismatches.push(candidate);
    }
    if (cachedTask && cachedTask.path && cachedTask.path !== candidate.path) {
      plan.stalePaths.push({ ...candidate, cachedPath: cachedTask.path });
    }
    if (classification.shouldComplete) {
      plan.toComplete.push({ ...candidate, remoteTask, cachedTask });
      continue;
    }
    if (classification.legacyNumeric) {
      plan.legacyNumeric.push({ ...candidate, remoteTask, cachedTask, reason: classification.issues.join("; ") });
      continue;
    }
    if (isRemoteOpen(remoteTask)) {
      plan.openRecords.push({
        path: candidate.path,
        task: normalizeRemoteOpenTask(remoteTask, candidate, cachedTask)
      });
      continue;
    }
    const reason = classification.issues.length ? classification.issues.join("; ") : "not verified open or complete";
    plan.broken.push({ ...candidate, reason });
  }

  return plan;
}

function buildStateRecordsFromPlan(plan) {
  return Array.isArray(plan && plan.openRecords) ? plan.openRecords : [];
}

function buildObsidianDetachPlan({ path, content, trackedTaskIds, cachedTasksById }) {
  const lines = String(content || "").replace(/^---[\s\S]*?---\n/, "").split("\n");
  const plan = { path: normalizePath(path), detach: [], keep: [] };

  for (const rawTaskId of uniqueStrings(trackedTaskIds)) {
    const taskId = String(rawTaskId);
    const cachedTask = mapGet(cachedTasksById, taskId);
    let location = null;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (lineContainsTaskId(line, taskId)) {
        location = { line, lineIndex: index, lineNumber: index + 1 };
        break;
      }
    }
    if (!location) {
      plan.detach.push({ taskId, path: plan.path, cachedTask, reason: "missing-line" });
      continue;
    }
    if (!hasTodoistTag(location.line)) {
      plan.detach.push({ taskId, path: plan.path, cachedTask, reason: "todoist-tag-removed", ...location });
      continue;
    }
    plan.keep.push({ taskId, path: plan.path, cachedTask, ...location, parsedTaskId: getTodoistIdFromLine(location.line) });
  }

  return plan;
}

function selectDirtyFilesForSync({ dirtyFiles, activeFile, maxFiles = 25 }) {
  const limit = Math.max(0, Number.isFinite(Number(maxFiles)) ? Number(maxFiles) : 25);
  const ordered = uniqueStrings([activeFile, ...uniqueStrings(dirtyFiles)]);
  const files = ordered.slice(0, limit);
  const selected = new Set(files);
  const remainingDirtyFiles = uniqueStrings(dirtyFiles).filter((file) => !selected.has(file));
  return { files, remainingDirtyFiles };
}

function selectRollingReconciliationBatch({ tasks, cursor = 0, limit = 25 }) {
  const list = (Array.isArray(tasks) ? tasks : []).filter((task) => task && task.id != null);
  if (!list.length) {
    return { tasks: [], nextCursor: 0 };
  }
  const batchLimit = Math.max(0, Math.min(Number.isFinite(Number(limit)) ? Number(limit) : 25, list.length));
  const start = Math.max(0, Number.isFinite(Number(cursor)) ? Number(cursor) : 0) % list.length;
  const selected = [];
  for (let offset = 0; offset < batchLimit; offset++) {
    selected.push(list[(start + offset) % list.length]);
  }
  return {
    tasks: selected,
    nextCursor: (start + batchLimit) % list.length
  };
}

module.exports = {
  buildObsidianDetachPlan,
  buildRepairPlan,
  buildStateRecordsFromPlan,
  removeBridgeLabels,
  selectDirtyFilesForSync,
  selectRollingReconciliationBatch
};
