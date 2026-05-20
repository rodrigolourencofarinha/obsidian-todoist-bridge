const TODOIST_TAG_RE = /(^|\s)#todoist\b/i;
const TODOIST_ID_RE = /(?:(?:%%\s*)|(?:<!--\s*)|(?:<span class="todoist-bridge">\s*))?\[todoist_id::\s*([A-Za-z0-9_-]+)\](?:(?:\s*%%)|(?:\s*-->)|(?:\s*<\/span>))?/i;
const TODOIST_LINK_RE = /\[link\]\((https?:\/\/[^)\s]+)\)/i;
const TASK_RE = /^(\s*[-*]\s*)\[(x|X| )\](\s*)/;

function getTodoistIdFromLine(line) {
  const match = TODOIST_ID_RE.exec(line || "");
  return match ? match[1] : null;
}

function getTodoistLinkTaskId(line) {
  const match = TODOIST_LINK_RE.exec(line || "");
  if (!match) return null;
  const taskMatch = /\/task\/([A-Za-z0-9_-]+)/.exec(match[1]);
  return taskMatch ? taskMatch[1] : null;
}

function isTodoistTaskLine(line) {
  return TASK_RE.test(line || "") && TODOIST_TAG_RE.test(line || "") && !!getTodoistIdFromLine(line);
}

function isUncheckedTodoistTaskLine(line) {
  const match = TASK_RE.exec(line || "");
  return !!match && match[2] === " " && TODOIST_TAG_RE.test(line || "") && !!getTodoistIdFromLine(line);
}

function isCheckedTodoistTaskLine(line) {
  const match = TASK_RE.exec(line || "");
  return !!match && /x/i.test(match[2]) && TODOIST_TAG_RE.test(line || "") && !!getTodoistIdFromLine(line);
}

function normalizeCompletionDate(value) {
  const parsed = value ? new Date(value) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return {
    iso: date.toISOString(),
    displayDate: date.toISOString().slice(0, 10)
  };
}

function normalizeCompletionLine(line, taskId, completedAt, metadataKey = "todoist_completion") {
  const timestamp = normalizeCompletionDate(completedAt);
  let next = String(line || "");
  if (TASK_RE.test(next)) {
    next = next.replace(TASK_RE, `$1[x]$3`);
  }

  const escapedKey = metadataKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const completionTokenPattern = new RegExp(`\\[${escapedKey}::\\s*[^\\]]+\\]`, "gi");
  const legacyTokenPattern = /\[completed::\s*[^\]]+\]/gi;
  const metadataToken = `[${metadataKey}:: ${timestamp.displayDate}]`;
  const spanPattern = /<span class="todoist-bridge">([\s\S]*?)<\/span>/i;
  const ensureMetadata = (metadata) => {
    let result = String(metadata || "").replace(/\s+/g, " ").trim();
    result = result.replace(legacyTokenPattern, "").replace(completionTokenPattern, "").trim();
    if (!/\[todoist_id::\s*[^\]]+\]/i.test(result)) {
      result = `[todoist_id:: ${taskId}] ${result}`.trim();
    }
    result = result.replace(/\s+/g, " ").trim();
    return `${result} ${metadataToken}`.replace(/\s+/g, " ").trim() + " ";
  };

  if (spanPattern.test(next)) {
    next = next.replace(spanPattern, (_match, metadata) => `<span class="todoist-bridge">${ensureMetadata(metadata)}</span>`);
  } else {
    next = `${next.trimEnd()} <span class="todoist-bridge">${ensureMetadata("")}</span>`;
  }

  next = next.replace(legacyTokenPattern, " ");
  next = next.replace(new RegExp(`(^|\\s)(?:completed|${escapedKey})::\\s*[\\w:-]+`, "gi"), "$1");
  return next.replace(/\s{2,}/g, " ").trimEnd();
}

function isRemoteCompleted(remoteTask) {
  return !!remoteTask && (remoteTask.checked === true || remoteTask.isCompleted === true || remoteTask.completed === true);
}

function isRemoteOpen(remoteTask) {
  return !!remoteTask && !remoteTask.__missing && !remoteTask.__error && !isRemoteCompleted(remoteTask);
}

function normalizeBridgePathForCompare(filepath) {
  return String(filepath || "").trim().split("\\").join("/").normalize("NFC");
}

function bridgePathsEqual(left, right) {
  return normalizeBridgePathForCompare(left) === normalizeBridgePathForCompare(right);
}

function classifyBridgeLine({ line, path: filepath, lineNumber, remoteTask, cachedTask }) {
  const taskId = getTodoistIdFromLine(line);
  const linkTaskId = getTodoistLinkTaskId(line);
  const issues = [];
  if (!taskId) {
    issues.push("malformed id");
  }
  if (taskId && linkTaskId && linkTaskId !== taskId) {
    issues.push(`URL/id mismatch (${linkTaskId})`);
  }
  if (cachedTask && cachedTask.path && !bridgePathsEqual(cachedTask.path, filepath)) {
    issues.push(`stale cached path (${cachedTask.path})`);
  }
  if (remoteTask && remoteTask.__missing) {
    issues.push("missing in Todoist");
  }
  if (remoteTask && remoteTask.__error) {
    issues.push(`Todoist fetch error: ${remoteTask.__error}`);
  }
  return {
    taskId,
    path: filepath,
    lineNumber,
    checked: isCheckedTodoistTaskLine(line),
    shouldComplete: isUncheckedTodoistTaskLine(line) && isRemoteCompleted(remoteTask),
    issues
  };
}

function normalizeRemoteOpenTask(remoteTask, candidate, cachedTask) {
  const content = remoteTask.content != null ? String(remoteTask.content) : cachedTask && cachedTask.content || "";
  return {
    ...(cachedTask || {}),
    ...remoteTask,
    id: String(remoteTask.id || candidate.taskId),
    content,
    path: candidate.path,
    isCompleted: false,
    url: remoteTask.url || `https://app.todoist.com/app/task/${candidate.taskId}`,
    origin: remoteTask.origin || (cachedTask && cachedTask.origin) || "todoist"
  };
}

function rebuildSettingsForOpenTasks(settings, openRecords) {
  const clone = { ...settings };
  const tasks = [];
  const fileMetadata = {};
  const seen = new Set();
  for (const record of openRecords || []) {
    const task = record && record.task ? record.task : record;
    if (!task || task.id == null || !record.path) continue;
    const id = String(task.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const normalized = { ...task, id, path: record.path, isCompleted: false };
    tasks.push(normalized);
    if (!fileMetadata[record.path]) {
      fileMetadata[record.path] = { todoistTasks: [], todoistCount: 0 };
    }
    fileMetadata[record.path].todoistTasks.push(id);
    fileMetadata[record.path].todoistCount = fileMetadata[record.path].todoistTasks.length;
  }
  clone.todoistTasksData = {
    ...(clone.todoistTasksData || {}),
    tasks,
    projects: Array.isArray(clone.todoistTasksData && clone.todoistTasksData.projects) ? clone.todoistTasksData.projects : [],
    events: Array.isArray(clone.todoistTasksData && clone.todoistTasksData.events) ? clone.todoistTasksData.events : []
  };
  clone.fileMetadata = fileMetadata;
  return clone;
}

module.exports = {
  classifyBridgeLine,
  bridgePathsEqual,
  getTodoistIdFromLine,
  getTodoistLinkTaskId,
  isCheckedTodoistTaskLine,
  isRemoteCompleted,
  isRemoteOpen,
  isTodoistTaskLine,
  isUncheckedTodoistTaskLine,
  normalizeCompletionDate,
  normalizeCompletionLine,
  normalizeRemoteOpenTask,
  rebuildSettingsForOpenTasks
};
