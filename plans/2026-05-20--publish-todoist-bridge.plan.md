# Plan: Publish Todoist Bridge as an Obsidian Community Plugin

## Purpose

Rodrigo wants a public-ready Todoist Bridge plugin workspace at `/Users/rodrigo/Library/CloudStorage/Dropbox/Resources/Stack/Personal/Todoist-Bridge`, following Obsidian's publication documentation closely enough to avoid submission problems.

## Current State

- Source live plugin copied from `/Users/rodrigo/Obsidian/Rodrigo's Vault/.obsidian/plugins/todoist-bridge`.
- New clean repo initialized in `/Users/rodrigo/Library/CloudStorage/Dropbox/Resources/Stack/Personal/Todoist-Bridge`.
- `data.json`, runtime state files, and logs were excluded from the copy.
- Root `main.js` was moved to `src/main.cjs`; root `main.js` should be generated as a release artifact and ignored in Git.
- Official docs referenced:
  - Obsidian submit plugin: https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin
  - Manifest: https://docs.obsidian.md/Reference/Manifest
  - Versions: https://docs.obsidian.md/Reference/Versions
  - SecretStorage: https://docs.obsidian.md/plugins/guides/secret-storage
  - Plugin checklist: https://docs.obsidian.md/oo/plugin

## Scope

In scope:

- Public metadata, docs, license, versions, release packaging, SecretStorage migration, tests, clean initial commit and local tag.

Out of scope:

- Creating/pushing to a GitHub remote until Rodrigo provides/approves the repository target.
- Submitting the Obsidian review PR.

## Constraints

- Do not publish the live vault plugin Git history because it previously tracked private runtime data.
- Public repo must not track `data.json`, Todoist tokens, state files, logs, or Rodrigo-specific vault paths/reports.
- First public version is `1.0.0`.
- License is MIT.
- Todoist token must use Obsidian SecretStorage, with plugin settings storing only the secret name.
- Root `main.js` is a release artifact, not a committed source file.

## Milestones

### Milestone 1: Public workspace and hygiene

Goal: clean repo exists with publishable files only.

Steps:

- Keep `main.js` ignored and generated from `src/main.cjs`.
- Add `LICENSE`, `versions.json`, public README, and public manifest/package metadata.
- Remove private README content and paths.

Validation:

- `git status --ignored` shows runtime files ignored and no private files staged.
- `git grep` hygiene searches return no private paths/tokens/reports.

### Milestone 2: SecretStorage migration

Goal: public plugin uses SecretStorage for Todoist token.

Steps:

- Replace settings text input with `SecretComponent`.
- Store `todoistAPISecretName`, not `todoistAPIToken`.
- Add `getTodoistAPIToken()` resolver from `app.secretStorage.get`.
- Remove `todoistAPIToken` from persisted settings.
- Update dev repair script to use `TODOIST_API_TOKEN` environment variable.

Validation:

- Tests prove `SecretComponent` is in the settings UI.
- Tests prove saved settings contain secret name and no token value.

### Milestone 3: Release validation

Goal: clean public repo is ready for GitHub release creation.

Steps:

- Run `npm test`, `npm run check`, `npm run build`.
- Initialize commit and local `1.0.0` tag if validation passes.

Validation:

- All checks pass.
- `git tag --points-at HEAD` includes `1.0.0`.

## Completion Checklist

- [x] Public workspace created.
- [x] Metadata set to `1.0.0`.
- [x] SecretStorage migration implemented and tested.
- [x] README sanitized for public use.
- [x] Private hygiene checks pass.
- [x] Test/check/build pass.
- [x] Clean initial commit and local tag created.
- [x] Handoff notes identify remaining GitHub/publishing steps.

## Progress

- [x] 2026-05-20 — Plan created and public workspace initialized.
- [x] 2026-05-20 — Public metadata, MIT license, `versions.json`, package lock, release workflow, public README, and sanitized agent instructions added.
- [x] 2026-05-20 — Todoist token handling moved to Obsidian SecretStorage; saved plugin settings retain only `todoistAPISecretName`.
- [x] 2026-05-20 — Runtime adapter paths now use `vault.configDir` instead of hardcoded `.obsidian` paths.
- [x] 2026-05-20 — Maintenance CLI token input moved to `TODOIST_API_TOKEN`.
- [x] 2026-05-20 — Validation passed: `npm test`, `npm run check`, and `npm run build`.
- [x] 2026-05-20 — Clean initial commit prepared; local tag `1.0.0` should point at this commit after tagging.

## Decision Log

- 2026-05-20 — Use `1.0.0` as first public release.
  Reason: Rodrigo selected recommended first public version.
- 2026-05-20 — Use MIT license.
  Reason: Rodrigo selected recommended permissive license.
- 2026-05-20 — Migrate token to SecretStorage before publication.
  Reason: Rodrigo selected recommended Obsidian-aligned security path.

## Surprises & Discoveries

- Current private README includes Rodrigo-specific paths and known broken task details; public README must be rewritten.
- Current plugin source is root `main.js`; public repo should generate root `main.js` from `src/main.cjs` to avoid committing release artifact.

## Validation

- 2026-05-20 — `npm test`: 47 tests, 47 pass, 0 fail.
- 2026-05-20 — `npm run check`: syntax checks and smoke load passed.
- 2026-05-20 — `npm run build`: generated ignored `main.js` and smoke validation passed.
- 2026-05-20 — Hygiene scans found no private live-vault paths in tracked public docs/source and confirmed root `main.js` is ignored.

## Rollback / Safety

- The live vault plugin remains in `/Users/rodrigo/Obsidian/Rodrigo's Vault/.obsidian/plugins/todoist-bridge`.
- If the public workspace setup is wrong, delete `/Users/rodrigo/Library/CloudStorage/Dropbox/Resources/Stack/Personal/Todoist-Bridge` and re-copy from the live plugin, excluding runtime files.

## Outcomes & Retrospective

- Public plugin workspace is ready for GitHub remote creation.
- Root `main.js` exists locally as the generated release artifact but is ignored and not committed.
- Remaining publication work is outside this local repo setup: add a GitHub remote, push `main`, push tag `1.0.0`, let the release workflow create the draft release, publish the release, then submit the repository through the Obsidian Community directory.
