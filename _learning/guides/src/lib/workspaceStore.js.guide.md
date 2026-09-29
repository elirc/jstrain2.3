> Historical guide for the original implementation. Start with the [current CRUD learning course](../../../../astraupskill/README.md) for the delivered code, setup and verified behavior. The [unaltered original guide](../../../../docs/original/_learning/guides/src/lib/workspaceStore.js.guide.md.txt) is preserved for comparison. Claims below about autosave, sharing or collaboration describe the earlier design and should not be used as current guarantees.

﻿# Guide: src/lib/workspaceStore.js

## Purpose
`workspaceStore.js` is the central client-side state engine for the app. It defines all important state slices (pages, blocks, comments, presence, typing, UI flags) and exposes actions that mutate state immutably. If you understand this file, you understand the app’s client domain model.

## Line-by-line walkthrough
### Imports and helpers
- `"use client"`: required because Zustand store runs in browser context.
- `nanoid`: creates IDs for new pages/blocks/comments.
- `create` from `zustand`: creates the store hook.
- `isDescendant` from `workspaceUtils`: safety guard for tree moves.

Local helpers:
- `DEFAULT_BLOCK`: fallback block when creating a page.
- `nowIso()`: normalized timestamp helper.
- `safeArray(value)`: guarantees arrays when hydrating uncertain payloads.

### Store creation shape
`create((set, get) => ({ ...initial state, ...actions }))`
- `set` mutates store state immutably.
- `get` reads current store state.

This closure (`set`, `get`) is captured by every action defined inside.

### Initial state slices
Main categories:
- Workspace identity: `workspaceId`, `currentUserId`, `meta`.
- Loading/error UI: `loading`, `loaded`, `error`.
- Domain entities: `users`, `pages`, `blocksByPage`, `commentThreads`, `comments`, `templates`, `favorites`, `sharedLinks`, `activities`, `trash`.
- View/interaction: `activePageId`, `expandedPageIds`, `commandPaletteOpen`, `commandPaletteQuery`, `selectedBlockId`, `showDeleted`.
- Collaboration: `presence`, `typing`.
- Save indicators: `pendingSaves`, `lastSavedAt`.

Why this grouping matters:
- One source of truth keeps the UI consistent across sidebars/editor/right panel.

### Hydration and base setters
#### `hydrateWorkspace(workspaceId, state)`
- Normalizes arrays with `safeArray`.
- Chooses first non-deleted page as active.
- Expands top-level pages by default.
- Sets `loading=false`, `loaded=true`.

#### `setLoading`, `setError`, `setActivePage`
- Small focused actions.
- `setActivePage` also updates `recent` and closes command palette.

#### `toggleExpandPage`, `setCommandPaletteOpen`, `setCommandPaletteQuery`, `setSelectedBlock`, `setShowDeleted`
- UI state toggles and setters.

### Page actions
#### `createPage({ title, parentId, templateId })`
Flow:
1. Find selected template if provided.
2. Create page object with timestamps and default metadata.
3. Create initial blocks from template payload or `DEFAULT_BLOCK`.
4. Append page and blocks to state.
5. Set new page active and recent.
6. Expand parent and new page in tree.

Why:
- New pages should be instantly editable and visible in nav.

#### `updatePage(pageId, patch)`
- Maps pages; merges patch on target; bumps `updatedAt`.

#### `movePage(pageId, nextParentId)`
- Guard 1: cannot parent page to itself.
- Guard 2: cannot create ancestry cycle (`isDescendant`).
- If valid, updates page parent.

#### `toggleFavorite(pageId)`
- Checks if favorite exists for current user.
- Removes it or inserts new favorite record.

#### `softDeletePage(pageId)`
- Marks `isDeleted=true` instead of removing.
- Switches active page if needed.
- Adds trash entry.

#### `restorePage(pageId)`
- Clears `isDeleted`, removes trash entry, sets page active.

### Block actions
#### `addBlock({ pageId, afterBlockId, type })`
- Finds insertion index.
- Builds new block.
- Inserts after target or at end.
- Sets selected block to new one.

#### `updateBlock({ pageId, blockId, patch })`
- Maps blocks and merges patch for target.
- `props` merge is nested-safe (`{ ...(block.props), ...patch.props }`).

#### `removeBlock({ pageId, blockId })`
- Filters block out by ID.

#### `reorderBlocks({ pageId, orderedIds })`
- Builds map from old blocks.
- Reconstructs block array in provided order.

#### `updateDatabaseInBlock({ pageId, blockId, updater })`
- Finds matching database block only.
- Passes old props to `updater` function.

Pattern taught:
- Higher-order update function (`updater`) for complex nested edits.

### Comment thread actions
#### `createThread({ pageId, blockId, content })`
- Creates thread + initial comment in one action.

#### `replyThread({ threadId, content })`
- Appends comment to existing thread.

#### `toggleThreadResolved(threadId)`
- Toggles resolution state.

### Collaboration actions
#### `setPresence({ clientId, pageId, userId, name, color, updatedAt })`
- Upserts presence by `clientId` key.

#### `prunePresence(maxAgeMs = 13000)`
- Removes stale entries by timestamp age.

#### `setTyping({ pageId, blockId, userName })`
- Nested map by `pageId` then `blockId`.

#### `pruneTyping(maxAgeMs = 3000)`
- Removes stale typing entries and empty page buckets.

### Remote sync and serialization
#### `applyRemoteState(state)`
- Compares remote vs local `meta.updatedAt`.
- Only applies remote when it is newer.
- Replaces core state slices with normalized arrays.

This is a simple last-write-wins conflict strategy.

#### `toSerializableState()`
- Uses `get()` to read current store.
- Returns subset shape for API persistence.

### Version and save indicators
#### `setVersionsForPage(pageId, versions)`
- Stores fetched versions under page key.

#### `incrementPendingSaves()` / `decrementPendingSaves()`
- Tracks in-flight saves and updates `lastSavedAt`.

## State management details
Why Zustand works well here:
- All state transitions are centralized and explicit.
- Each action documents one business operation.
- Complex nested updates are still readable with object/array spreads.

## Scope and closures
- Every action closes over `set/get` from `create(...)`.
- Helpers (`nowIso`, `safeArray`) are module-scoped and reused.
- This reduces repeated inline logic and keeps actions focused.

## Control flow and error handling
- Mostly optimistic local updates; validation guards are used where needed (`movePage`, `softDeletePage`, `applyRemoteState`).
- Failures from server sync are handled outside this file (in `WorkspaceApp` effects).

## Side effects
- This store is mostly pure state transitions.
- Time/ID generation is a controlled side effect (`Date`, `nanoid`).
- Network and storage side effects are intentionally outside the store.

## TypeScript notes
- No explicit types.
- Recommended next step: add TS interfaces for `Page`, `Block`, `Comment`, and action payloads.

## Concepts taught by this file
- Centralized state machine pattern
- Immutable nested updates
- Guarded tree mutations
- Optimistic UI foundation
- Last-write-wins merge strategy

## Common mistakes
- Mutating arrays directly instead of returning new arrays.
- Forgetting to update related state slices together (e.g., page + recent list).
- Not handling stale presence/typing entries.
- Writing actions that do too many unrelated things.

## Mini exercises
1. Add `duplicatePage(pageId)` action that clones page metadata and blocks.
2. Add `permanentlyDeletePage(pageId)` that removes page and its blocks entirely.
3. Add `renameTemplate(templateId, name)` action and wire it to UI later.

## Further reading
- `zustand patterns`
- `immutable data structures in React`
- `last write wins conflict resolution`
- `state normalization`
- `frontend state architecture`
