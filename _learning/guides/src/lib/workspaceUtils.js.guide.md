> Historical guide for the original implementation. Start with the [current CRUD learning course](../../../../astraupskill/README.md) for the delivered code, setup and verified behavior. The [unaltered original guide](../../../../docs/original/_learning/guides/src/lib/workspaceUtils.js.guide.md.txt) is preserved for comparison. Claims below about autosave, sharing or collaboration describe the earlier design and should not be used as current guarantees.

﻿# Guide: src/lib/workspaceUtils.js

## Purpose
`workspaceUtils.js` contains pure helper functions for page trees, breadcrumbs, block labels, flattening nested structures, and lightweight diff text. These functions keep reusable logic out of components and stores.

## Line-by-line walkthrough
### `buildPageTree(pages, parentId = null)`
- Filters pages by `parentId` and ignores deleted pages.
- Sorts siblings alphabetically by title.
- Recursively maps each page to include `children`.

Why this shape:
- UI page tree needs nested children arrays, while storage uses flat `parentId` links.

Control flow:
- Filter -> sort -> map -> recursive call.

### `getBreadcrumbs(pages, pageId)`
- Builds `byId` map for O(1) lookup.
- Starts from current page and walks upward via `parentId`.
- Uses `unshift` to build root-to-leaf order.

Why:
- Breadcrumbs need ancestor chain in display order.

### `isDescendant(pages, candidateParentId, pageId)`
- Early return when no candidate parent.
- Walks up ancestry from candidate parent.
- Returns `true` if it reaches target page (cycle risk detected).

Why:
- Prevents moving a page under itself or its descendants.

### `mapBlockTypeLabel(type)`
- Switch maps block type to short visual label.
- Default label is `P`.

Why:
- Compact editor chips are easier to scan than full words.

### `flattenPageTree(nodes)`
- Creates result array `list`.
- Defines inner recursive function `walk` (closure over `list`).
- Pushes each node and recursively traverses children.

Scope/closure note:
- `walk` captures `list` from outer function scope.

### `createDiffText(previousBlocks, nextBlocks)`
- Joins text from blocks to compare snapshots.
- If identical text, returns "No text changes.".
- Otherwise computes word counts and delta.

Why:
- Quick and cheap diff summary for version history panel.

Side effects:
- None; all functions are pure.

TypeScript notes:
- No explicit types. If typed, inputs would be arrays of `Page`/`Block` objects.

## Concepts taught by this file
- Pure functions
- Recursion and tree traversal
- Guard clauses
- Derived summaries
- Closure usage

## Common mistakes
- Forgetting to exclude deleted pages in tree build.
- Creating infinite loops by not validating parent chains.
- Mutating original arrays before sort/map.

## Mini exercises
1. Extend `buildPageTree` to optionally include deleted pages.
2. Enhance `createDiffText` to include line count change, not just words.
3. Add a utility that returns all descendant page IDs for a given page.

## Further reading
- `tree traversal algorithms`
- `pure functions in JavaScript`
- `defensive programming guard clauses`
- `time complexity of map/filter/sort`
