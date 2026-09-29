# Read the code by following a request

Begin with [WorkspaceApp.js](../src/components/WorkspaceApp.js). Its outer component owns sign-in. Successful authentication produces a connection containing an API function and an accepted workspace snapshot. The connected editor renders the page tree, blocks, comments, imports and history. [DatabaseBlock.js](../src/components/DatabaseBlock.js) handles structured records separately so that the main editor does not also contain every table, board and field-control decision.

Do not start by memorizing the folder tree. Start with a concrete question: “If I rename a page, how does that text reach the database, and how does the UI know it was accepted?” Follow the steps below with the files open side by side.

## The local edit

The page-title input calls the store's `updatePage`. [workspaceStore.js](../src/lib/workspaceStore.js) adapts UI actions to [workspaceMutations.mjs](../src/lib/workspaceMutations.mjs). The mutation function receives a document, action and input, creates a detached copy, applies the requested change, and returns that candidate. It does not open SQLite or make an HTTP request. This separation makes it possible to test tree movement and comment cleanup without mounting React.

The store also contains transient UI state: the active page, expanded tree nodes, command palette, presence and selected history. `toSerializableState()` extracts document fields. A typing indicator should not create a new database write. Read the extraction function and identify exactly which fields belong to durable state and which belong only to the current tab.

## The save controller

[useWorkspaceConnection.js](../src/components/useWorkspaceConnection.js) subscribes to document changes and forwards edits to [workspaceSession.mjs](../src/lib/workspaceSession.mjs). The session keeps two different values: the last accepted server snapshot and the current local draft. It also tracks whether a request is running, whether a review is required, and which edit generation was sent.

This is a key architectural boundary. React renders status, but the session decides when an edit is saved. If another character is typed while a request is in flight, the response can accept the earlier text without replacing the newer draft. Find the `generation` comparison in `save()` and draw the two possible branches. In one branch, the response can replace the whole draft. In the other, newer local content stays intact while server-owned metadata is incorporated.

## The HTTP boundary

[workspaceClient.mjs](../src/lib/workspaceClient.mjs) sends a bearer token and a quoted `If-Match` revision. It preserves HTTP error status and distinguishes a failed write with an unknown outcome from an ordinary rejected request. The Next route files under `src/app/api` delegate to [httpRoute.js](../src/lib/httpRoute.js), which uses [workspaceApi.mjs](../src/lib/workspaceApi.mjs).

The API checks request host/origin, supported method, body size, JSON shape, authorization and revision. A successful whole-state save returns the accepted state and new revision. A stale revision returns a conflict. Do not treat `fetch()` resolving as proof of success: it also resolves for HTTP 401, 409 and 500. Find the explicit `response.ok` check in the client.

## The persistence boundary

[sqlite.js](../src/lib/sqlite.js) locates the configured database and lazily creates a repository. [workspaceRepository.mjs](../src/lib/workspaceRepository.mjs) contains SQL and transaction policy. Reads do not silently create a new workspace. [setup.mjs](../scripts/setup.mjs) is the explicit initialization/adoption path.

The repository starts an immediate transaction, checks the current revision, applies the candidate, validates it and writes the new state and revision counter atomically. [workspaceSchema.mjs](../src/lib/workspaceSchema.mjs) validates the full document, including page ancestry, globally unique block IDs, comment references and typed database values. The repository, not the caller, owns activity metadata and protected identity fields.

## Read paths that differ from saving

Search reads accepted state and excludes deleted pages. Markdown and HTML export read a specific accepted page; JSON export includes accepted workspace content without the authentication table. Snapshot capture stores page content and comments separately from the mutable workspace. Restore validates a candidate while preserving the current hierarchy and visibility labels. These operations share authorization but do not all mean “replace the workspace.”

Local drafts live in [offlineStore.js](../src/lib/offlineStore.js), scoped by a public workspace instance identifier. The old unversioned offline queue is retained for explicit export. [mergeWorkspace.mjs](../src/lib/mergeWorkspace.mjs) constructs a three-way review candidate; it does not grant a revision or write anything by itself.

Finish this map by answering: where would you add a field limit, a new input control, a transaction rule and a conflict-resolution option? If your answer to all four is the React component, revisit the boundaries. Mid-level work becomes easier when each layer has a clear responsibility and a change can be reviewed at the layer where its correctness is enforced.
