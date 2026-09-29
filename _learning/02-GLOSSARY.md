> Historical guide for the original implementation. Start with the [current CRUD learning course](../astraupskill/README.md) for the delivered code, setup and verified behavior. The [unaltered original guide](../docs/original/_learning/02-GLOSSARY.md.txt) is preserved for comparison. Claims below about autosave, sharing or collaboration describe the earlier design and should not be used as current guarantees.

﻿# Concepts Glossary

Each concept has:
- Plain-English definition
- Project example (from this repo)
- One extra mini-example

## API Route
Definition: A server function that handles HTTP requests.
Project example: `src/app/api/workspace/route.js` handles `GET`, `PUT`, and `POST`.
Extra mini-example: A `GET /api/health` route returning `{ ok: true }`.

## App Router (Next.js)
Definition: Next.js file-based routing using `app/`.
Project example: `src/app/page.js` is `/`, and `src/app/api/search/route.js` is `/api/search`.
Extra mini-example: `src/app/about/page.js` would create `/about`.

## State Management
Definition: How app data is stored, updated, and shared in UI.
Project example: `useWorkspaceStore` in `src/lib/workspaceStore.js`.
Extra mini-example: A `theme` store with `theme: 'light' | 'dark'`.

## Immutable Update
Definition: Create new objects/arrays instead of mutating old ones.
Project example: `updatePage` returns mapped pages array.
Extra mini-example: `next = old.map(x => x.id===id ? {...x,done:true} : x)`.

## Recursive Data Structure
Definition: Data where items can contain same kind of items.
Project example: Pages have `parentId`; tree built recursively in `buildPageTree`.
Extra mini-example: Folder tree where each folder has child folders.

## Recursion
Definition: Function calls itself to solve smaller sub-problems.
Project example: `buildPageTree(...)` calls itself for each child page.
Extra mini-example: `factorial(n) = n * factorial(n-1)`.

## Derived State
Definition: Data computed from base state instead of stored separately.
Project example: `breadcrumbs`, `favoritePages`, `visiblePresence` in `WorkspaceApp`.
Extra mini-example: `completedCount = todos.filter(t=>t.done).length`.

## Debounce
Definition: Delay execution until activity pauses.
Project example: autosave waits 650ms; search waits 180ms.
Extra mini-example: Search input that only queries after typing stops.

## Side Effect
Definition: Code that touches outside world (network, storage, timers, DOM events).
Project example: `fetch`, `BroadcastChannel`, IndexedDB, `window.addEventListener` in `useEffect`.
Extra mini-example: writing analytics event after button click.

## BroadcastChannel
Definition: Browser API for messaging between tabs of same origin.
Project example: cross-tab state/presence sync in `WorkspaceApp`.
Extra mini-example: logging out in one tab logs out another tab immediately.

## Offline Queue
Definition: Store failed requests locally and replay later.
Project example: `queueSync` + `flushSyncQueue`.
Extra mini-example: mobile app caches "send message" actions offline.

## IndexedDB
Definition: Browser database for structured local storage.
Project example: `src/lib/offlineStore.js` stores drafts and sync queue.
Extra mini-example: caching large API responses for offline reading.

## Upsert
Definition: Insert a row or update existing row when key already exists.
Project example: `upsertWorkspaceState` with `ON CONFLICT`.
Extra mini-example: save user profile by email without duplicate rows.

## Serialization
Definition: Convert in-memory object to storable/transmittable form.
Project example: `JSON.stringify(state)` in SQLite writes.
Extra mini-example: store cart object in localStorage as JSON.

## Deserialization
Definition: Convert stored text back into objects.
Project example: `JSON.parse(row.state_json)`.
Extra mini-example: reading persisted settings from JSON file.

## Optimistic UI
Definition: Update UI before server confirms success.
Project example: store updates immediately, then autosave runs.
Extra mini-example: like button increments instantly, rollback on failure.

## Soft Delete
Definition: Mark data as deleted instead of permanently removing it.
Project example: `isDeleted: true` plus `trash` list.
Extra mini-example: archived emails can be restored from trash.

## Version Snapshot
Definition: Point-in-time copy of resource state.
Project example: `savePageVersion` stores page + blocks in `page_versions`.
Extra mini-example: photo editor "save version" before risky edits.

## Full-Text Search (Fuzzy)
Definition: Search text with approximate matching.
Project example: Fuse.js in `src/app/api/search/route.js`.
Extra mini-example: query "eng note" still finds "Engineering Notes".

## Sanitization / Escaping
Definition: Convert unsafe characters so they are treated as text, not code.
Project example: `escapeHtml` in HTML export route.
Extra mini-example: show user comment `<script>` literally, not executable.

## Content-Disposition
Definition: HTTP header controlling file download behavior.
Project example: markdown/html export routes set attachment filename.
Extra mini-example: serving CSV as `report.csv` download.

## Runtime Boundary (Client vs Server)
Definition: Some code only runs in browser, some only on server.
Project example: `"use client"` in `WorkspaceApp`; Node runtime in API routes.
Extra mini-example: never call `window.localStorage` inside server route.

## Closure
Definition: Function remembers variables from outer scope.
Project example: `useEffect` callbacks using `workspaceId`, `store`, timers.
Extra mini-example: `makeCounter` returns function that still knows `count`.

## Referential Stability
Definition: Keeping function/object identity stable to avoid extra effects/renders.
Project example: `flushSyncQueue` wrapped in `useCallback`.
Extra mini-example: memoized callback passed to child prevents re-render loops.

## Guard Clause
Definition: Early return for invalid/unwanted conditions.
Project example: route handlers return 400 when params missing.
Extra mini-example: `if (!user) return null;` before rendering profile.

## Tree Traversal
Definition: Visiting hierarchical nodes systematically.
Project example: `getBreadcrumbs`, `flattenPageTree`, `buildPageTree`.
Extra mini-example: compute total file size by walking nested folders.

## Mapping / Filtering / Reducing
Definition: Core array transformations.
Project example: many `.map()/.filter()` calls for pages, comments, blocks.
Extra mini-example: cart total with `reduce` over item prices.

## Idempotent Read Endpoint
Definition: Repeated read request gives same result without changing state.
Project example: `GET /api/workspace`.
Extra mini-example: calling `/api/products` repeatedly doesn’t modify DB.

## Non-Idempotent Write Endpoint
Definition: Request changes state and repeated calls may produce new effects.
Project example: `POST /api/workspace` creates new version each call.
Extra mini-example: `POST /api/orders` creates additional orders.

## Fallback Logic
Definition: Use default when preferred value missing.
Project example: `state.pages.find(...) || state.pages[0]` in export routes.
Extra mini-example: use default avatar if user has no uploaded image.

## Runtime Validation
Definition: Checking input shape at runtime before using it.
Project example: `PUT /api/workspace` verifies `pages` and `blocksByPage` shape.
Extra mini-example: reject API request when `email` is missing.

## Transaction (Concept)
Definition: Group database writes so all succeed or all fail.
Project example: Not currently used in `sqlite.js` (good improvement area).
Extra mini-example: transfer money should debit and credit atomically.

## Single Source of Truth
Definition: One canonical state location.
Project example: `workspaceStore` is the UI source of truth.
Extra mini-example: forms controlled by one state object, not scattered refs.

## Schema Drift
Definition: DB schema exists but app usage diverges from it.
Project example: many relational tables are defined, but primary writes go to `workspace_state` JSON blob.
Extra mini-example: table has `status` column but app stores status in JSON field instead.

## Technical Debt
Definition: Fast implementation choices that cost future work.
Project example: `window.prompt` comments/replies and full-state saves.
Extra mini-example: copying logic into multiple files instead of shared helper.

## CRDT (Concept)
Definition: Data structure that merges concurrent edits safely.
Project example: not implemented yet; current cross-tab sync is timestamp-based.
Extra mini-example: collaborative text editor merging edits from two users offline.

## Conflict Resolution
Definition: Rules for deciding which update wins.
Project example: `applyRemoteState` keeps newer `meta.updatedAt` state.
Extra mini-example: "last write wins" for profile bio updates.

## Accessibility (A11y)
Definition: Making UI usable by more users, including assistive tech.
Project example: drag handle has `aria-label="Drag block"`.
Extra mini-example: buttons should have visible labels and keyboard focus styles.

## CSS Design Tokens
Definition: Reusable variables for color/spacing/typography.
Project example: `--bg`, `--panel`, `--line`, `--danger` in `globals.css`.
Extra mini-example: set `--brand-color` once and reuse across components.

## Separation of Concerns
Definition: Split responsibilities into focused modules.
Project example: storage in `sqlite.js`, UI in `WorkspaceApp.js`, state in `workspaceStore.js`.
Extra mini-example: payment logic in service file, not in button component.
