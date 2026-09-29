import {
  BLOCK_TYPES,
  fields,
  id,
  text,
  fail,
  validateDatabase,
} from "./workspaceSchema.mjs";
const newId = () => globalThis.crypto.randomUUID();
const stamp = () => new Date().toISOString();
const ROOT_KEYS = [
  "meta",
  "users",
  "pages",
  "blocksByPage",
  "commentThreads",
  "comments",
  "templates",
  "favorites",
  "recent",
  "sharedLinks",
  "versions",
  "activities",
  "trash",
];
export function documentFrom(store) {
  return Object.fromEntries(ROOT_KEYS.map((key) => [key, store[key]]));
}
export function blankDatabase() {
  return {
    title: "New database",
    properties: [{ id: "name", name: "Name", type: "text" }],
    rows: [],
    views: [
      {
        id: "table",
        type: "table",
        name: "Table",
        filters: [],
        sorts: [],
        visibleProperties: ["name"],
      },
    ],
    activeViewId: "table",
    templates: [],
  };
}
function active(state, pageId) {
  id(pageId, "page ID");
  const page = state.pages.find((page) => page.id === pageId);
  if (!page || page.isDeleted) throw fail("Active page not found", 404);
  return page;
}
export function subtreeIds(pages, pageId) {
  const found = new Set([pageId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const page of pages)
      if (found.has(page.parentId) && !found.has(page.id)) {
        found.add(page.id);
        changed = true;
      }
  }
  return found;
}
function itemBlock(state, pageId, blockId) {
  active(state, pageId);
  const block = state.blocksByPage[pageId].find(
    (block) => block.id === blockId,
  );
  if (!block) throw fail("Block not found", 404);
  return block;
}
function content(value) {
  return text(value, "Comment", 6000, true, true).trim();
}

// Structural actions are atomic over a detached draft. Text edits may be
// temporarily incomplete; full acceptance validation runs before persistence.
export function applyMutation(
  document,
  action,
  input = {},
  actorId = document.meta.ownerId,
) {
  const state = structuredClone(document);
  let result = null;
  if (!state.users.some((user) => user.id === actorId))
    throw fail("Unknown document actor", 403);
  if (action === "createPage") {
    fields(input, ["title", "parentId", "templateId"], "Create page");
    const parentId = input.parentId ?? null;
    if (parentId) active(state, parentId);
    const template = input.templateId
      ? state.templates.find((item) => item.id === input.templateId)
      : null;
    if (input.templateId && !template) throw fail("Template not found", 404);
    const title = template?.payload.title ?? input.title ?? "Untitled";
    text(title, "Page title", 200, true);
    if (state.pages.length >= 500) throw fail("Page limit reached");
    const pageId = newId(),
      now = stamp();
    state.pages.push({
      id: pageId,
      title,
      parentId,
      icon: "📄",
      coverImage: "",
      isDeleted: false,
      isFavorite: false,
      shared: "private",
      roles: {},
      createdAt: now,
      updatedAt: now,
    });
    state.blocksByPage[pageId] = (
      template?.payload.blocks ?? [{ type: "paragraph", text: "", props: {} }]
    ).map((block) => ({
      ...structuredClone(block),
      id: newId(),
      children: [],
    }));
    state.recent = [pageId, ...state.recent].slice(0, 40);
    result = { pageId };
  } else if (action === "updatePage") {
    fields(input, ["pageId", "patch"], "Update page", ["pageId", "patch"]);
    fields(
      input.patch,
      ["title", "icon", "coverImage", "shared"],
      "Page patch",
    );
    const page = active(state, input.pageId);
    for (const [key, value] of Object.entries(input.patch)) {
      text(
        value,
        key,
        key === "title"
          ? 200
          : key === "icon"
            ? 16
            : key === "coverImage"
              ? 2048
              : 20,
      );
      if (
        key === "shared" &&
        !["private", "workspace", "public"].includes(value)
      )
        throw fail("Unknown visibility label");
      page[key] = value;
    }
    page.updatedAt = stamp();
  } else if (action === "movePage") {
    fields(input, ["pageId", "parentId"], "Move page", ["pageId", "parentId"]);
    const page = active(state, input.pageId);
    if (input.parentId !== null) {
      active(state, input.parentId);
      if (subtreeIds(state.pages, page.id).has(input.parentId))
        throw fail("A page cannot move into its own subtree");
    }
    page.parentId = input.parentId;
    page.updatedAt = stamp();
  } else if (action === "trashPage") {
    fields(input, ["pageId"], "Trash page", ["pageId"]);
    active(state, input.pageId);
    const targets = subtreeIds(state.pages, input.pageId),
      now = stamp();
    for (const page of state.pages)
      if (targets.has(page.id) && !page.isDeleted) {
        page.isDeleted = true;
        page.updatedAt = now;
        state.trash.push({ id: newId(), pageId: page.id, deletedAt: now });
      }
    state.recent = state.recent.filter((pageId) => !targets.has(pageId));
    result = { pageIds: [...targets] };
  } else if (action === "restorePage") {
    fields(input, ["pageId"], "Restore page", ["pageId"]);
    const page = state.pages.find((page) => page.id === input.pageId);
    if (!page) throw fail("Page not found", 404);
    const targets = subtreeIds(state.pages, page.id),
      byId = new Map(state.pages.map((item) => [item.id, item]));
    let parent = page.parentId;
    const seen = new Set();
    while (parent !== null) {
      if (seen.has(parent)) throw fail("Page hierarchy contains a cycle");
      seen.add(parent);
      const ancestor = byId.get(parent);
      if (!ancestor) throw fail("Missing ancestor");
      targets.add(parent);
      parent = ancestor.parentId;
    }
    for (const item of state.pages)
      if (targets.has(item.id)) {
        item.isDeleted = false;
        item.updatedAt = stamp();
      }
    state.trash = state.trash.filter((item) => !targets.has(item.pageId));
    result = { pageId: page.id };
  } else if (action === "toggleFavorite") {
    fields(input, ["pageId"], "Favorite", ["pageId"]);
    active(state, input.pageId);
    const index = state.favorites.findIndex(
      (item) => item.pageId === input.pageId && item.userId === actorId,
    );
    if (index >= 0) state.favorites.splice(index, 1);
    else
      state.favorites.push({
        id: newId(),
        pageId: input.pageId,
        userId: actorId,
      });
  } else if (action === "addBlock") {
    fields(input, ["pageId", "afterBlockId", "type"], "Add block", ["pageId"]);
    active(state, input.pageId);
    const list = state.blocksByPage[input.pageId];
    if (list.length >= 1000) throw fail("Page block limit reached");
    const type = input.type ?? "paragraph";
    if (!BLOCK_TYPES.includes(type)) throw fail("Invalid block type");
    const index = input.afterBlockId
      ? list.findIndex((item) => item.id === input.afterBlockId)
      : list.length - 1;
    if (input.afterBlockId && index < 0)
      throw fail("Insertion anchor not found", 404);
    const block = {
      id: newId(),
      type,
      text: "",
      props: type === "database" ? blankDatabase() : {},
      children: [],
    };
    list.splice(index + 1, 0, block);
    result = { blockId: block.id };
  } else if (action === "updateBlock") {
    fields(input, ["pageId", "blockId", "patch"], "Update block", [
      "pageId",
      "blockId",
      "patch",
    ]);
    fields(input.patch, ["type", "text", "props"], "Block patch");
    const block = itemBlock(state, input.pageId, input.blockId);
    if (input.patch.type !== undefined) {
      if (!BLOCK_TYPES.includes(input.patch.type))
        throw fail("Invalid block type");
      if (input.patch.type !== block.type) {
        block.type = input.patch.type;
        block.props = block.type === "database" ? blankDatabase() : {};
      }
    }
    if (input.patch.text !== undefined)
      block.text = text(input.patch.text, "Block text", 50000, false, true);
    if (input.patch.props !== undefined) {
      if (block.type === "database") validateDatabase(input.patch.props);
      else
        fields(
          input.patch.props,
          block.type === "callout" ? ["tone"] : [],
          "Block props",
        );
      block.props = structuredClone(input.patch.props);
    }
  } else if (action === "removeBlock") {
    fields(input, ["pageId", "blockId"], "Remove block", ["pageId", "blockId"]);
    itemBlock(state, input.pageId, input.blockId);
    const threads = new Set(
      state.commentThreads
        .filter(
          (item) =>
            item.pageId === input.pageId && item.blockId === input.blockId,
        )
        .map((item) => item.id),
    );
    state.blocksByPage[input.pageId] = state.blocksByPage[input.pageId].filter(
      (item) => item.id !== input.blockId,
    );
    state.commentThreads = state.commentThreads.filter(
      (item) => !threads.has(item.id),
    );
    state.comments = state.comments.filter(
      (item) => !threads.has(item.threadId),
    );
  } else if (action === "reorderBlocks") {
    fields(input, ["pageId", "orderedIds"], "Reorder blocks", [
      "pageId",
      "orderedIds",
    ]);
    active(state, input.pageId);
    const blocks = state.blocksByPage[input.pageId];
    if (
      !Array.isArray(input.orderedIds) ||
      input.orderedIds.length !== blocks.length ||
      new Set(input.orderedIds).size !== blocks.length ||
      input.orderedIds.some((key) => !blocks.some((item) => item.id === key))
    )
      throw fail("Reordering requires every block ID exactly once");
    const map = new Map(blocks.map((block) => [block.id, block]));
    state.blocksByPage[input.pageId] = input.orderedIds.map((key) =>
      map.get(key),
    );
  } else if (action === "createThread") {
    fields(input, ["pageId", "blockId", "content"], "Create thread", [
      "pageId",
      "blockId",
      "content",
    ]);
    itemBlock(state, input.pageId, input.blockId);
    const threadId = newId(),
      now = stamp();
    state.commentThreads.push({
      id: threadId,
      pageId: input.pageId,
      blockId: input.blockId,
      resolved: false,
      createdAt: now,
    });
    state.comments.push({
      id: newId(),
      threadId,
      authorId: actorId,
      content: content(input.content),
      createdAt: now,
    });
    result = { threadId };
  } else if (
    ["replyThread", "toggleThreadResolved", "removeThread"].includes(action)
  ) {
    fields(
      input,
      action === "replyThread" ? ["threadId", "content"] : ["threadId"],
      "Thread action",
      ["threadId"],
    );
    const thread = state.commentThreads.find(
      (item) => item.id === input.threadId,
    );
    if (!thread) throw fail("Thread not found", 404);
    active(state, thread.pageId);
    if (action === "replyThread")
      state.comments.push({
        id: newId(),
        threadId: thread.id,
        authorId: actorId,
        content: content(input.content),
        createdAt: stamp(),
      });
    if (action === "toggleThreadResolved") thread.resolved = !thread.resolved;
    if (action === "removeThread") {
      state.commentThreads = state.commentThreads.filter(
        (item) => item.id !== thread.id,
      );
      state.comments = state.comments.filter(
        (item) => item.threadId !== thread.id,
      );
    }
  } else if (["editComment", "removeComment"].includes(action)) {
    fields(
      input,
      action === "editComment" ? ["commentId", "content"] : ["commentId"],
      "Comment action",
      ["commentId"],
    );
    const comment = state.comments.find((item) => item.id === input.commentId);
    if (!comment) throw fail("Comment not found", 404);
    const thread = state.commentThreads.find(
      (item) => item.id === comment.threadId,
    );
    if (!thread) throw fail("Thread not found", 404);
    active(state, thread.pageId);
    if (action === "editComment") comment.content = content(input.content);
    else
      state.comments = state.comments.filter((item) => item.id !== comment.id);
  } else throw fail("Unknown document action");
  return { state, result };
}
