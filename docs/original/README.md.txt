# Real-Time Collaborative Document & Knowledge Base

A Notion-style collaborative workspace built with Next.js (App Router), SQLite, Zustand, dnd-kit, and Fuse.js.

## Stack

- Next.js 16 + React 19
- JavaScript only (no TypeScript)
- SQLite (`better-sqlite3`) for persistence
- Zustand for client state management
- dnd-kit for block drag/drop reordering
- Fuse.js for full-text quick find
- IndexedDB for offline draft + sync queue

## Implemented Features

- Block-based editor:
  - paragraph, heading1-3, bullet, number, callout, code, divider, database blocks
  - per-block type switching
  - drag-and-drop block reordering
  - inline comments on blocks with threaded replies and resolve/unresolve
- Page hierarchy:
  - nested pages with recursive sidebar tree
  - expand/collapse tree navigation
  - breadcrumbs
  - move page between parents
  - page icon + cover image URL
- Collaboration mechanics:
  - cross-tab live state sync via `BroadcastChannel`
  - presence ("X is viewing this page")
  - live typing indicators per block
  - conflict resolution by latest `updatedAt` state
- Offline support:
  - workspace draft stored in IndexedDB
  - failed saves queued in IndexedDB and replayed when online
  - debounced autosave
- Databases:
  - inline database block with typed properties
  - row editing
  - table / board / list-style(calendar+gallery cards) view rendering
  - database templates in seed state
- Search:
  - full-text API search across pages + blocks
  - command palette (`Cmd/Ctrl + K`)
  - recent pages shown in palette when query is empty
- Sharing/permissions:
  - per-page privacy mode (`private`, `workspace`, `public`)
- Import/export:
  - import Markdown into a new page
  - export page as Markdown
  - export page as HTML
- Favorites/recent:
  - favorite page toggles
  - recent page tracking
- Trash:
  - soft delete + restore
- Version history:
  - snapshot capture
  - list snapshots per page
  - diff summary and restore

## Data Model Coverage

SQLite schema includes:

- `workspaces`
- `users`
- `workspace_members`
- `pages`
- `blocks`
- `databases`
- `database_properties`
- `database_views`
- `database_view_filters`
- `database_view_sorts`
- `comments`
- `comment_threads`
- `page_versions`
- `templates`
- `shared_links`
- `favorites`
- `page_activity`

The app persists current operational state in `workspace_state` for fast load/sync.

## API Endpoints

- `GET /api/workspace` load workspace state
- `PUT /api/workspace` save workspace state
- `POST /api/workspace` create page snapshot version
- `GET /api/workspace/version?pageId=...` list page versions
- `GET /api/workspace/version?versionId=...` get one version payload
- `PATCH /api/workspace/version` restore a version
- `GET /api/search?q=...` full-text search
- `POST /api/import/markdown` import Markdown page
- `GET /api/export/markdown?pageId=...` export page markdown
- `GET /api/export/html?pageId=...` export page HTML

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npx eslint src --ext .js
npm run build
```

