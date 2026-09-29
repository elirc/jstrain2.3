// Shared, dependency-free contracts for accepted workspace snapshots.
export const BLOCK_TYPES = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "bullet",
  "number",
  "callout",
  "code",
  "divider",
  "database",
];
export const MAX_STATE_BYTES = 8 * 1024 * 1024;
export const fail = (message, status = 422) =>
  Object.assign(new Error(message), { status });
export function object(value, label) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw fail(`${label} must be a plain object`);
  return value;
}
export function fields(value, allowed, label, required = []) {
  object(value, label);
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw fail(`${label} has an unknown field`);
  if (required.some((key) => !Object.hasOwn(value, key)))
    throw fail(`${label} is missing a required field`);
}
export function text(
  value,
  label,
  max = 100,
  required = false,
  multiline = false,
) {
  if (
    typeof value !== "string" ||
    !value.isWellFormed() ||
    value.length > max ||
    (required && !value.trim()) ||
    (multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f]/ : /[\x00-\x1f]/).test(value)
  )
    throw fail(
      `${label} must be ${required ? "nonempty " : ""}text of at most ${max} characters`,
    );
  return value;
}
export function id(value, label = "ID") {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(value) ||
    ["__proto__", "prototype", "constructor"].includes(value)
  )
    throw fail(`Invalid ${label}`);
  return value;
}
function boolean(value, label) {
  if (typeof value !== "boolean") throw fail(`${label} must be boolean`);
}
function list(value, label, max = 5000) {
  if (!Array.isArray(value) || value.length > max)
    throw fail(`${label} must be an array of at most ${max} items`);
  return value;
}
function timestamp(value, label) {
  text(value, label, 40, true);
  if (!/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value)))
    throw fail(`Invalid ${label}`);
}
function unique(items, label) {
  const result = new Map();
  for (const item of items) {
    object(item, label);
    id(item.id, label);
    if (result.has(item.id)) throw fail(`Duplicate ${label} ID`);
    result.set(item.id, item);
  }
  return result;
}
function member(value, allowed, label) {
  if (!allowed.includes(value)) throw fail(`Invalid ${label}`);
}
function jsonValue(value, depth = 0) {
  if (depth > 20) throw fail("JSON nesting exceeds 20 levels");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value === "string") {
    if (!value.isWellFormed()) throw fail("Invalid Unicode");
    return;
  }
  if (!value || typeof value !== "object")
    throw fail("Only finite JSON values are allowed");
  if (!Array.isArray(value)) object(value, "JSON value");
  for (const key of Object.keys(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key))
      throw fail("Reserved JSON key");
    jsonValue(value[key], depth + 1);
  }
}
export function validateJson(value) {
  jsonValue(value);
  if (
    new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_STATE_BYTES
  )
    throw fail("Workspace exceeds 8 MiB", 413);
}
function date(value, label) {
  if (value === "") return;
  text(value, label, 10);
  if (!/^\d{4}-\d\d-\d\d$/.test(value)) throw fail(`Invalid ${label}`);
  const parsed = new Date(value + "T00:00:00Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw fail(`Invalid ${label}`);
}
export function validateDatabase(data) {
  fields(
    data,
    ["title", "properties", "rows", "views", "activeViewId", "templates"],
    "Database",
    ["title", "properties", "rows", "views", "activeViewId"],
  );
  text(data.title, "Database title", 150, true);
  const properties = unique(
    list(data.properties, "Properties", 30),
    "property",
  );
  if (!properties.size) throw fail("A database requires at least one property");
  for (const prop of properties.values()) {
    fields(prop, ["id", "name", "type", "options"], "Property", [
      "id",
      "name",
      "type",
    ]);
    text(prop.name, "Property name", 80, true);
    member(
      prop.type,
      ["text", "number", "checkbox", "date", "select", "person"],
      "property type",
    );
    if (prop.options !== undefined) {
      list(prop.options, "Select options", 50);
      for (const option of prop.options)
        text(option, "Select option", 100, true);
      if (new Set(prop.options).size !== prop.options.length)
        throw fail("Duplicate select option");
    }
    if (prop.type === "select" && !prop.options?.length)
      throw fail("Select properties require options");
  }
  function values(record) {
    object(record, "Row values");
    if (Object.keys(record).some((key) => !properties.has(key)))
      throw fail("Row contains an unknown property");
    for (const [key, value] of Object.entries(record)) {
      const prop = properties.get(key);
      if (prop.type === "checkbox") boolean(value, "Checkbox value");
      else if (prop.type === "number") {
        if (
          value !== "" &&
          (typeof value !== "number" || !Number.isFinite(value))
        )
          throw fail("Number value must be finite or blank");
      } else if (prop.type === "date") date(value, "Date value");
      else {
        text(value, "Cell value", 4000, false, true);
        if (
          prop.type === "select" &&
          value !== "" &&
          !prop.options.includes(value)
        )
          throw fail("Unknown select value");
      }
    }
  }
  const rows = unique(list(data.rows, "Rows", 1000), "row");
  for (const row of rows.values()) {
    fields(row, ["id", "pageId", "values"], "Row", ["id", "values"]);
    if (row.pageId !== undefined) id(row.pageId, "legacy row page ID");
    values(row.values);
  }
  const views = unique(list(data.views, "Views", 15), "view");
  if (!views.size) throw fail("A database requires a view");
  for (const view of views.values()) {
    fields(
      view,
      [
        "id",
        "name",
        "type",
        "filters",
        "sorts",
        "visibleProperties",
        "groupBy",
        "dateProperty",
      ],
      "View",
      ["id", "name", "type"],
    );
    text(view.name, "View name", 80, true);
    member(
      view.type,
      ["table", "board", "list", "calendar", "gallery"],
      "view type",
    );
    for (const key of ["groupBy", "dateProperty"])
      if (view[key] !== undefined && !properties.has(view[key]))
        throw fail(`Unknown view ${key}`);
    if (view.groupBy && properties.get(view.groupBy).type !== "select")
      throw fail("Board grouping requires a select property");
    if (view.dateProperty && properties.get(view.dateProperty).type !== "date")
      throw fail("Calendar requires a date property");
    if (view.visibleProperties !== undefined) {
      list(view.visibleProperties, "Visible properties", 30);
      if (
        new Set(view.visibleProperties).size !==
          view.visibleProperties.length ||
        view.visibleProperties.some((key) => !properties.has(key))
      )
        throw fail("Invalid visible properties");
    }
    for (const filter of list(view.filters ?? [], "Filters", 15)) {
      fields(filter, ["field", "operator", "value"], "Filter", [
        "field",
        "operator",
      ]);
      if (!properties.has(filter.field)) throw fail("Unknown filter field");
      member(
        filter.operator,
        ["eq", "ne", "contains", "gt", "lt", "empty"],
        "filter operator",
      );
      if (filter.operator !== "empty" && !Object.hasOwn(filter, "value"))
        throw fail("Filter requires a value");
      if (
        filter.value !== undefined &&
        !["string", "number", "boolean"].includes(typeof filter.value)
      )
        throw fail("Invalid filter value");
    }
    for (const sort of list(view.sorts ?? [], "Sorts", 15)) {
      fields(sort, ["field", "direction"], "Sort", ["field", "direction"]);
      if (!properties.has(sort.field)) throw fail("Unknown sort field");
      member(sort.direction, ["asc", "desc"], "sort direction");
    }
  }
  if (!views.has(data.activeViewId))
    throw fail("Active database view does not exist");
  const templates = unique(
    list(data.templates ?? [], "Row templates", 50),
    "row template",
  );
  for (const template of templates.values()) {
    fields(template, ["id", "name", "values"], "Row template", [
      "id",
      "name",
      "values",
    ]);
    text(template.name, "Template name", 100, true);
    values(template.values);
  }
}
export function validateBlocks(blocks, { template = false } = {}) {
  list(blocks, "Blocks", 1000);
  if (!template) unique(blocks, "block");
  for (const block of blocks) {
    fields(
      block,
      ["id", "type", "text", "props", "children"],
      "Block",
      template
        ? ["type", "text", "props"]
        : ["id", "type", "text", "props", "children"],
    );
    if (block.id !== undefined) id(block.id, "block ID");
    member(block.type, BLOCK_TYPES, "block type");
    text(block.text, "Block text", 50000, false, true);
    object(block.props, "Block props");
    if (
      block.children !== undefined &&
      list(block.children, "Block children", 0).length
    )
      throw fail("Nested block children are not implemented");
    if (block.type === "database") validateDatabase(block.props);
    else if (block.type === "callout") {
      fields(block.props, ["tone"], "Callout props");
      if (block.props.tone !== undefined)
        member(
          block.props.tone,
          ["info", "warning", "success", "danger"],
          "callout tone",
        );
    } else if (Object.keys(block.props).length)
      throw fail("This block type does not accept props");
  }
}
export function validateWorkspace(state) {
  validateJson(state);
  const root = [
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
  fields(state, root, "Workspace", root);
  fields(
    state.meta,
    ["workspaceId", "workspaceName", "ownerId", "updatedAt", "createdAt"],
    "Metadata",
    ["workspaceId", "workspaceName", "ownerId", "updatedAt", "createdAt"],
  );
  id(state.meta.workspaceId, "workspace ID");
  id(state.meta.ownerId, "owner ID");
  text(state.meta.workspaceName, "Workspace name", 150, true);
  timestamp(state.meta.createdAt, "creation timestamp");
  timestamp(state.meta.updatedAt, "update timestamp");
  const users = unique(list(state.users, "Users", 100), "user");
  for (const user of users.values()) {
    fields(user, ["id", "name", "color"], "User", ["id", "name", "color"]);
    text(user.name, "User name", 100, true);
    if (!/^#[a-fA-F0-9]{6}$/.test(user.color))
      throw fail("User color must be six-digit hex");
  }
  if (!users.has(state.meta.ownerId)) throw fail("Owner does not exist");
  const pages = unique(list(state.pages, "Pages", 500), "page");
  for (const page of pages.values()) {
    fields(
      page,
      [
        "id",
        "title",
        "parentId",
        "icon",
        "coverImage",
        "isDeleted",
        "isFavorite",
        "shared",
        "roles",
        "createdAt",
        "updatedAt",
      ],
      "Page",
      [
        "id",
        "title",
        "parentId",
        "icon",
        "coverImage",
        "isDeleted",
        "isFavorite",
        "shared",
        "roles",
        "createdAt",
        "updatedAt",
      ],
    );
    text(page.title, "Page title", 200, true);
    text(page.icon, "Page icon", 16);
    text(page.coverImage, "Cover URL", 2048);
    if (page.coverImage) {
      let url;
      try {
        url = new URL(page.coverImage);
      } catch {
        throw fail("Invalid cover URL");
      }
      if (url.protocol !== "https:" || url.username || url.password)
        throw fail("Cover URL must be HTTPS without credentials");
    }
    boolean(page.isDeleted, "Page deleted");
    boolean(page.isFavorite, "Page favorite");
    member(
      page.shared,
      ["private", "workspace", "public"],
      "page visibility label",
    );
    object(page.roles, "Page role labels");
    for (const [user, role] of Object.entries(page.roles)) {
      if (!users.has(user)) throw fail("Unknown role-label user");
      member(role, ["owner", "editor", "viewer"], "role label");
    }
    timestamp(page.createdAt, "page creation timestamp");
    timestamp(page.updatedAt, "page update timestamp");
    if (page.parentId !== null && !pages.has(page.parentId))
      throw fail("Page parent does not exist");
    const seen = new Set([page.id]);
    let parent = page.parentId;
    while (parent !== null) {
      if (seen.has(parent)) throw fail("Page hierarchy contains a cycle");
      if (seen.size >= 64) throw fail("Page hierarchy exceeds 64 levels");
      seen.add(parent);
      parent = pages.get(parent)?.parentId ?? null;
    }
  }
  object(state.blocksByPage, "Page blocks");
  if (Object.keys(state.blocksByPage).some((key) => !pages.has(key)))
    throw fail("Blocks reference an unknown page");
  const blockIds = new Set();
  let blockCount = 0;
  for (const page of pages.values()) {
    if (!Object.hasOwn(state.blocksByPage, page.id))
      throw fail("Page is missing its blocks");
    const blocks = state.blocksByPage[page.id];
    validateBlocks(blocks);
    blockCount += blocks.length;
    for (const block of blocks) {
      if (blockIds.has(block.id)) throw fail("Duplicate block ID across pages");
      blockIds.add(block.id);
    }
  }
  if (blockCount > 5000) throw fail("Workspace exceeds 5000 blocks");
  const threads = unique(
    list(state.commentThreads, "Comment threads", 2000),
    "thread",
  );
  for (const thread of threads.values()) {
    fields(
      thread,
      ["id", "pageId", "blockId", "resolved", "createdAt"],
      "Thread",
      ["id", "pageId", "blockId", "resolved", "createdAt"],
    );
    if (
      !pages.has(thread.pageId) ||
      !state.blocksByPage[thread.pageId].some(
        (block) => block.id === thread.blockId,
      )
    )
      throw fail("Thread references an unknown block");
    boolean(thread.resolved, "Thread resolved");
    timestamp(thread.createdAt, "thread timestamp");
  }
  const comments = unique(list(state.comments, "Comments", 5000), "comment");
  for (const comment of comments.values()) {
    fields(
      comment,
      ["id", "threadId", "authorId", "content", "createdAt"],
      "Comment",
      ["id", "threadId", "authorId", "content", "createdAt"],
    );
    if (!threads.has(comment.threadId) || !users.has(comment.authorId))
      throw fail("Comment reference does not exist");
    text(comment.content, "Comment", 6000, true, true);
    timestamp(comment.createdAt, "comment timestamp");
  }
  const templates = unique(
    list(state.templates, "Page templates", 50),
    "page template",
  );
  for (const template of templates.values()) {
    fields(template, ["id", "kind", "name", "payload"], "Page template", [
      "id",
      "kind",
      "name",
      "payload",
    ]);
    member(template.kind, ["page"], "template kind");
    text(template.name, "Template name", 100, true);
    fields(template.payload, ["title", "blocks"], "Template payload", [
      "title",
      "blocks",
    ]);
    text(template.payload.title, "Template title", 200, true);
    validateBlocks(template.payload.blocks, { template: true });
  }
  const favorites = unique(
    list(state.favorites, "Favorites", 5000),
    "favorite",
  );
  const pairs = new Set();
  for (const favorite of favorites.values()) {
    fields(favorite, ["id", "userId", "pageId"], "Favorite", [
      "id",
      "userId",
      "pageId",
    ]);
    if (!users.has(favorite.userId) || !pages.has(favorite.pageId))
      throw fail("Favorite reference does not exist");
    const pair = favorite.userId + ":" + favorite.pageId;
    if (pairs.has(pair)) throw fail("Duplicate favorite");
    pairs.add(pair);
  }
  list(state.recent, "Recent pages", 40);
  if (
    new Set(state.recent).size !== state.recent.length ||
    state.recent.some((page) => !pages.has(page))
  )
    throw fail("Invalid recent page reference");
  if (
    list(state.sharedLinks, "Shared links", 0).length ||
    list(state.versions, "Embedded versions", 0).length
  )
    throw fail("Embedded sharing links and versions are not supported");
  const activity = unique(list(state.activities, "Activity", 200), "activity");
  for (const item of activity.values()) {
    fields(
      item,
      ["id", "pageId", "actorId", "action", "createdAt"],
      "Activity",
      ["id", "pageId", "actorId", "action", "createdAt"],
    );
    if (item.pageId !== null) id(item.pageId, "activity page ID");
    id(item.actorId, "activity actor ID");
    text(item.action, "Activity action", 100, true);
    timestamp(item.createdAt, "activity timestamp");
  }
  const trash = unique(list(state.trash, "Trash", 500), "trash entry");
  const trashed = new Set();
  for (const item of trash.values()) {
    fields(item, ["id", "pageId", "deletedAt"], "Trash entry", [
      "id",
      "pageId",
      "deletedAt",
    ]);
    if (!pages.get(item.pageId)?.isDeleted || trashed.has(item.pageId))
      throw fail("Invalid trash reference");
    trashed.add(item.pageId);
    timestamp(item.deletedAt, "trash timestamp");
  }
  for (const page of pages.values())
    if (page.isDeleted && !trashed.has(page.id))
      throw fail("Deleted page is missing its trash entry");
  return state;
}

export function validateWorkspaceIdentity(previous, next) {
  if (
    previous.meta.workspaceId !== next.meta.workspaceId ||
    previous.meta.ownerId !== next.meta.ownerId ||
    previous.meta.createdAt !== next.meta.createdAt ||
    JSON.stringify(previous.users) !== JSON.stringify(next.users)
  )
    throw fail(
      "Workspace identity and user directory cannot be changed by a document save",
      403,
    );
}
