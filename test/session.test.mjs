import { test } from "node:test";
import assert from "node:assert/strict";
import { WorkspaceSession } from "../src/lib/workspaceSession.mjs";
import { state } from "./fixtures.mjs";
const snapshot = (value = state(), revision = "a") => ({
  state: structuredClone(value),
  revision: revision.repeat(64),
  instanceId: "c".repeat(24),
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
test("accepted saves return canonical state and clear dirty status only after success", async () => {
  let persisted = "pending";
  const session = new WorkspaceSession({
    load: async () => snapshot(),
    save: async ({ state }) => snapshot(state, "b"),
    persist: async (value) => {
      persisted = value;
    },
  });
  session.start(snapshot());
  const draft = state();
  draft.pages[0].title = "Edited";
  session.edit(draft);
  assert.equal(session.getSnapshot().dirty, true);
  assert.equal(await session.save(), true);
  assert.equal(session.getSnapshot().phase, "saved");
  assert.equal(session.getSnapshot().dirty, false);
  assert.equal(persisted, null);
});
test("typing while a save is in flight remains a newer unsaved draft", async () => {
  const pending = deferred();
  const session = new WorkspaceSession({
    load: async () => snapshot(),
    save: () => pending.promise,
  });
  session.start(snapshot());
  const first = state();
  first.pages[0].title = "First";
  session.edit(first);
  const saving = session.save();
  const second = structuredClone(first);
  second.pages[0].title = "Second";
  session.edit(second);
  pending.resolve(snapshot(first, "b"));
  assert.equal(await saving, true);
  assert.equal(session.draft.pages[0].title, "Second");
  assert.equal(session.getSnapshot().dirty, true);
  assert.equal(session.accepted.state.pages[0].title, "First");
});
test("a stale write retains its draft and cannot automatically retry before review", async () => {
  let calls = 0;
  const session = new WorkspaceSession({
    load: async () => snapshot(),
    save: async () => {
      calls++;
      throw Object.assign(new Error("Stale"), { status: 409 });
    },
  });
  session.start(snapshot());
  const draft = state();
  draft.pages[0].title = "Retained";
  session.edit(draft);
  assert.equal(await session.save(), false);
  assert.equal(session.getSnapshot().needsReview, true);
  assert.equal(await session.save(), false);
  assert.equal(calls, 1);
  assert.equal(session.draft.pages[0].title, "Retained");
});
test("a lost response can be reconciled as already accepted without repeating the write", async () => {
  let remote = snapshot(),
    calls = 0;
  const session = new WorkspaceSession({
    load: async () => remote,
    save: async ({ state }) => {
      calls++;
      remote = snapshot(state, "b");
      throw new Error("Connection lost");
    },
  });
  session.start(remote);
  const draft = state();
  draft.pages[0].title = "Accepted remotely";
  session.edit(draft);
  await session.save();
  await session.reviewLatest();
  assert.equal(session.acceptReview(), true);
  assert.equal(session.getSnapshot().dirty, false);
  await session.save();
  assert.equal(calls, 1);
});
test("independent remote and local edits are reviewed and combined before another save", async () => {
  const remote = state();
  remote.pages[0].icon = "R";
  const session = new WorkspaceSession({
    load: async () => snapshot(remote, "b"),
    save: async ({ state }) => snapshot(state, "d"),
  });
  session.start(snapshot());
  const draft = state();
  draft.pages[0].title = "Local";
  session.edit(draft);
  await session.reviewLatest();
  assert.equal(session.acceptReview(), true);
  assert.equal(session.draft.pages[0].title, "Local");
  assert.equal(session.draft.pages[0].icon, "R");
  assert.equal(session.getSnapshot().dirty, true);
});
test("conflicting text requires a choice and a structurally invalid result cannot be accepted", async () => {
  const remote = state();
  remote.pages[0].title = "Remote";
  const session = new WorkspaceSession({
    load: async () => snapshot(remote, "b"),
    save: async () => {
      throw new Error("Should not save");
    },
  });
  session.start(snapshot());
  const draft = state();
  draft.pages[0].title = "Local";
  session.edit(draft);
  await session.reviewLatest();
  assert.equal(session.acceptReview(), false);
  assert.equal(session.acceptReview({ "/pages/@root/title": "local" }), true);
  assert.equal(session.draft.pages[0].title, "Local");
});
test("incomplete text is retained locally without sending an invalid request", async () => {
  let calls = 0,
    retained;
  const session = new WorkspaceSession({
    load: async () => snapshot(),
    save: async () => {
      calls++;
    },
    persist: async (value) => {
      retained = value;
    },
  });
  session.start(snapshot());
  const draft = state();
  draft.pages[0].title = "";
  session.edit(draft);
  assert.equal(await session.save(), false);
  assert.equal(calls, 0);
  assert.equal(session.getSnapshot().phase, "invalid");
  assert.equal(retained.state.pages[0].title, "");
});
test("failed local persistence warns separately and does not turn an accepted server save into failure", async () => {
  const session = new WorkspaceSession({
    load: async () => snapshot(),
    save: async ({ state }) => snapshot(state, "b"),
    persist: async () => {
      throw new Error("Quota");
    },
  });
  session.start(snapshot());
  const draft = state();
  draft.pages[0].title = "Accepted";
  session.edit(draft);
  assert.equal(await session.save(), true);
  assert.equal(session.getSnapshot().phase, "saved");
  assert.match(session.getSnapshot().warning, /local draft/);
});
test("closing the session suppresses late responses and document replacement", async () => {
  const pending = deferred();
  let updates = 0;
  const session = new WorkspaceSession({
    load: async () => snapshot(),
    save: () => pending.promise,
    onDocument: () => updates++,
  });
  session.start(snapshot());
  const draft = state();
  draft.pages[0].title = "Late";
  session.edit(draft);
  const saving = session.save();
  session.close();
  pending.resolve(snapshot(draft, "b"));
  assert.equal(await saving, false);
  assert.equal(updates, 1);
  assert.equal(session.draft, null);
});
test("review refuses to merge drafts into a different server workspace instance", async () => {
  const other = snapshot();
  other.instanceId = "d".repeat(24);
  const session = new WorkspaceSession({
    load: async () => other,
    save: async () => snapshot(),
  });
  session.start(snapshot());
  const draft = state();
  draft.pages[0].title = "Keep";
  session.edit(draft);
  assert.equal(await session.reviewLatest(), false);
  assert.equal(session.getSnapshot().needsReview, true);
  assert.equal(session.draft.pages[0].title, "Keep");
});
test("saved offline drafts are offered for review rather than replayed", () => {
  let calls = 0;
  const session = new WorkspaceSession({
    load: async () => snapshot(),
    save: async () => {
      calls++;
    },
  });
  session.start(snapshot());
  const draft = state();
  draft.pages[0].title = "Offline";
  assert.equal(session.recover({ base: snapshot(), state: draft }), true);
  assert.equal(calls, 0);
  assert.equal(session.getSnapshot().needsReview, true);
  assert.equal(session.acceptReview(), true);
  assert.equal(session.getSnapshot().dirty, true);
});
test("server-side operations do not discard newer edits typed during their prerequisite save", async () => {
  const pending = deferred();
  let operations = 0;
  const session = new WorkspaceSession({
    load: async () => snapshot(),
    save: () => pending.promise,
  });
  session.start(snapshot());
  const draft = state();
  draft.pages[0].title = "First";
  session.edit(draft);
  const operation = session.operation(async () => {
    operations++;
    return {};
  });
  const newer = structuredClone(draft);
  newer.pages[0].title = "Newer";
  session.edit(newer);
  pending.resolve(snapshot(draft, "b"));
  assert.equal(await operation, null);
  assert.equal(operations, 0);
  assert.equal(session.draft.pages[0].title, "Newer");
});

test("typing during an already-running server operation is retained for reconciliation", async () => {
  const pending = deferred();
  const session = new WorkspaceSession({
    load: async () => snapshot(),
    save: async ({ state }) => snapshot(state, "b"),
  });
  session.start(snapshot());
  const operation = session.operation(() => pending.promise);
  const draft = state();
  draft.pages[0].title = "Typed during import";
  session.edit(draft);
  pending.resolve(snapshot(state(), "b"));
  assert.equal(await operation, null);
  assert.equal(session.draft.pages[0].title, "Typed during import");
  assert.equal(session.getSnapshot().needsReview, true);
});

test("reverting to accepted content clears the dirty display without sending another write", async () => {
  let calls = 0;
  const session = new WorkspaceSession({
    load: async () => snapshot(),
    save: async () => {
      calls++;
    },
  });
  session.start(snapshot());
  const draft = state();
  draft.pages[0].title = "Temporary";
  session.edit(draft);
  session.edit(state());
  assert.equal(session.dirty(), false);
  assert.equal(await session.save(), true);
  assert.equal(calls, 0);
  assert.equal(session.getSnapshot().phase, "saved");
});
test("malformed saved drafts cannot replace the rendered accepted document", () => {
  const session = new WorkspaceSession({
    load: async () => snapshot(),
    save: async () => snapshot(),
  });
  session.start(snapshot());
  assert.throws(() =>
    session.recover({ base: snapshot(), state: { pages: "broken" } }),
  );
  assert.deepEqual(session.draft, state());
});
