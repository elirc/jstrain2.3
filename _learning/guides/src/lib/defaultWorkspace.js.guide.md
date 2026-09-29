> Historical guide for the original implementation. Start with the [current CRUD learning course](../../../../astraupskill/README.md) for the delivered code, setup and verified behavior. The [unaltered original guide](../../../../docs/original/_learning/guides/src/lib/defaultWorkspace.js.guide.md.txt) is preserved for comparison. Claims below about autosave, sharing or collaboration describe the earlier design and should not be used as current guarantees.

﻿# Guide: src/lib/defaultWorkspace.js

## Purpose
`defaultWorkspace.js` creates the seeded starter dataset used when the app is first run. It defines users, pages, initial blocks, template data, and example database content so the UI is never empty.

## Line-by-line walkthrough
### Import
- `nanoid` creates stable unique IDs for seeded entities.

### `nowIso()`
- Returns current timestamp in ISO format.
- Used to keep date fields consistent (`createdAt`, `updatedAt`).

### `createStarterDatabaseBlock()`
- Builds a full `database` block object with:
  - title
  - property schema
  - starter row
  - multiple view definitions (`table`, `board`, `list`, `calendar`, `gallery`)
  - row templates
- Returns block with `children: []` for structural consistency.

Why this helper exists:
- Keeps large seed object out of main function and improves readability.

### `createDefaultWorkspace()`
1. Creates timestamps and IDs for initial pages/blocks.
2. Returns full workspace object:
   - `meta`: workspace identity and ownership
   - `users`: seeded members with color tags
   - `pages`: root + child pages
   - `blocksByPage`: per-page block arrays
   - comments/favorites/recent/templates/sharedLinks/versions/activities/trash arrays

Control flow:
- Mostly declarative object construction with dynamic keys (`[pageRoot]`, etc.).

State design decisions:
- Flat page list with `parentId` (easy persistence).
- Block arrays keyed by page ID (easy editor lookups).

Scope/closure:
- Generated IDs in local scope are reused in returned object to maintain relationships.

Side effects:
- None. Function is deterministic except time/id generation.

TypeScript notes:
- No TS interfaces, but this file strongly implies domain types (`Workspace`, `Page`, `Block`, etc.).

## Concepts taught by this file
- Domain model seeding
- ID relationship wiring
- Structured nested data creation
- Template-driven defaults

## Common mistakes
- Generating IDs in multiple places and breaking references.
- Forgetting `updatedAt` fields, causing sync logic issues.
- Inconsistent block shape across seed entries.

## Mini exercises
1. Add a new template for "Bug Triage" with default blocks.
2. Add a second starter database row and verify rendering.
3. Add a fourth seeded user and show them in presence list.

## Further reading
- `seed data patterns`
- `domain modeling in JSON`
- `ID generation strategies`
- `fixture data for development`
