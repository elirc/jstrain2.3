import { test } from "node:test";
import assert from "node:assert/strict";
import { useWorkspaceStore } from "../src/lib/workspaceStore.js";
import { state } from "./fixtures.mjs";
test("presence and typing reject unknown/prototype payloads without changing document", () => {
  const store = useWorkspaceStore.getState();
  store.reset();
  store.hydrateWorkspace("workspace-default", state());
  const before = store.toSerializableState();
  for (const pageId of ["__proto__", "constructor", "prototype", "missing"])
    assert.doesNotThrow(() =>
      store.setTyping({ pageId, blockId: "anything", userName: "Unknown" }),
    );
  store.setPresence({
    clientId: "__proto__",
    pageId: "root",
    userId: "owner",
    name: "Unknown",
    color: "#ffffff",
  });
  assert.deepEqual(store.toSerializableState(), before);
  assert.deepEqual(useWorkspaceStore.getState().typing, {});
});
test("failed page movement surfaces an error and keeps the original hierarchy", () => {
  const store = useWorkspaceStore.getState();
  store.reset();
  store.hydrateWorkspace("workspace-default", state());
  const before = store.toSerializableState();
  store.movePage("root", "root");
  assert.match(useWorkspaceStore.getState().error, /own subtree/i);
  assert.deepEqual(store.toSerializableState(), before);
});
