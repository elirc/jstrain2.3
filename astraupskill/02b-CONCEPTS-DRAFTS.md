# Concepts, part two: drafts, revisions and conflict

[Course index](README.md) · [Part one](02-CONCEPTS.md)

## Transactions and optimistic concurrency

A transaction groups changes so that either all of them commit or none do. Here, the workspace JSON and its revision counter must move together. The repository's immediate transaction also performs the revision check inside the write boundary. Checking the revision before starting a transaction would leave a gap in which another connection could change the data.

Optimistic concurrency means a caller submits the version it last observed. Suppose tabs A and B both load revision R1. A saves and receives R2. B's attempt with R1 must be refused. Otherwise B could overwrite A's changes with a stale whole-document copy. The revision includes a counter and the stored JSON bytes, so an external content write cannot quietly keep the same accepted revision just because it missed the counter.

## Unknown outcomes are different from rejected writes

A 422 response says the candidate was rejected. A disconnected socket after submission does not tell you whether the database committed. Retrying blindly can repeat an import or a snapshot operation. The session therefore retains the draft and requires review after an uncertain write. This application does not implement durable operation receipts; learning to state that limitation is part of the exercise.

Three-way merge compares the common accepted base, the local draft and the latest server state. Independent edits can combine. Competing text, deletion or ordering needs an explicit choice. The merged candidate is validated again because individually sensible choices can still create an invalid relationship graph. “The merge algorithm produced JSON” does not imply “the document is safe to save.”

## Ownership and scope

The owner token authorizes this local workspace. It is not stored in browser persistent storage or exported with content. The public instance identifier only scopes local drafts; knowing it is not authorization. Page visibility labels remain descriptive metadata under the single-owner boundary. True shared workspaces would require server-enforced membership, resource-level authorization and tests proving that one user cannot access another user's records.

For each concept, write an invariant beginning with “After every accepted write…” Examples include “every comment references an existing thread” and “the revision matches the stored state.” Use these invariants to decide where a proposed feature belongs and which failure tests matter.

## Small examples to explain aloud

An HTTP save carries both the candidate and the revision used to construct it. This is the shape of the call in the real client; `candidate` must be a complete valid workspace, not just a title patch:

```js
const result = await api('/api/workspace', {
  method: 'PUT',
  body: { state: candidate },
  revision: accepted.revision,
});
// result.state is canonical accepted content; result.revision is its revision.
```

The client adds authorization and quotes the revision for `If-Match`. A component must not invent a revision after a failure. It can only obtain a new accepted revision through a successful server response or a later accepted-state read.

For numeric form conversion, compare these cases using the delivered helper:

```js
cellValue({ type: 'number' }, '12.5'); // 12.5, a number
cellValue({ type: 'number' }, '0');    // 0, still meaningful
cellValue({ type: 'number' }, '');     // '', explicitly blank
cellValue({ type: 'number' }, 'oops'); // throws; never stores NaN
```

For deletion, compare a record identity with its displayed name:

```js
const remaining = rows.filter(row => row.id !== deletedId);
// Do not use row.values.name: two records may share a display name.
```

That one-line filter is only the row-removal step. The UI still requests confirmation, the store still constructs a candidate, and the API still validates the complete state under a revision check. Keep the local data transformation and the accepted-write contract separate when explaining your implementation.
