const STATE_VERSION = 1;
const JSON_STATE_FILENAME = "todoist-bridge-state.json";
const SQLITE_STATE_FILENAME = "todoist-bridge-state.sqlite";
const ADAPTER_STATE_PATH = "plugins/todoist-bridge/todoist-bridge-state.json";
const RUNTIME_SETTING_KEYS = new Set(["todoistTasksData", "fileMetadata", "statistics"]);
const PERSISTED_SETTING_KEYS = new Set([
  "todoistAPISecretName",
  "defaultProjectId",
  "automaticSynchronizationInterval",
  "automaticSynchronizationEnabled",
  "disableTodoistInboundSync",
  "debugMode"
]);

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function loadNodeModule(name) {
  try {
    return require(name);
  } catch {
    return null;
  }
}

function joinPath(...parts) {
  return parts.filter(Boolean).join("/").replace(/\/+/g, "/");
}

function emptyState() {
  return {
    version: STATE_VERSION,
    revision: 0,
    tasks: [],
    projects: [],
    events: [],
    fileMetadata: {},
    dirtyFiles: [],
    dirtyTaskIds: [],
    reconcileCursor: 0,
    tombstones: [],
    lastWriterDevice: null,
    lastWriteReason: null,
    lastWriteAt: null,
    updatedAt: null
  };
}

function normalizeId(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizePath(value) {
  if (typeof value !== "string") return "";
  return value.trim().split(/[\\/]+/).join("/");
}

function normalizeUniqueStrings(values) {
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

function normalizeTombstones(tombstones) {
  const byTaskId = new Map();
  for (const tombstone of Array.isArray(tombstones) ? tombstones : []) {
    if (!tombstone || tombstone.taskId == null) continue;
    const taskId = normalizeId(tombstone.taskId);
    if (!taskId) continue;
    const entry = {
      taskId,
      path: normalizePath(tombstone.path),
      reason: tombstone.reason ? String(tombstone.reason) : "detached",
      source: tombstone.source ? String(tombstone.source) : "unknown",
      createdAt: tombstone.createdAt || new Date().toISOString()
    };
    const existing = byTaskId.get(taskId);
    if (!existing || String(entry.createdAt) >= String(existing.createdAt)) {
      byTaskId.set(taskId, entry);
    }
  }
  return Array.from(byTaskId.values());
}

function getEventCacheKey(event) {
  if (!event) return "";
  if (event.eventKey) return String(event.eventKey);
  const eventType = event.event_type != null ? String(event.event_type) : "";
  const objectType = event.object_type != null ? String(event.object_type) : "";
  const objectId = event.object_id != null ? String(event.object_id) : "";
  const parentId = event.parent_item_id != null ? String(event.parent_item_id) : "";
  const eventDate = event.event_date != null ? String(event.event_date) : "";
  return [eventType, objectType, objectId, parentId, eventDate].join("|");
}

function normalizeEvent(event) {
  const eventKey = getEventCacheKey(event);
  if (!eventKey || eventKey === "||||") return null;
  return {
    id: event.id != null ? String(event.id) : eventKey,
    eventKey,
    event_type: event.event_type ?? null,
    object_type: event.object_type ?? null,
    object_id: event.object_id != null ? String(event.object_id) : null,
    parent_item_id: event.parent_item_id != null ? String(event.parent_item_id) : null,
    event_date: event.event_date ?? null
  };
}

function normalizeTaskForStore(task, now = () => new Date().toISOString()) {
  if (!task) return null;
  const id = normalizeId(task.id);
  const taskPath = normalizePath(task.path);
  const isCompleted = task.checked === true || task.completed === true || task.isCompleted === true;
  if (!id || !taskPath || isCompleted) return null;
  return {
    ...cloneJson(task),
    id,
    path: taskPath,
    isCompleted: false,
    origin: task.origin || "todoist",
    addedAt: task.addedAt || task.createdAt || now()
  };
}

function normalizeFileMetadata(fileMetadata) {
  const normalized = {};
  if (!fileMetadata || typeof fileMetadata !== "object") return normalized;
  for (const [rawPath, metadata] of Object.entries(fileMetadata)) {
    const filepath = normalizePath(rawPath);
    if (!filepath) continue;
    const ids = Array.isArray(metadata && metadata.todoistTasks) ? metadata.todoistTasks.map(normalizeId).filter(Boolean) : [];
    const unique = Array.from(new Set(ids));
    normalized[filepath] = {
      todoistTasks: unique,
      todoistCount: unique.length
    };
  }
  return normalized;
}

function normalizeState(state) {
  const base = { ...emptyState(), ...(state || {}) };
  const seenTasks = new Set();
  const tasks = [];
  for (const task of Array.isArray(base.tasks) ? base.tasks : []) {
    const normalized = normalizeTaskForStore(task);
    if (!normalized || seenTasks.has(normalized.id)) continue;
    seenTasks.add(normalized.id);
    tasks.push(normalized);
  }
  const seenProjects = new Set();
  const projects = [];
  for (const project of Array.isArray(base.projects) ? base.projects : []) {
    if (!project || project.id == null) continue;
    const id = String(project.id);
    if (seenProjects.has(id)) continue;
    seenProjects.add(id);
    projects.push({ ...cloneJson(project), id });
  }
  const seenEvents = new Set();
  const events = [];
  for (const event of Array.isArray(base.events) ? base.events : []) {
    const normalized = normalizeEvent(event);
    if (!normalized || seenEvents.has(normalized.eventKey)) continue;
    seenEvents.add(normalized.eventKey);
    events.push(normalized);
  }
  return {
    version: STATE_VERSION,
    revision: Number.isFinite(Number(base.revision)) ? Number(base.revision) : 0,
    tasks,
    projects,
    events: events.slice(-1e3),
    fileMetadata: normalizeFileMetadata(base.fileMetadata),
    dirtyFiles: normalizeUniqueStrings(base.dirtyFiles),
    dirtyTaskIds: normalizeUniqueStrings(base.dirtyTaskIds),
    reconcileCursor: Math.max(0, Number.isFinite(Number(base.reconcileCursor)) ? Number(base.reconcileCursor) : 0),
    tombstones: normalizeTombstones(base.tombstones),
    lastWriterDevice: base.lastWriterDevice ? String(base.lastWriterDevice) : null,
    lastWriteReason: base.lastWriteReason ? String(base.lastWriteReason) : null,
    lastWriteAt: base.lastWriteAt || null,
    updatedAt: base.updatedAt || null
  };
}

function stateFromSettings(settings) {
  const taskData = settings && settings.todoistTasksData || {};
  return normalizeState({
    tasks: Array.isArray(taskData.tasks) ? taskData.tasks : [],
    projects: Array.isArray(taskData.projects) ? taskData.projects : [],
    events: Array.isArray(taskData.events) ? taskData.events : [],
    fileMetadata: settings && settings.fileMetadata || {}
  });
}

function settingsWithoutRuntimeState(settings) {
  return normalizePersistedSettings(settings);
}

function normalizePersistedSettings(settings) {
  const output = {};
  for (const [key, value] of Object.entries(settings || {})) {
    if (RUNTIME_SETTING_KEYS.has(key)) continue;
    if (!PERSISTED_SETTING_KEYS.has(key)) continue;
    output[key] = cloneJson(value);
  }
  return output;
}

function stateToLegacyRuntime(state) {
  const normalized = normalizeState(state);
  return {
    todoistTasksData: {
      tasks: cloneJson(normalized.tasks),
      projects: cloneJson(normalized.projects),
      events: cloneJson(normalized.events)
    },
    fileMetadata: cloneJson(normalized.fileMetadata),
    statistics: {}
  };
}

function buildStateFromOpenRecords(openRecords, previousState = emptyState()) {
  const tasks = [];
  const seen = new Set();
  const fileMetadata = {};
  for (const record of Array.isArray(openRecords) ? openRecords : []) {
    const task = record && record.task ? record.task : record;
    const taskPath = normalizePath(record && record.path || task && task.path);
    const normalized = normalizeTaskForStore({ ...(task || {}), path: taskPath });
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    tasks.push(normalized);
    if (!fileMetadata[normalized.path]) {
      fileMetadata[normalized.path] = { todoistTasks: [], todoistCount: 0 };
    }
    fileMetadata[normalized.path].todoistTasks.push(normalized.id);
    fileMetadata[normalized.path].todoistCount = fileMetadata[normalized.path].todoistTasks.length;
  }
  const previous = normalizeState(previousState);
  const openIds = new Set(tasks.map((task) => task.id));
  return normalizeState({
    ...previous,
    tasks,
    fileMetadata,
    dirtyFiles: previous.dirtyFiles,
    dirtyTaskIds: previous.dirtyTaskIds,
    reconcileCursor: previous.reconcileCursor,
    tombstones: previous.tombstones.filter((tombstone) => !openIds.has(tombstone.taskId))
  });
}

function fileMetadataFromTasks(tasks) {
  const fileMetadata = {};
  for (const task of Array.isArray(tasks) ? tasks : []) {
    const normalized = normalizeTaskForStore(task);
    if (!normalized) continue;
    if (!fileMetadata[normalized.path]) {
      fileMetadata[normalized.path] = { todoistTasks: [], todoistCount: 0 };
    }
    if (!fileMetadata[normalized.path].todoistTasks.includes(normalized.id)) {
      fileMetadata[normalized.path].todoistTasks.push(normalized.id);
    }
    fileMetadata[normalized.path].todoistCount = fileMetadata[normalized.path].todoistTasks.length;
  }
  return fileMetadata;
}

function addRuntimeTombstone(state, tombstone) {
  const normalized = normalizeState(state);
  const entry = normalizeTombstones([{
    taskId: tombstone && tombstone.taskId,
    path: tombstone && tombstone.path,
    reason: tombstone && tombstone.reason,
    source: tombstone && tombstone.source,
    createdAt: tombstone && tombstone.createdAt
  }])[0];
  if (!entry) return normalized;
  const tombstones = normalizeTombstones([...normalized.tombstones.filter((item) => item.taskId !== entry.taskId), entry]);
  const tasks = normalized.tasks.filter((task) => task.id !== entry.taskId);
  return normalizeState({
    ...normalized,
    tasks,
    fileMetadata: fileMetadataFromTasks(tasks),
    tombstones
  });
}

function mergeRuntimeStates({ loaded, current, local }) {
  const loadedState = normalizeState(loaded);
  const currentState = normalizeState(current);
  const localState = normalizeState(local);
  const loadedIds = new Set(loadedState.tasks.map((task) => task.id));
  const currentIds = new Set(currentState.tasks.map((task) => task.id));
  const localById = new Map(localState.tasks.map((task) => [task.id, task]));
  const mergedById = new Map();

  for (const currentTask of currentState.tasks) {
    mergedById.set(currentTask.id, currentTask);
  }
  for (const localTask of localState.tasks) {
    const existedWhenLoaded = loadedIds.has(localTask.id);
    const stillExistsInCurrent = currentIds.has(localTask.id);
    if (existedWhenLoaded && !stillExistsInCurrent) {
      continue;
    }
    mergedById.set(localTask.id, localTask);
  }
  for (const loadedTask of loadedState.tasks) {
    if (!localById.has(loadedTask.id)) {
      mergedById.delete(loadedTask.id);
    }
  }

  const eventsByKey = new Map();
  for (const event of currentState.events) {
    eventsByKey.set(event.eventKey, event);
  }
  for (const event of localState.events) {
    eventsByKey.set(event.eventKey, event);
  }

  const tasks = Array.from(mergedById.values());
  const tombstones = normalizeTombstones([...currentState.tombstones, ...localState.tombstones]);
  const tombstoneIds = new Set(tombstones.map((tombstone) => tombstone.taskId));
  const activeTasks = tasks.filter((task) => !tombstoneIds.has(task.id));
  return normalizeState({
    ...currentState,
    tasks: activeTasks,
    events: Array.from(eventsByKey.values()).slice(-1e3),
    fileMetadata: fileMetadataFromTasks(activeTasks),
    dirtyFiles: normalizeUniqueStrings([...currentState.dirtyFiles, ...localState.dirtyFiles]),
    dirtyTaskIds: normalizeUniqueStrings([...currentState.dirtyTaskIds, ...localState.dirtyTaskIds]),
    reconcileCursor: Math.max(currentState.reconcileCursor || 0, localState.reconcileCursor || 0),
    tombstones
  });
}

function isEmptyRuntimeState(state) {
  const normalized = normalizeState(state);
  return normalized.tasks.length === 0 &&
    normalized.projects.length === 0 &&
    normalized.events.length === 0 &&
    Object.keys(normalized.fileMetadata).length === 0 &&
    normalized.dirtyFiles.length === 0 &&
    normalized.dirtyTaskIds.length === 0 &&
    normalized.tombstones.length === 0;
}

function compareStateFreshness(left, right) {
  const a = normalizeState(left);
  const b = normalizeState(right);
  if (a.revision !== b.revision) return a.revision > b.revision ? 1 : -1;
  const aTime = Date.parse(a.updatedAt || a.lastWriteAt || "");
  const bTime = Date.parse(b.updatedAt || b.lastWriteAt || "");
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime > bTime ? 1 : -1;
  return 0;
}

function resolvePersistentStates(primaryState, mirrorState) {
  const primary = primaryState ? normalizeState(primaryState) : null;
  const mirror = mirrorState ? normalizeState(mirrorState) : null;
  if (!primary || isEmptyRuntimeState(primary)) return mirror || emptyState();
  if (!mirror || isEmptyRuntimeState(mirror)) return primary;
  const comparison = compareStateFreshness(primary, mirror);
  if (comparison > 0) return primary;
  if (comparison < 0) return mirror;
  return normalizeState({
    ...mergeRuntimeStates({ loaded: emptyState(), current: primary, local: mirror }),
    revision: Math.max(primary.revision, mirror.revision),
    updatedAt: primary.updatedAt || mirror.updatedAt,
    lastWriterDevice: primary.lastWriterDevice || mirror.lastWriterDevice,
    lastWriteReason: primary.lastWriteReason || mirror.lastWriteReason,
    lastWriteAt: primary.lastWriteAt || mirror.lastWriteAt
  });
}

function tryOpenSqlite(filePath) {
  try {
    const sqlite = loadNodeModule("node:sqlite");
    if (!sqlite) return null;
    const DatabaseSync = sqlite.DatabaseSync;
    if (!DatabaseSync) return null;
    const database = new DatabaseSync(filePath);
    database.exec("CREATE TABLE IF NOT EXISTS bridge_state (id TEXT PRIMARY KEY, payload TEXT NOT NULL)");
    return database;
  } catch {
    return null;
  }
}

class BridgeStateStore {
  constructor({ dir, preferSqlite = true, writerDevice = "desktop" } = {}) {
    if (!dir) throw new Error("BridgeStateStore requires a directory");
    this.fs = loadNodeModule("node:fs") || loadNodeModule("fs");
    this.path = loadNodeModule("node:path") || loadNodeModule("path");
    if (!this.fs || !this.path) {
      throw new Error("BridgeStateStore requires Node filesystem modules");
    }
    this.dir = dir;
    this.writerDevice = writerDevice;
    this.fs.mkdirSync(this.dir, { recursive: true });
    this.jsonPath = this.path.join(this.dir, JSON_STATE_FILENAME);
    this.sqlitePath = this.path.join(this.dir, SQLITE_STATE_FILENAME);
    this.sqlite = preferSqlite ? tryOpenSqlite(this.sqlitePath) : null;
    this.backend = this.sqlite ? "sqlite" : "json";
    if (this.backend === "sqlite") {
      const resolved = resolvePersistentStates(this.readSqliteState(), this.readJsonState());
      this.writePersistentState(resolved);
    } else if (!this.fs.existsSync(this.jsonPath)) {
      this.writeState(emptyState(), { reason: "initialize" });
    }
  }

  readState() {
    if (this.backend === "sqlite") {
      return normalizeState(this.readSqliteState() || emptyState());
    }
    try {
      const text = this.fs.readFileSync(this.jsonPath, "utf8");
      return normalizeState(JSON.parse(text));
    } catch {
      return emptyState();
    }
  }

  readSqliteState() {
    if (!this.sqlite) return null;
    const row = this.sqlite.prepare("SELECT payload FROM bridge_state WHERE id = ?").get("state");
    if (!row || !row.payload) return null;
    return JSON.parse(row.payload);
  }

  readJsonState() {
    try {
      if (!this.fs.existsSync(this.jsonPath)) return null;
      return JSON.parse(this.fs.readFileSync(this.jsonPath, "utf8"));
    } catch {
      return null;
    }
  }

  writeJsonState(state) {
    const tmpPath = `${this.jsonPath}.${process.pid}.${Date.now()}.tmp`;
    this.fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf8");
    this.fs.renameSync(tmpPath, this.jsonPath);
  }

  writePersistentState(state) {
    const normalized = normalizeState(state);
    if (this.backend === "sqlite") {
      this.sqlite.prepare("INSERT INTO bridge_state (id, payload) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload").run("state", JSON.stringify(normalized));
      this.writeJsonState(normalized);
      return normalized;
    }
    this.writeJsonState(normalized);
    return normalized;
  }

  writeState(state, options = {}) {
    const current = this.readState();
    const now = new Date().toISOString();
    const next = normalizeState({
      ...state,
      revision: current.revision + 1,
      updatedAt: now,
      lastWriterDevice: options.writerDevice || this.writerDevice,
      lastWriteReason: options.reason || state.lastWriteReason || "runtime-save",
      lastWriteAt: now
    });
    return this.writePersistentState(next);
  }

  snapshot() {
    return {
      backend: this.backend,
      ...cloneJson(this.readState())
    };
  }

  getRevision() {
    return this.readState().revision;
  }

  migrateFromSettings(settings) {
    const state = stateFromSettings(settings);
    this.writeState(state, { reason: "migrate-legacy-settings" });
    return this.snapshot();
  }

  rebuildFromOpenRecords(openRecords) {
    const next = buildStateFromOpenRecords(openRecords, this.readState());
    this.writeState(next, { reason: "rebuild-open-records" });
    return this.snapshot();
  }

  replaceState(state, options = {}) {
    this.writeState(state, options);
    return this.snapshot();
  }
}

class AdapterBridgeStateStore {
  constructor({ adapter, statePath = ADAPTER_STATE_PATH, writerDevice = "mobile-adapter" } = {}) {
    if (!adapter || typeof adapter.read !== "function" || typeof adapter.write !== "function") {
      throw new Error("AdapterBridgeStateStore requires an Obsidian adapter with read/write");
    }
    this.adapter = adapter;
    this.statePath = normalizePath(statePath || ADAPTER_STATE_PATH);
    this.backend = "adapter";
    this.writerDevice = writerDevice;
  }

  async ensureParentDirectory() {
    if (typeof this.adapter.mkdir !== "function") return;
    const parts = this.statePath.split("/").slice(0, -1);
    let current = "";
    for (const part of parts) {
      current = current ? joinPath(current, part) : part;
      try {
        if (typeof this.adapter.exists === "function" && await this.adapter.exists(current)) continue;
        await this.adapter.mkdir(current);
      } catch {
        // Some mobile adapters already have plugin folders or do not support explicit mkdir.
      }
    }
  }

  async readState() {
    try {
      if (typeof this.adapter.exists === "function" && !await this.adapter.exists(this.statePath)) {
        return emptyState();
      }
      const text = await this.adapter.read(this.statePath);
      return normalizeState(JSON.parse(text));
    } catch {
      return emptyState();
    }
  }

  async writeState(state, options = {}) {
    const current = await this.readState();
    const now = new Date().toISOString();
    const next = normalizeState({
      ...state,
      revision: current.revision + 1,
      updatedAt: now,
      lastWriterDevice: options.writerDevice || this.writerDevice,
      lastWriteReason: options.reason || state.lastWriteReason || "runtime-save",
      lastWriteAt: now
    });
    await this.ensureParentDirectory();
    await this.adapter.write(this.statePath, JSON.stringify(next, null, 2));
    return next;
  }

  async snapshot() {
    return {
      backend: this.backend,
      ...cloneJson(await this.readState())
    };
  }

  async migrateFromSettings(settings) {
    await this.writeState(stateFromSettings(settings), { reason: "migrate-legacy-settings" });
    return this.snapshot();
  }

  async rebuildFromOpenRecords(openRecords) {
    await this.writeState(buildStateFromOpenRecords(openRecords, await this.readState()), { reason: "rebuild-open-records" });
    return this.snapshot();
  }

  async replaceState(state, options = {}) {
    await this.writeState(state, options);
    return this.snapshot();
  }
}

module.exports = {
  AdapterBridgeStateStore,
  ADAPTER_STATE_PATH,
  BridgeStateStore,
  JSON_STATE_FILENAME,
  SQLITE_STATE_FILENAME,
  STATE_VERSION,
  addRuntimeTombstone,
  buildStateFromOpenRecords,
  fileMetadataFromTasks,
  getEventCacheKey,
  mergeRuntimeStates,
  normalizePersistedSettings,
  normalizeEvent,
  normalizeTaskForStore,
  resolvePersistentStates,
  settingsWithoutRuntimeState,
  stateFromSettings,
  stateToLegacyRuntime
};
