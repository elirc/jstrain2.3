# Trace lab: observe the system you are changing

Use a disposable workspace for this lab. Keep the owner token private and do not record it in screenshots. Open the application, your editor and browser DevTools. Your goal is to connect visible behavior with request data, control flow and stored state. Read [the codebase map](01-CODEBASE-MAP.md) first if any boundary is unfamiliar.

## The guard your `If-Match` header meets

In Lab A and Lab B the quoted revision you read in DevTools is checked before any transaction starts. This is the whole check, from `src/lib/workspaceApi.mjs:70-75`; note that a missing or unquoted header is a 428, not a 409 conflict.

```js
function revision(request) {
  const raw = request.headers.get("if-match");
  if (!raw || !/^"[a-f0-9]{64}"$/.test(raw))
    throw fail("A quoted accepted revision is required in If-Match", 428);
  return raw.slice(1, -1);
}
```

## Lab A: one accepted rename

Set breakpoints in `updatePage` within [workspaceMutations.mjs](../src/lib/workspaceMutations.mjs), in `save()` within [workspaceSession.mjs](../src/lib/workspaceSession.mjs), and in the PUT branch of [workspaceApi.mjs](../src/lib/workspaceApi.mjs) if your server debugger is attached. Rename a page from `Notes` to `Design notes`.

At the local mutation, inspect the copied document and confirm the page ID stays unchanged. At save start, record the revision and generation, but not the token. In Network, inspect the quoted `If-Match` header and the state body. After the response, compare the returned revision with the previous one. Reload and sign in again. Explain why the visible title after reload is stronger persistence evidence than the title immediately after typing.

Write a trace in this form: input event → local mutation → draft retained → request sent → revision checked → transaction committed → accepted snapshot returned → dirty state cleared. Add the real filename beside each step. If the UI reports an error, stop and identify the last step that definitely succeeded instead of assuming the entire sequence failed.

## Lab B: two tabs and a stale revision

Open two signed-in tabs before making changes. Both initially know the same revision. In tab A, change the title and wait for acceptance. In tab B, make a competing title change. The second write should not silently overwrite A's accepted content. B retains its draft and offers review.

Choose Review latest in B. Read the common starting value, your draft and the accepted server value. Choose deliberately, accept the reviewed draft and then Save. Notice the distinction between accepting a local review candidate and submitting it to the server. These are separate actions because a valid candidate still needs a current revision and a successful transaction.

Repeat with independent edits: change the title in A and the icon in B. Predict whether a conflict choice is necessary. The merge can combine independent fields, but the whole candidate is still validated. Explain what should happen if one tab deletes a block while the other adds a comment to it. That example shows why merge logic and relational validation must work together.

## Lab C: uncertain save and retained draft

Use DevTools to take the browser offline after the initial page loads, then edit a paragraph. Wait for the request failure and inspect the status. The UI should not claim that the server accepted the draft. Inspect the new IndexedDB draft store and identify the accepted base plus local state. Restore connectivity, use Review latest and reconcile before saving again.

Offline simulation is evidence for a controlled failure case, not a proof of every real network behavior. A server can commit before the response disappears. Explain why a later read is needed to distinguish “not accepted” from “accepted but response lost.” Do not manually replay an old queue entry simply because it contains plausible JSON.

## Lab D: related-data deletion

Create a comment on a block, add a reply, then delete the block. Inspect the confirmation and save the change. Find the block, thread and comments in a JSON export before and after deletion. The related thread and comments should disappear with the block. Restore from a previously captured page snapshot and inspect the restored relationships.

Repeat the same reasoning for a database property used by a filter, sort and row template. The exact UI differs, but the invariant is similar: deleting a definition must account for its dependents. Describe which references are removed and which resources stay intact.

## Lab E: restart, exports and limitations

Capture a snapshot, modify the page, restart the local server and inspect history. Export accepted Markdown, HTML and JSON. Compare what each format retains. Markdown represents content and tables but is not a complete typed workspace backup or a lossless re-import format. JSON contains fuller content, but there is no general JSON restore UI in this version. A private SQLite backup is a separate operational artifact.

Finish with a short demonstration: one successful edit, one rejected stale edit, one retained draft and one related-data cleanup. Narrate the cause and evidence in plain language. A mid-level engineer should be able to explain both the normal path and the reason the application refuses an unsafe next step.
