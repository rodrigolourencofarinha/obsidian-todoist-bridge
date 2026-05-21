# Todoist Bridge

Capture tasks naturally in Obsidian. Send only the important ones to Todoist.

Todoist Bridge connects selected Obsidian tasks with Todoist, so you can think and write in Obsidian while still executing from Todoist.

Add `#todoist` to any Obsidian task you want in Todoist. Todoist Bridge creates the matching Todoist task, keeps completion and renaming in sync, and leaves a clear explanation if the connection is ever removed.

Todoist Bridge does not delete or complete Todoist tasks just because something disappeared in Obsidian. If a connection is removed, the plugin detaches the task and explains what happened.

## Why Use Todoist Bridge?

Obsidian is where many tasks are born: meeting notes, project notes, research notes, daily notes, and scattered ideas. Todoist is where tasks get scheduled, prioritized, and done.

Todoist Bridge connects those workflows without forcing every Obsidian task into Todoist.

Use it when you want to:

- Capture tasks inside your notes first.
- Send only selected tasks to Todoist.
- Complete and reopen tasks from either app.
- Rename tasks from either app.
- Move notes without breaking task links.
- Disconnect tasks safely, with no surprise deletes.

## In One Minute

Example:

1. Write this in Obsidian:

   Call Ana tomorrow `#todoist`

2. Sync.
3. The task appears in Todoist.
4. Complete it in either app.
5. If the bridge is removed later, both apps explain what happened.

## Quick Start

1. Write a task in Obsidian.
2. Add `#todoist` to the task.
3. Run Sync now, or wait for automatic sync while Obsidian is open.
4. Open Todoist and confirm the task is there.
5. Keep working from either app.

## Active And Detached Tasks

Todoist Bridge has two task states: active and detached.

### Active

Active means the Obsidian task and the Todoist task are connected and syncing.

You can recognize an active task from either side:

- In Obsidian, the task has `#todoist`.
- In Todoist, the task has the Obsidian bridge label.

Example:

Call Ana tomorrow `#todoist`

While a task is active, completion, reopening, renaming, and note moves can sync between Obsidian and Todoist.

### Detached

Detached means the task used to be connected, but the connection has ended.

You can recognize a detached task from either side:

- In Obsidian, the task has `#todoist_detached`.
- In Todoist, the task has the `obsidian_detached` label.

Example:

Call Ana tomorrow `#todoist_detached`

Detached tasks no longer sync. The detached marker does not create a new Todoist task, and it does not reconnect to the old Todoist task. It is there so you can see that the task used to be connected and understand why the bridge ended.

## Everyday Sync

Most everyday changes are simple:

| You do this | Todoist Bridge does this |
|---|---|
| Add `#todoist` to an Obsidian task | Creates the matching task in Todoist |
| Complete the task in Obsidian | Completes the Todoist task |
| Complete the task in Todoist | Checks the Obsidian task |
| Reopen the task in either app | Reopens it in the other app |
| Rename the task in Obsidian | Updates the Todoist task name |
| Rename the task in Todoist | Updates the Obsidian task text |
| Move or rename the Obsidian note | Keeps the bridge active and updates the Todoist link back to Obsidian |

Example:

If you change Call Ana tomorrow `#todoist` to Call Ana Friday `#todoist` in Obsidian, Todoist Bridge renames the Todoist task to Call Ana Friday.

If you complete Call Ana Friday in Todoist, Todoist Bridge checks the Obsidian task on the next sync.

## Deleting Or Disconnecting Tasks

Todoist Bridge treats deletion and disconnection carefully. It does not assume you wanted to complete or destroy the task.

### You Remove `#todoist` In Obsidian

You change:

Call Ana tomorrow `#todoist`

to:

Call Ana tomorrow

The Obsidian task becomes a normal local task and stops syncing.

In Todoist, the task stays open. Todoist Bridge keeps your personal labels, removes the active bridge labels, adds `obsidian_detached`, and adds a comment explaining that the bridge tag was removed in Obsidian.

### You Delete The Obsidian Task Line

You delete the whole Obsidian task line:

Call Ana tomorrow `#todoist`

The local task line is gone, so there is nothing left to annotate in Obsidian.

In Todoist, the task stays open. It is not completed. Todoist Bridge adds `obsidian_detached` and a comment explaining that the original task line disappeared.

### You Delete The Obsidian Note

You delete a note that contains:

Call Ana tomorrow `#todoist`

The note is gone.

In Todoist, the task stays open. It is not completed. Todoist Bridge adds `obsidian_detached` and a comment explaining that the original Obsidian file was deleted.

### You Remove The Bridge Label In Todoist

You remove the label that Todoist Bridge uses to recognize the task.

In Todoist, the task stays open and receives `obsidian_detached`.

In Obsidian, the task is marked with `#todoist_detached`, a short note appears below the task, and the task stops syncing.

### You Delete The Todoist Task

You delete Call Ana tomorrow in Todoist.

The Todoist task is gone, so Todoist Bridge cannot add a label or comment to it.

In Obsidian, the local task is kept and marked with `#todoist_detached`.

Example after sync:

Call Ana tomorrow `#todoist_detached`

Detached from Todoist: remote task was deleted or unavailable. Original Todoist ID: 6abc... 2026-05-21T13:46:47.344Z.

The task is now local to Obsidian. It is no longer connected to Todoist.

## Mobile Sync

Todoist Bridge supports normal daily use on mobile.

On mobile, you can create, complete, reopen, rename, and detach tasks safely.

Mobile background sync depends on the phone operating system. If you want immediate certainty, open Obsidian and use Sync now.

Example:

You complete Call Ana tomorrow in Todoist on your phone. Later, open Obsidian and use Sync now. The Obsidian task is checked.

## FAQ

### What does `#todoist_detached` mean?

It means the task used to be connected to Todoist, but it is not syncing anymore.

### Will `#todoist_detached` create a new Todoist task?

No. It is only an audit marker.

### What does `obsidian_detached` mean in Todoist?

It means the Todoist task used to be connected to Obsidian, but the bridge has ended.

### If I delete an Obsidian note, will Todoist tasks be deleted?

No. Todoist Bridge detaches those Todoist tasks and explains that the original Obsidian file was deleted.

### If I delete a Todoist task, will Obsidian delete the local task?

No. Obsidian keeps the local task and marks it with `#todoist_detached`.

### When should I use Sync now?

Use Sync now when you want immediate certainty, especially after editing on mobile or after changing tasks directly in Todoist.
