# Worked changes: delete a property and accept a save

This guide follows two implemented changes rather than proposing an imaginary architecture. Read [databaseModel.mjs](../src/lib/databaseModel.mjs), [DatabaseBlock.js](../src/components/DatabaseBlock.js), [database.test.mjs](../test/database.test.mjs) and [workspaceSession.mjs](../src/lib/workspaceSession.mjs) alongside it. Reproduce the examples in a disposable workspace before modifying the implementation.

## Change one: removing a structured-record property

Imagine a Tasks database with Name, Quantity and Done. Quantity appears in three records, a row template, a visible-column list, a filter and a sort. Deleting only the property definition leaves five kinds of references behind. Some would become invisible data; others would make the workspace fail validation on its next save.

First define the invariant: after deletion, no row, template or view setting refers to that property, and at least one property remains. This statement determines the implementation. The UI asks for confirmation because values will be removed. It passes the document and property ID to `removeProperty`; the helper creates a copy, removes the definition, removes values from both records and templates, and cleans filters, sorts, visible columns, grouping and calendar settings. Finally, it validates the resulting database.

The important structure is:

```js
const next = structuredClone(database);
next.properties = next.properties.filter(prop => prop.id !== propertyId);
for (const row of [...next.rows, ...(next.templates ?? [])]) {
  delete row.values[propertyId];
}
```

Read the rest of the real helper before considering this snippet complete. The snippet alone omits view cleanup and the final validation. Short examples are useful for explanation, but they are not a substitute for understanding the whole contract.

Why clone? A rejected operation should leave the original object unchanged. Mutating nested records in place can leak half a deletion into the current UI even if a later check throws. The test saves a copy of the input, calls the helper and compares both the output and the original. It also verifies that deleting the only property throws. This is a meaningful test because it exercises failure atomicity and related-data cleanup rather than merely checking which array method was called.

Follow the returned candidate through `updateDb`, the store mutation and the session. Property deletion is still a draft until a revision-checked server write accepts it. If a second tab saved a conflicting change, the server may reject the whole candidate. Local correctness and concurrency correctness are separate responsibilities, and both matter.

## Change two: preserving newer typing during a save

The original editor sent whole-state autosaves and updated its pending counter in a `finally` block. A finished request is not necessarily a successful request. A rejected write or lost response could therefore look saved, and an older response could replace newer typing.

The current session captures three values before sending: the draft, the accepted revision and the edit generation. A generation is a local counter incremented when the document changes. Suppose generation 4 contains `First`, and its request starts. The user types `Second`, creating generation 5. The response accepts generation 4. Because the generation changed, the session preserves `Second` as dirty instead of replacing it with `First`.

In [session.test.mjs](../test/session.test.mjs), a deferred promise gives the test precise control over this timing. It starts the save, applies the second edit, then resolves the first response. The assertions check accepted content, draft content and dirty status separately. A test that merely waits for a fixed number of milliseconds would be less precise and more fragile.

Now change the scenario: the server accepts the write, but the response is lost. The session enters review-required state and does not automatically replay the write. Loading the latest state reveals that the content is already accepted. A three-way review can then reconcile it without issuing a duplicate mutation. Find the test that counts save calls and verify the count stays at one.

## Your review exercise

Compare the current files with [the original editor](../docs/original/src/components/WorkspaceApp.js.txt). Write a small review note with a concrete trigger, before/after behavior and validation. For example: “Typing while a save is pending previously risked replacing the newest draft; the generation check now keeps newer edits dirty. A deferred-response test proves accepted and local state diverge correctly until the next save.”

Then propose one additional failure case without coding it yet. Examples include a local-storage quota error after server acceptance, edits during a restore request, or a property removed while another tab changes its values. State which layer should detect it and what data must remain available. That reasoning is the bridge from implementing a requested feature to owning its behavior under realistic conditions.

## A compact timing example

This pattern comes from the session tests. The resolver lets a test decide exactly when a request finishes:

```js
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

const pending = deferred();
// In the session constructor, save: () => pending.promise.
const saving = session.save();
session.edit(newerDraft);
pending.resolve(acceptedEarlierDraft);
await saving;
```

The setup must provide a valid accepted snapshot with a revision and instance ID, as shown in the actual test file. The snippet deliberately focuses on ordering. After `await saving`, inspect three facts: `session.accepted.state` contains the earlier accepted content; `session.draft` contains the newer content; and `session.getSnapshot().dirty` is true. If you assert only that the promise resolved, you miss the data-loss defect.

Now reverse the example: change a view from Table to Board and back to the same accepted Table settings before a save. The draft can equal accepted content again. The Save action should clear a stale dirty display without issuing a redundant write. This case was discovered in the browser workflow and then added to the session regression suite. It illustrates why a state machine needs transitions for returning to a prior value, not only for moving forward to a new value.
