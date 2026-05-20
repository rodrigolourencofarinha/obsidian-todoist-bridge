# Todoist Bridge Agent Instructions

## Purpose

This repository is the public-source workspace for the Todoist Bridge Obsidian plugin.

## Core Contract

- Todoist and Markdown are sources of truth. Cache/state is an index.
- Automatic sync must stay incremental. Do not reintroduce a scheduled loop over every cached file or every cached task.
- Local deletion or `#todoist` removal means detach: remove Todoist bridge labels, then remove local bridge metadata/cache. Never delete or complete the Todoist task for a detach.
- Todoist bridge-label removal means detach locally: remove `#todoist`, the Todoist link, and `[todoist_id:: ...]`, then drop cache.
- Missing or inaccessible Todoist tasks are broken links, not completed tasks.
- Cached paths are not authoritative. Resolve by exact `[todoist_id:: ...]` when cache and Markdown disagree.

## Settings And State

- Persist only public-safe settings: `todoistAPISecretName`, `defaultProjectId`, `automaticSynchronizationInterval`, `automaticSynchronizationEnabled`, `disableTodoistInboundSync`, and `debugMode`.
- Do not persist Todoist API token values. Use Obsidian SecretStorage and store only the secret name.
- Runtime state belongs in `todoist-bridge-state.sqlite` with `todoist-bridge-state.json` as fallback/mirror.
- Obsidian mobile cannot rely on Node `fs`, `path`, or `node:sqlite`. Keep `main.js` loadable without those modules and use the Obsidian adapter fallback state store on mobile.
- Mobile is a first-class daily-use client for normal sync. Do not add Node-only helpers to create, complete, reopen, detach, scheduled sync, or manual sync paths.
- Mobile background sync is best-effort while Obsidian is open; manual `Sync now` must remain the reliable mobile trigger.
- Full audit, repair, and rebuild are explicit maintenance flows and should remain desktop-preferred for large vaults.
- Keep the command palette limited to manual sync. Maintenance actions belong in Settings with explanatory descriptions and confirmation on mutating actions.
- Desktop must reconcile SQLite with the JSON mirror on startup. Treat JSON as the cross-device handoff format and SQLite as the desktop cache.
- Detached bridges should record short tombstones so stale cache from another device cannot resurrect the bridge.
- Diagnostics should report backend, revision, dirty queue counts, tombstone count, last-writer metadata, and possible runtime-state conflict files.
- Do not resurrect legacy settings such as `initialized`, `apiInitialized`, `defaultProjectName`, `todoistCreationOnlyMode`, `enableFullVaultSync`, tag exclusion lists, or cleanup toggles.

## Runtime Artifact Rule

`main.js` is the generated Obsidian release artifact. It must be loadable by itself but should not be committed.

Do not add runtime `require("./src/...")` calls to generated `main.js`. Keep source helpers under `src/` for tests/scripts, but inline or bundle any helpers needed by `main.js`.

## Required Checks

Run these before saying the plugin is ready:

```bash
npm test
npm run check
npm run build
```

For behavior changes, add or update tests first. The suite includes static checks that Settings stays clean and scheduled sync does not iterate every cached metadata file.

## Repair Workflow

The CLI repair script must receive the Todoist token from the environment:

```bash
TODOIST_API_TOKEN=replace-with-token node scripts/repair-completed-todoist-tasks.cjs --dry-run --vault /path/to/vault --plugin /path/to/plugin-install-dir
```

Apply only after reviewing the dry-run summary:

```bash
TODOIST_API_TOKEN=replace-with-token node scripts/repair-completed-todoist-tasks.cjs --apply --vault /path/to/vault --plugin /path/to/plugin-install-dir
```

Apply only checks off Markdown tasks that Todoist currently confirms as completed. It also rebuilds bridge state from verified open tasks, canonicalizes stale cached paths, and writes a report in the vault root. If the dry run shows `Verified Todoist completions: 0`, apply should not modify Markdown files.

## Files To Know

- `src/main.cjs`: source for the generated plugin artifact.
- `main.js`: generated release artifact, ignored in Git.
- `src/repair/repair-core.cjs`: Markdown parsing and completion normalization helpers.
- `src/state/bridge-state-store.cjs`: settings/state split, dirty queues, merge logic.
- `src/sync/sync-core.cjs`: sync planning, detach planning, dirty-file selection, rolling reconciliation.
- `tests/main-runtime.test.cjs`: runtime smoke behavior for Obsidian-side detach.
- `tests/main-mobile.test.cjs`: mobile-like load/state smoke test with Node filesystem modules blocked.
- `tests/main-surface.test.cjs`: static product-surface guardrails.
- `scripts/repair-completed-todoist-tasks.cjs`: CLI repair/audit.
- `scripts/migrate-runtime-state.cjs`: migration from old `data.json` runtime cache to dedicated state.
- `scripts/smoke-load-main.cjs`: startup smoke test for `main.js`.

## Runtime Files

These are local runtime files and should remain untracked:

```text
data.json
todoist-completions.log
todoist-bridge-state.sqlite
todoist-bridge-state.json
```

`data.json` should not contain Todoist token values, `todoistTasksData`, `fileMetadata`, or `statistics`.
