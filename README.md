# Todoist Bridge

Todoist Bridge keeps selected Obsidian Markdown tasks in sync with Todoist.

Add `#todoist` to a Markdown task, run sync, and the plugin creates or updates the matching Todoist task. Complete or reopen the task in either app, and the other side follows.

## Requirements

- Obsidian 1.12.7 or newer.
- A Todoist account.
- A Todoist API token.

## Install

After Todoist Bridge is published in the Obsidian community plugin directory:

1. Open Obsidian Settings.
2. Go to Community plugins.
3. Search for Todoist Bridge.
4. Install and enable the plugin.

Until then, you can install a release manually by copying `main.js`, `manifest.json`, and `styles.css` from the latest GitHub release into:

```text
<your vault>/.obsidian/plugins/todoist-bridge/
```

Then restart Obsidian and enable Todoist Bridge in Community plugins.

## Set Up

1. In Todoist, copy your API token from Todoist settings.
2. In Obsidian, open Settings, then Todoist Bridge.
3. Select or create a secure token entry for your Todoist API token.
4. Choose the Todoist project where new Obsidian tasks should be created.
5. Run `Sync now (Todoist <-> Obsidian)` from the command palette.

The plugin stores the token through Obsidian's secure storage. It does not save the token value in normal plugin data.

## Use

Create a normal Markdown task and add `#todoist`:

```markdown
- [ ] Write project summary #todoist
```

After sync, Todoist Bridge adds a Todoist link and a small bridge marker to the line:

```markdown
- [ ] Write project summary #todoist <span class="todoist-bridge">[todoist_id:: 6abc...] </span> [link](https://app.todoist.com/app/task/6abc...)
```

Keep that marker on the task line. It is how the plugin knows which Obsidian task matches which Todoist task.

## What Sync Does

- Checking a bridged task in Obsidian completes it in Todoist.
- Reopening a bridged task in Obsidian reopens it in Todoist.
- Completing a bridged task in Todoist checks it in Obsidian.
- Reopening a bridged task in Todoist unchecks it in Obsidian.
- Editing the task text in either app updates the other side when the match is clear.

Todoist Bridge does not delete your Todoist task when you remove the Obsidian line or remove `#todoist`. Instead, it safely detaches the two sides.

## Mobile

Todoist Bridge can run on Obsidian mobile. Normal sync is lightweight and does not scan your whole vault on every run.

Mobile operating systems can pause background work, so automatic sync may not happen immediately when Obsidian is in the background. When you need the latest state on mobile, open Obsidian and run `Sync now (Todoist <-> Obsidian)`.

## Settings

- Todoist API token: choose the secure token entry used to connect to Todoist.
- Default project: choose where new Todoist tasks are created.
- Automatic sync: when on, the plugin syncs while Obsidian is open. When off, it only syncs when you run `Sync now`.
- Two-way sync: when on, Todoist changes can update Obsidian. When off, Obsidian can still send changes to Todoist, but Todoist changes are ignored.
- Sync interval: choose how often automatic sync runs while Obsidian is open.
- Debug mode: when on, the plugin writes extra messages to the developer console. Leave this off unless you are troubleshooting.

## Maintenance Tools

Maintenance tools are in Settings, not in the command palette.

- Audit Todoist Bridge checks bridged tasks and writes a report. It does not change notes or Todoist.
- Repair Todoist Bridge applies Todoist-confirmed completions and rebuilds verified open-task state. Review an audit first.
- Export Todoist Bridge Diagnostics writes a sanitized report for troubleshooting.
- Rebuild Todoist Bridge Cache rebuilds local bridge state from your notes and Todoist.
- Backup Todoist Data writes a Todoist backup file into your vault.

Mutating maintenance actions ask for confirmation before running.

## Privacy

Todoist Bridge connects directly from Obsidian to Todoist. It uses the Todoist API to create, read, update, complete, reopen, and detach bridged tasks.

The plugin does not include ads, analytics, telemetry, or any server-side component.

Plugin settings and runtime state stay inside your Obsidian vault configuration folder. Audit, repair, diagnostics, and backup files are created only when you run those maintenance actions.

## Troubleshooting

If a task does not sync:

1. Make sure the line is a Markdown task and contains `#todoist`.
2. Run `Sync now (Todoist <-> Obsidian)`.
3. Check that your Todoist API token is still valid.
4. Run Audit Todoist Bridge from Settings and review the report.

Older Todoist links with numeric IDs are treated as historical local links. The plugin keeps them in your notes but does not try to recreate or modify those old tasks through Todoist's current API.

## Development

Install and check locally:

```bash
npm install
npm test
npm run check
npm run build
```

`main.js` is generated from `src/main.cjs` and is not committed. GitHub releases include the generated `main.js`, `manifest.json`, and `styles.css` files required by Obsidian.
