# Knowledge Workspace — jstrain2.3

A local, single-owner CRUD learning application built with Next.js, React, Zustand and SQLite. Edit hierarchical pages and blocks, discuss blocks with comments, manage typed records, import/export Markdown and inspect page snapshots. The detailed junior-to-mid-level course begins at [astraupskill/README.md](astraupskill/README.md).

## Fresh setup

Use Node 22.16 or later. From this project folder:

```powershell
npm ci
npm run setup -- --owner "Your name"
npm run dev
```

Open `http://127.0.0.1:3000`. Setup prints a random owner token once; save it privately and enter it in the sign-in form. The browser keeps it in memory for the current tab, so a reload requires signing in again. Setup stores a hash, not the plain token, in SQLite. It refuses to overwrite an existing database or reset an existing owner credential.

For a production build on the same computer:

```powershell
npm run build
npm start
```

Development and start scripts bind to loopback. The default database is `.data/workspace.sqlite`. Do not commit databases, private backups or owner tokens. The project does not automatically create seed data when a request cannot find a database; run setup explicitly.

## Existing original workspace

The improvement delivery preserves your existing `.data` folder. Before adopting an old workspace, stop the application and make a private backup of the database and any SQLite sidecar files. If you prefer to explore the new version without adopting existing content, choose a different file first:

```powershell
$env:WORKSPACE_DB_FILE = Join-Path $PWD ".data\learning-workspace.sqlite"
npm run setup -- --owner "Learner"
npm run dev
```

To adopt an existing compatible database after backing it up, select its path and run `npm run setup -- --adopt`. Adoption validates the document before accepting it, adds owner/revision tables, preserves the existing state JSON, and copies recognized page-history entries into the current snapshot table. It leaves legacy tables intact. Incompatible legacy data is rejected for explicit investigation; there is no automatic destructive repair or reset. Adoption is one-way for that working copy; use your private backup to return to the earlier version.

The setup command is a direct Node script and does not load Next `.env.local` files. Set `WORKSPACE_DB_FILE` in the shell when using a custom path for setup and server. Restart the server after changing the configured database. If using a different port, also set `WORKSPACE_ORIGIN`, for example `http://127.0.0.1:3100`, and pass `--port 3100` to the dev/start script. Host and Origin checks require the configured loopback port.

## Editing and saving

Local edits autosave after a short delay. Save status describes accepted server state, not merely a finished request. Empty titles or invalid cover URLs remain local drafts until corrected. Cover images must use HTTPS URLs without embedded credentials. Page titles, text, records and request sizes have explicit limits enforced on the server.

If another tab saved first, or a write ended with an unknown outcome, your draft is retained and automatic replay stops. Choose Review latest, inspect competing values, choose resolutions, accept the reviewed draft and Save. Independent changes can combine; structurally invalid combinations cannot be accepted. Download local draft exports your unsaved candidate. Discard draft explicitly replaces it with accepted state.

Local drafts are scoped to the workspace instance and individual editing session in IndexedDB. A successful save clears only its own draft. Saved sessions are offered one at a time; unselected sessions remain stored for a later sign-in. A saved draft is offered for review after sign-in. If browser storage fails, keep the tab open or download your draft. Export legacy drafts reads the original browser's unversioned offline records without replaying or deleting them. This browser storage is not encrypted; use an appropriate private computer profile.

## Records, history and exports

Database blocks support text, number, checkbox, date, select and person-text fields; record creation/editing/deletion; property addition/rename/deletion; views, filters and sorts; and table, board, calendar, list and gallery rendering. Zero and false are preserved. Deleting a property cleans row/template values and dependent view settings. Board and calendar views keep unassigned or undated records visible. Existing row templates can create new records.

Snapshot capture stores accepted page content and comments. Restore preserves the current page hierarchy, deletion status and visibility label while restoring snapshot content. History is paginated and snapshots can be explicitly deleted. Export buttons read accepted state; save first to include recent edits. HTML escapes content; Markdown includes tables and fenced code; JSON exports workspace content without the authentication table. Markdown import is a supported block subset, not a lossless round trip for the entire workspace. JSON export is inspectable content, not an implemented restore command; keep a private database backup for operational recovery.

## Verification and boundaries

Run `npm test`, `npm run lint` and `npm run build`. See [verification evidence](astraupskill/VERIFICATION.md) for the checks actually performed and their limits. Original text files remain in [docs/original](docs/original/README.md.txt); the old `_learning` notes are linked as historical reference from their updated entry point.

This version is for local owner use. Visibility labels do not implement public links or separate per-page accounts. Presence shows other tabs in the same browser origin, not remote teammates. There is no durable operation-receipt protocol, general JSON restore UI, account recovery, encrypted local draft store or production deployment configuration. These are explicit extension topics in the course. Next and its matching lint package are pinned to 16.3.3; unused Prisma and collaboration dependencies were removed. Existing SQLite data is never bundled into course examples.
