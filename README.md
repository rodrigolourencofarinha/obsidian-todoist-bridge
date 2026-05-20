# Todoist Bridge

Todoist Bridge connects selected Markdown tasks with Todoist.

You choose which tasks are connected by adding `#todoist` to a normal Markdown task line. The plugin then keeps that task linked to Todoist so completion, reopening, and clear text changes can move between both apps.

Use it when you like writing tasks in notes, but want Todoist to remain your action list.

## Setup

Before using the bridge, you need:

- A Todoist account.
- A Todoist API token.
- Obsidian 1.12.7 or newer.

To set up the plugin:

1. Open Todoist.
2. Go to Todoist settings and copy your API token.
3. Open Obsidian Settings.
4. Open Todoist Bridge.
5. In Todoist API token, choose or create a secure token entry.
6. Paste your Todoist API token into that secure entry.
7. Choose the Todoist project where new note-created tasks should go.
8. Run `Sync now (Todoist <-> Obsidian)` once from the command palette.

The token is stored through Obsidian's secure storage. Todoist Bridge does not save the token value in normal plugin data.

## Daily use

Create a Markdown task and add `#todoist`:

```markdown
- [ ] Write project summary #todoist
```

Run `Sync now (Todoist <-> Obsidian)` or leave automatic sync on. Todoist Bridge creates the Todoist task and adds bridge metadata to the same line:

```markdown
- [ ] Write project summary #todoist <span class="todoist-bridge">[todoist_id:: 6abc...]</span> [link](https://app.todoist.com/app/task/6abc...)
```

Keep the bridge metadata on the task line. It is how the plugin knows that this note task and this Todoist task are the same task.

You can keep using the task normally:

- Check it in Obsidian to complete it in Todoist.
- Complete it in Todoist to check it in Obsidian.
- Reopen it in either place to reopen the other side.
- Edit the text in one place when the bridge can still clearly identify the task.
- Remove `#todoist` when you want the note task to stop syncing with Todoist.

Todoist Bridge only syncs task lines that contain `#todoist`. Other tasks in your notes are ignored.

## How the bridge works

Todoist Bridge uses three pieces of information:

- `#todoist` tells the plugin that a Markdown task should be connected.
- `[todoist_id:: ...]` stores the Todoist task ID.
- The Todoist link lets you open the matching task quickly.

On sync, the plugin looks for changed bridged tasks, compares them with Todoist, and applies the safest matching action.

When a new `#todoist` task has no Todoist ID, the plugin creates a Todoist task and writes the ID back into the note.

When a bridged task is completed in Obsidian, the plugin completes the Todoist task and marks the note line with completion metadata.

When a bridged task is completed in Todoist, the plugin checks the matching Markdown task.

When a task is reopened in either place, the plugin reopens the matching task and removes completion metadata from the note line.

When `#todoist` or the whole bridged line is removed from a note, the plugin detaches the bridge. It does not delete the Todoist task. This is intentional: removing text from a note should not unexpectedly delete work from Todoist.

When the Todoist bridge labels are removed from Todoist, the plugin detaches the note side and keeps a tombstone so stale local state does not recreate the old bridge.

## Settings

Todoist API token

Selects the secure token entry used to connect to Todoist. The plugin reads the token from secure storage when it syncs.

Default project

Chooses where new Todoist tasks are created when they start from a note. Existing bridged Todoist tasks stay in their current Todoist project.

Automatic sync

On: the plugin runs lightweight sync while Obsidian is open.

Off: the plugin syncs only when you run `Sync now (Todoist <-> Obsidian)`.

Two-way sync

On: Todoist changes can update note tasks. This includes completions, reopens, label removals, and supported text updates.

Off: note changes can still push to Todoist, but Todoist-side changes are ignored.

Sync interval

Controls how often automatic sync runs while Obsidian is open. The minimum is 20 seconds. Mobile background timers are best-effort, so mobile sync may run later than the interval when the app is in the background.

Debug mode

On: writes detailed sync and diagnostics messages to the developer console.

Off: keeps logging minimal. Leave this off unless you are troubleshooting.

## Commands

Todoist Bridge exposes one command in the command palette:

`Sync now (Todoist <-> Obsidian)`

Use this when you want to sync immediately. This is the safest command to keep visible because it performs the normal bridge behavior.

Audit, repair, diagnostics, cache rebuild, and backup actions are in plugin settings instead of the command palette. They are maintenance tools and should be run intentionally.

## Maintenance functions

Audit Todoist Bridge

Checks bridged tasks and writes a report. It does not change notes or Todoist. Use this first when you suspect that tasks are out of sync.

Repair Todoist Bridge

Applies Todoist-confirmed completions and rebuilds verified open-task state. Review an audit report before using repair.

Export Todoist Bridge Diagnostics

Writes a sanitized diagnostics report into the vault. The report is meant for troubleshooting and does not include the Todoist API token.

Rebuild Todoist Bridge Cache

Rebuilds local bridge state from unchecked `#todoist` task lines and Todoist verification. Use this if the local bridge state looks stale or inconsistent.

Backup Todoist Data

Writes a Todoist backup JSON file into the vault. Use this before larger repair work or when you want a local snapshot of Todoist data.

Maintenance actions that can change data ask for confirmation before running.

## Mobile behavior

Todoist Bridge can run on Obsidian mobile.

Normal sync is lightweight and uses the plugin's tracked bridge state instead of scanning the whole vault every time. This keeps mobile use practical for large vaults.

Mobile operating systems may pause background work. If Obsidian is not open, automatic sync may not happen immediately. When you need the latest state on mobile, open Obsidian and run `Sync now (Todoist <-> Obsidian)`.

For the most reliable mobile workflow:

- Keep automatic sync on.
- Open Obsidian before expecting a fresh sync.
- Use `Sync now` after editing many tasks.
- Avoid editing the same bridged task in both apps at the same time.

## Privacy and data

Todoist Bridge connects directly from Obsidian to Todoist through the Todoist API.

The plugin can create, read, update, complete, reopen, and detach bridged Todoist tasks. It does this only for tasks connected through the bridge.

The plugin does not include ads, analytics, telemetry, or a server-side component.

Plugin settings and runtime bridge state stay in the vault configuration area. Reports and backups are created only when you run the matching maintenance function.

## Troubleshooting

The task did not appear in Todoist

Check that the line is a Markdown task and includes `#todoist`:

```markdown
- [ ] Example task #todoist
```

Then run `Sync now (Todoist <-> Obsidian)`.

The task appears in Todoist but does not update in the note

Make sure two-way sync is on. Then run `Sync now`. If it still does not update, run Audit Todoist Bridge from settings and review the report.

The Todoist API token stopped working

Create or copy a fresh Todoist API token, update the secure token entry in Todoist Bridge settings, and run `Sync now`.

The note has a Todoist link but no longer syncs

Keep both `#todoist` and `[todoist_id:: ...]` on the task line. The link alone is not enough for reliable sync.

The task duplicated

This usually means the bridge metadata was removed or copied to another task line. Keep one bridged line per Todoist task. Run Audit Todoist Bridge to see which lines are linked.

The task was deleted from a note but still exists in Todoist

That is expected. Removing the note line detaches the bridge instead of deleting the Todoist task. Delete the task in Todoist if you want it gone there too.

A Todoist task was completed, but the note still shows unchecked

Run `Sync now`. If the task still does not change, run Audit Todoist Bridge. The report will show whether the plugin can still find the matching task line.

Older numeric Todoist links do not repair

Older Todoist task links sometimes used numeric IDs that the current Todoist API cannot resolve. Todoist Bridge keeps those links in your notes as local history, but it does not try to recreate or modify old numeric tasks.

The vault is large

Normal sync is designed to stay lightweight. Full audits, repairs, cache rebuilds, and backups may take longer because they intentionally inspect more data. Run those maintenance functions only when needed.
