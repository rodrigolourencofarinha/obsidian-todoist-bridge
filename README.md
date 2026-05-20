# Todoist Bridge

Todoist Bridge syncs Todoist tasks with Obsidian Markdown task lines marked with `#todoist`.

The bridge follows one core rule: Todoist and Markdown are the sources of truth. Runtime state is only an index, so normal sync stays incremental instead of scanning every note and every Todoist task on each run.

## Requirements

- Obsidian 1.12.7 or later.
- A Todoist account and Todoist API token.
- Community plugins enabled in Obsidian.

Todoist Bridge is not desktop-only. Mobile can run the normal lightweight sync paths, but mobile operating systems can suspend timers and background network work. Use the command palette action `Sync now (Todoist <-> Obsidian)` when immediate mobile sync matters.

## Configuration

Open Obsidian Settings, then Todoist Bridge.

- Todoist API token: select or create a Todoist token in Obsidian SecretStorage. The plugin stores only the SecretStorage name in plugin data, not the token value.
- Default project: Todoist project used for new Obsidian `#todoist` task lines. Existing bridged tasks stay in their current Todoist project.
- Automatic sync: when on, Obsidian runs lightweight sync while the app is open. When off, the plugin syncs only when you run `Sync now`.
- Two-way sync: when on, Todoist completions, reopens, label removals, and content changes can update Obsidian. When off, Obsidian can still push changes to Todoist, but Todoist-side changes are ignored.
- Sync interval: seconds between automatic sync runs. The minimum is 20 seconds.
- Debug mode: when on, detailed sync messages are written to the developer console. When off, routine logging is suppressed.

Use the send icon beside the token selector after setting the token to initialize the Todoist connection and refresh available projects.

## Task Format

Create a Markdown task with `#todoist`:

```markdown
- [ ] #task Write summary #todoist
```

After sync, Todoist Bridge adds durable bridge metadata and a Todoist link:

```markdown
- [ ] #task Write summary #todoist <span class="todoist-bridge">[todoist_id:: 6abc...] </span> [link](https://app.todoist.com/app/task/6abc...)
```

When Todoist confirms completion, the Markdown line is checked and receives a completion marker:

```markdown
- [x] #task Write summary #todoist <span class="todoist-bridge">[todoist_id:: 6abc...] [todoist_completion:: 2026-05-19] </span> [link](https://app.todoist.com/app/task/6abc...)
```

`[todoist_id:: ...]` is the durable bridge identity. Cached file paths are hints.

## Backward Compatibility

Older Todoist task links can use numeric IDs such as `8879450871`. Todoist's current REST API uses the newer alphanumeric IDs for normal task operations, so Todoist Bridge keeps numeric `[todoist_id:: ...]` markers as local historical bridge markers.

Audit and repair reports list numeric links separately as legacy local-only links. The plugin does not recreate, delete, complete, or mark those tasks as broken just because the current API cannot verify the old numeric ID. Active alphanumeric task IDs keep the normal two-way sync behavior.

## Sync Behavior

Normal two-way sync:

- Obsidian check completes the Todoist task.
- Obsidian uncheck reopens the Todoist task.
- Todoist complete checks the Obsidian line.
- Todoist reopen unchecks the Obsidian line.
- Obsidian text changes update Todoist content when the bridge identity is clear.
- Todoist text changes update Obsidian content when the bridge identity is clear.

Detach behavior:

- If an Obsidian bridged task line is deleted, the Todoist task is not deleted or completed. The plugin removes bridge labels from the Todoist task, then removes the local bridge cache entry.
- If `#todoist` is removed from an Obsidian bridged line, the plugin removes bridge labels from Todoist and strips local bridge metadata/link from the note line.
- If Todoist loses the bridge label, the plugin removes `#todoist`, the Todoist link, and `[todoist_id:: ...]` from the Obsidian line, then drops the local cache entry.
- If the Todoist task is missing or inaccessible, the bridge reports it as broken. It does not mark the task complete by guessing.

## Lightweight Sync Model

Each scheduled sync processes:

- new Todoist activity events since the last processed event keys
- files marked dirty by Obsidian editor/change/rename events
- the active file during manual sync
- a bounded rolling reconciliation batch

Automatic sync does not iterate every cached note path. Full vault reconciliation is explicit through maintenance actions in Settings.

## Maintenance

Maintenance actions are in Settings instead of the command palette to reduce accidental runs.

- Audit Todoist Bridge: dry-run scan. Writes a report only; does not change notes or Todoist.
- Repair Todoist Bridge: applies Todoist-confirmed completions and rebuilds verified open-task state. Confirmation required.
- Export Todoist Bridge Diagnostics: writes a sanitized diagnostics report without exposing the Todoist API token.
- Rebuild Todoist Bridge Cache: rebuilds local bridge state from unchecked `#todoist` task lines and Todoist verification. Confirmation required.
- Backup Todoist Data: writes a Todoist backup JSON file into the vault. Confirmation required.

The command palette exposes only `Sync now (Todoist <-> Obsidian)`.

Repair skips legacy numeric Todoist IDs and reports them as local-only links. This preserves older completed archive lines without creating duplicate Todoist tasks.

## Data And Privacy

Todoist Bridge requires a Todoist account for full use and connects to Todoist APIs only to create, read, update, reopen, complete, and detach bridged tasks.

The plugin writes plugin settings and runtime state inside the Obsidian vault configuration folder. It can also write audit, repair, diagnostics, and Todoist backup files into the vault when the user runs the matching maintenance action.

The plugin does not include ads, client-side telemetry, server-side telemetry, or closed-source components. The Todoist API token is selected through Obsidian SecretStorage; plugin settings store only the selected secret name.

Runtime files are local state and should not be committed:

- `data.json`
- `todoist-bridge-state.sqlite`
- `todoist-bridge-state.json`
- `todoist-completions.log`

## Development

Install and check locally:

```bash
npm install
npm test
npm run check
npm run build
```

`main.js` is generated from `src/main.cjs` and is ignored in Git. Obsidian loads `main.js` directly, so release builds must produce a root `main.js` file.

Manual maintenance script:

```bash
TODOIST_API_TOKEN=replace-with-token node scripts/repair-completed-todoist-tasks.cjs --dry-run --vault /path/to/vault --plugin /path/to/plugin-install-dir
```

Use `--apply` only after reviewing the dry-run report.

## Release

For an Obsidian Community Plugin release:

1. Update `manifest.json` version using `x.y.z` semantic versioning.
2. Keep `versions.json` in sync when `minAppVersion` changes.
3. Run `npm test`, `npm run check`, and `npm run build`.
4. Create a Git tag that matches `manifest.json` version.
5. Push the tag. The release workflow verifies the tag/version match, runs the checks, builds `main.js`, and creates a public GitHub release with `main.js`, `manifest.json`, and `styles.css`.
6. Submit the GitHub repository through the Obsidian Community directory.

Obsidian reads the root `manifest.json` and `README.md` for the plugin listing, then installs the plugin files from the GitHub release whose tag exactly matches `manifest.json` version.
