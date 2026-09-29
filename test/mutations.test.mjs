import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyMutation,
  blankDatabase,
} from "../src/lib/workspaceMutations.mjs";
import { validateWorkspace } from "../src/lib/workspaceSchema.mjs";
import { state, block } from "./fixtures.mjs";
test("template instances have detached nested database values and new block identities", () => {
  const original = state();
  original.templates = [
    {
      id: "t",
      kind: "page",
      name: "Tasks",
      payload: {
        title: "Tasks",
        blocks: [{ type: "database", text: "", props: blankDatabase() }],
      },
    },
  ];
  const one = applyMutation(original, "createPage", { templateId: "t" });
  const two = applyMutation(one.state, "createPage", { templateId: "t" });
  const a = two.state.blocksByPage[one.result.pageId][0],
    b = two.state.blocksByPage[two.result.pageId][0];
  assert.notEqual(a.id, b.id);
  a.props.title = "Changed";
  assert.equal(b.props.title, "New database");
  assert.equal(
    original.templates[0].payload.blocks[0].props.title,
    "New database",
  );
  validateWorkspace(two.state);
});
test("a page cannot move into its descendant or a missing parent", () => {
  const original = state();
  assert.throws(
    () =>
      applyMutation(original, "movePage", {
        pageId: "root",
        parentId: "child",
      }),
    /subtree/,
  );
  assert.throws(
    () =>
      applyMutation(original, "movePage", {
        pageId: "child",
        parentId: "missing",
      }),
    /not found/,
  );
  assert.equal(original.pages[0].parentId, null);
});
test("trashing a parent includes its subtree and restoring a child restores its ancestors", () => {
  let value = applyMutation(state(), "trashPage", { pageId: "root" }).state;
  assert.ok(value.pages.every((page) => page.isDeleted));
  assert.equal(value.trash.length, 2);
  validateWorkspace(value);
  value = applyMutation(value, "restorePage", { pageId: "child" }).state;
  assert.ok(value.pages.every((page) => !page.isDeleted));
  assert.deepEqual(value.trash, []);
  validateWorkspace(value);
});
test("removing a block removes its attached thread and replies as one local action", () => {
  let value = state();
  const first = applyMutation(value, "createThread", {
    pageId: "root",
    blockId: "block-root",
    content: "Question",
  });
  value = applyMutation(first.state, "replyThread", {
    threadId: first.result.threadId,
    content: "Answer",
  }).state;
  value = applyMutation(value, "removeBlock", {
    pageId: "root",
    blockId: "block-root",
  }).state;
  assert.equal(value.commentThreads.length, 0);
  assert.equal(value.comments.length, 0);
  assert.deepEqual(value.blocksByPage.root, []);
  validateWorkspace(value);
});
test("reordering rejects duplicate missing and unknown IDs without mutating the draft", () => {
  const original = state();
  original.blocksByPage.root.push(block("second"));
  for (const orderedIds of [
    ["block-root"],
    ["block-root", "block-root"],
    ["block-root", "missing"],
  ])
    assert.throws(
      () =>
        applyMutation(original, "reorderBlocks", {
          pageId: "root",
          orderedIds,
        }),
      /exactly once/,
    );
  const result = applyMutation(original, "reorderBlocks", {
    pageId: "root",
    orderedIds: ["second", "block-root"],
  });
  assert.deepEqual(
    result.state.blocksByPage.root.map((item) => item.id),
    ["second", "block-root"],
  );
  assert.equal(original.blocksByPage.root[0].id, "block-root");
});
test("switching database block type drops obsolete props instead of merging them into prose", () => {
  let value = state();
  value = applyMutation(value, "updateBlock", {
    pageId: "root",
    blockId: "block-root",
    patch: { type: "database" },
  }).state;
  validateWorkspace(value);
  value = applyMutation(value, "updateBlock", {
    pageId: "root",
    blockId: "block-root",
    patch: { type: "paragraph", props: {} },
  }).state;
  assert.deepEqual(value.blocksByPage.root[0].props, {});
  validateWorkspace(value);
});
test("favorite toggles are scoped to the current actor and reject missing pages", () => {
  let value = applyMutation(state(), "toggleFavorite", {
    pageId: "root",
  }).state;
  assert.equal(value.favorites.length, 1);
  value = applyMutation(value, "toggleFavorite", { pageId: "root" }).state;
  assert.equal(value.favorites.length, 0);
  assert.throws(
    () => applyMutation(value, "toggleFavorite", { pageId: "missing" }),
    /not found/,
  );
});
test("comments can be edited removed and resolved while enforcing live references", () => {
  let { state: value, result } = applyMutation(state(), "createThread", {
    pageId: "root",
    blockId: "block-root",
    content: "Initial",
  });
  const commentId = value.comments[0].id;
  value = applyMutation(value, "editComment", {
    commentId,
    content: "Improved",
  }).state;
  assert.equal(value.comments[0].content, "Improved");
  value = applyMutation(value, "toggleThreadResolved", {
    threadId: result.threadId,
  }).state;
  assert.equal(value.commentThreads[0].resolved, true);
  value = applyMutation(value, "removeComment", { commentId }).state;
  assert.equal(value.comments.length, 0);
  value = applyMutation(value, "removeThread", {
    threadId: result.threadId,
  }).state;
  assert.equal(value.commentThreads.length, 0);
  validateWorkspace(value);
});
test("text drafts can be incomplete but immutable page fields cannot be patched", () => {
  const value = applyMutation(state(), "updatePage", {
    pageId: "root",
    patch: { title: "" },
  }).state;
  assert.equal(value.pages[0].title, "");
  assert.throws(() => validateWorkspace(value), /nonempty/);
  assert.throws(
    () =>
      applyMutation(state(), "updatePage", {
        pageId: "root",
        patch: { id: "replacement" },
      }),
    /unknown/,
  );
});
test("block insertion refuses a missing anchor rather than inserting at an unrelated position", () => {
  assert.throws(
    () =>
      applyMutation(state(), "addBlock", {
        pageId: "root",
        afterBlockId: "absent",
      }),
    /anchor/,
  );
  const result = applyMutation(state(), "addBlock", {
    pageId: "root",
    afterBlockId: "block-root",
    type: "database",
  });
  assert.equal(result.state.blocksByPage.root[1].type, "database");
  validateWorkspace(result.state);
});
