> Historical guide for the original implementation. Start with the [current CRUD learning course](../../../../../../astraupskill/README.md) for the delivered code, setup and verified behavior. The [unaltered original guide](../../../../../../docs/original/_learning/guides/src/app/api/workspace/route.js.guide.md.txt) is preserved for comparison. Claims below about autosave, sharing or collaboration describe the earlier design and should not be used as current guarantees.

﻿# Guide: src/app/api/workspace/route.js

## Purpose
This is the main workspace API endpoint. It loads workspace state (`GET`), saves workspace state (`PUT`), and creates page version snapshots (`POST`).

## Line-by-line walkthrough
### Imports
- `nanoid`: creates activity IDs.
- `getWorkspaceState`, `upsertWorkspaceState`, `savePageVersion`, `listPageVersions`: persistence helpers.

### `runtime = "nodejs"`
- Ensures this route executes in Node runtime (required for SQLite module).

### `json(data, init)` helper
- Small wrapper around `Response.json` to reduce repetition.

### `GET(request)`
1. Parse query params from request URL.
2. Read `workspaceId` or default to `workspace-default`.
3. Load state from DB.
4. Return `{ workspaceId, state }`.

Why:
- Used by app bootstrap and reload flows.

### `PUT(request)`
1. Parse incoming JSON payload.
2. Pull `workspaceId`, `state`, `actorId`, `action` with defaults.
3. Validate minimum shape (`pages` array and `blocksByPage` object).
4. Build `nextState`:
   - updates `meta.workspaceId` and `meta.updatedAt`
   - appends activity record and keeps last 200 entries
5. Persist via `upsertWorkspaceState`.
6. Return success timestamp.
7. On error, return 500.

Control flow:
- Guard-based validation before save.

### `POST(request)`
1. Parse JSON payload.
2. Require `pageId` (400 if missing).
3. Call `savePageVersion(...)`.
4. If page missing, return 404.
5. Fetch latest versions list and return it.

Why:
- Snapshot creation is attached to workspace endpoint for convenience.

## State management relevance
- Route updates server source-of-truth state and activity feed metadata.

## Scope and closures
- `json` helper is module-scoped and reused by all methods.

## Side effects
- DB reads/writes through sqlite helpers.

## TypeScript notes
- No runtime schema types yet. Adding Zod would improve payload safety.

## Concepts taught by this file
- REST-ish multi-method route
- Input validation guards
- Server-side metadata stamping
- Error response strategy

## Common mistakes
- Accepting invalid payload shape and corrupting stored state.
- Forgetting to update `meta.updatedAt` on save.
- Returning 200 for missing resources.

## Mini exercises
1. Add a `DELETE` method to hard-delete workspace (for dev only).
2. Add stricter validation that `state.pages` items include `id` and `title`.
3. Track requester IP/user-agent in activity payload.

## Further reading
- `HTTP status code best practices`
- `Next.js route handlers`
- `input validation with zod`
