import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeWorkspace } from "../src/lib/mergeWorkspace.mjs";
import { state, block, TIME } from "./fixtures.mjs";

test("independent fields on the same page merge without dropping either edit", () => {
  const base = state(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.pages[0].title = "Local title";
  remote.pages[0].icon = "R";
  const result = mergeWorkspace(base, local, remote);
  assert.equal(result.ready, true);
  assert.equal(result.state.pages[0].title, "Local title");
  assert.equal(result.state.pages[0].icon, "R");
  assert.equal(base.pages[0].title, "Page root");
});
test("conflicting scalar edits require an explicit choice with both values retained", () => {
  const base = state(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.pages[0].title = "Local";
  remote.pages[0].title = "Remote";
  const pending = mergeWorkspace(base, local, remote);
  assert.equal(pending.ready, false);
  assert.equal(pending.conflicts.length, 1);
  assert.equal(pending.conflicts[0].path, "/pages/@root/title");
  assert.equal(pending.conflicts[0].local.value, "Local");
  assert.equal(pending.conflicts[0].remote.value, "Remote");
  const chosen = mergeWorkspace(base, local, remote, {
    "/pages/@root/title": "local",
  });
  assert.equal(chosen.ready, true);
  assert.equal(chosen.state.pages[0].title, "Local");
});
test("independent additions retain both records in deterministic block order", () => {
  const base = state(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.blocksByPage.root.push(block("local-block"));
  remote.blocksByPage.root.push(block("remote-block"));
  const result = mergeWorkspace(base, local, remote);
  assert.equal(result.ready, true);
  assert.deepEqual(
    result.state.blocksByPage.root.map((item) => item.id),
    ["block-root", "local-block", "remote-block"],
  );
});
test("a deletion conflicting with an edit is a visible whole-record choice", () => {
  const base = state(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.pages[1].isDeleted = true;
  local.trash.push({ id: "trash-child", pageId: "child", deletedAt: TIME });
  remote.pages[1].title = "Remote edit";
  const pending = mergeWorkspace(base, local, remote);
  assert.equal(pending.ready, false);
  assert.equal(pending.conflicts[0].path, "/pages/@child");
  const chosen = mergeWorkspace(base, local, remote, {
    "/pages/@child": "local",
  });
  assert.equal(chosen.ready, true);
  assert.equal(chosen.state.pages[1].isDeleted, true);
});
test("a removed block versus edited block never silently drops text", () => {
  const base = state(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.blocksByPage.root = [];
  remote.blocksByPage.root[0].text = "Remote answer";
  const result = mergeWorkspace(base, local, remote);
  assert.equal(result.ready, false);
  assert.equal(result.conflicts[0].local.present, false);
  assert.equal(result.conflicts[0].remote.value.text, "Remote answer");
});
test("competing block reorder operations require a separate order decision", () => {
  const base = state();
  base.blocksByPage.root = [block("a"), block("b"), block("c")];
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.blocksByPage.root = [
    base.blocksByPage.root[1],
    base.blocksByPage.root[0],
    base.blocksByPage.root[2],
  ];
  remote.blocksByPage.root = [
    base.blocksByPage.root[0],
    base.blocksByPage.root[2],
    base.blocksByPage.root[1],
  ];
  const result = mergeWorkspace(base, local, remote);
  assert.equal(result.ready, false);
  assert.equal(result.conflicts[0].path, "/blocksByPage/root/$order");
  const chosen = mergeWorkspace(base, local, remote, {
    "/blocksByPage/root/$order": "local",
  });
  assert.equal(chosen.ready, true);
  assert.deepEqual(
    chosen.state.blocksByPage.root.map((item) => item.id),
    ["b", "a", "c"],
  );
});
test("a structurally incompatible merge remains blocked even without scalar conflicts", () => {
  const base = state(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.blocksByPage.root = [];
  remote.commentThreads = [
    {
      id: "thread",
      pageId: "root",
      blockId: "block-root",
      resolved: false,
      createdAt: TIME,
    },
  ];
  const result = mergeWorkspace(base, local, remote);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.ready, false);
  assert.match(result.validationError, /unknown block/);
});
test("remote accepted history and identity win while navigation recents are combined", () => {
  const base = state(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.meta.ownerId = "forged";
  local.activities = [{ id: "forged" }];
  local.recent = ["child"];
  remote.recent = ["root"];
  remote.activities = [
    {
      id: "activity",
      pageId: null,
      actorId: "owner",
      action: "accepted",
      createdAt: TIME,
    },
  ];
  const result = mergeWorkspace(base, local, remote);
  assert.equal(result.ready, true);
  assert.equal(result.state.meta.ownerId, "owner");
  assert.deepEqual(result.state.activities, remote.activities);
  assert.deepEqual(result.state.recent, ["child", "root"]);
});
test("choosing the remote edit over a local deletion reconciles its derived trash entry", () => {
  const base = state(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.pages[1].isDeleted = true;
  local.trash = [{ id: "trash-child", pageId: "child", deletedAt: TIME }];
  remote.pages[1].title = "Keep this edit";
  const result = mergeWorkspace(base, local, remote, {
    "/pages/@child": "remote",
  });
  assert.equal(result.ready, true);
  assert.equal(result.state.pages[1].title, "Keep this edit");
  assert.deepEqual(result.state.trash, []);
});
