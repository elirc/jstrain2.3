> Historical guide for the original implementation. Start with the [current CRUD learning course](../../../../../../astraupskill/README.md) for the delivered code, setup and verified behavior. The [unaltered original guide](../../../../../../docs/original/_learning/guides/src/app/api/search/route.js.guide.md.txt) is preserved for comparison. Claims below about autosave, sharing or collaboration describe the earlier design and should not be used as current guarantees.

﻿# Guide: src/app/api/search/route.js

## Purpose
This route performs fuzzy full-text search across page titles and block text using Fuse.js. It powers command-palette quick find.

## Line-by-line walkthrough
### Imports
- `Fuse` from `fuse.js`: fuzzy search engine.
- `getWorkspaceState`: loads current workspace data.

### `runtime = "nodejs"`
- Search runs server-side.

### `GET(request)`
1. Parse `q` and `workspaceId` from query params.
2. Trim query and return empty results if query is blank.
3. Load workspace state.
4. Build `pageIndex` entries from pages.
5. Build `blockIndex` entries by iterating `blocksByPage`.
6. Combine into `dataset`.
7. Configure Fuse:
   - `includeScore: true`
   - `threshold: 0.36`
   - search keys: `title`, `text`
8. Search, limit to 30, return raw item payloads.

Control flow detail:
- `flatMap` is used to flatten page-block arrays into one list.

State/scoping:
- `state` is route-local read snapshot; no writes occur.

Side effects:
- None besides CPU work and response output.

TypeScript notes:
- No typed search result object. Could define a union for page vs block results.

## Concepts taught by this file
- Fuzzy search indexing
- Query parameter parsing
- Data projection for search
- Result shaping

## Common mistakes
- Searching huge unbounded datasets without pagination/limits.
- Returning internal DB shape directly without adapter objects.
- Ignoring empty-query fast path.

## Mini exercises
1. Add filtering to ignore deleted pages/blocks.
2. Return Fuse score in API response for ranking debugging.
3. Add `kind` filter query parameter (`page|block`).

## Further reading
- `Fuse.js options`
- `information retrieval basics`
- `search indexing strategies`
