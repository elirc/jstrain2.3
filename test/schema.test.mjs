import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateWorkspace,
  validateDatabase,
  validateWorkspaceIdentity,
  validateJson,
} from "../src/lib/workspaceSchema.mjs";
import { state, database, TIME } from "./fixtures.mjs";

test("a complete workspace validates without normalizing or mutating supplied state", () => {
  const value = state(),
    before = structuredClone(value);
  assert.equal(validateWorkspace(value), value);
  assert.deepEqual(value, before);
});
test("unknown fields and missing required collections are explicit errors", () => {
  const extra = state();
  extra.pagez = [];
  assert.throws(() => validateWorkspace(extra), /unknown/);
  const missing = state();
  delete missing.comments;
  assert.throws(() => validateWorkspace(missing), /required/);
});
test("duplicate page and cross-page block IDs are rejected", () => {
  const pages = state();
  pages.pages[1].id = "root";
  assert.throws(() => validateWorkspace(pages), /Duplicate page/);
  const blocks = state();
  blocks.blocksByPage.child[0].id = "block-root";
  assert.throws(() => validateWorkspace(blocks), /Duplicate block/);
});
test("missing parents and ancestor cycles are rejected in bounded traversal", () => {
  const missing = state();
  missing.pages[1].parentId = "absent";
  assert.throws(() => validateWorkspace(missing), /parent/);
  const cycle = state();
  cycle.pages[0].parentId = "child";
  assert.throws(() => validateWorkspace(cycle), /cycle/);
});
test("blocks must have a real owning page and every page must have its block list", () => {
  const orphan = state();
  orphan.blocksByPage.absent = [];
  assert.throws(() => validateWorkspace(orphan), /unknown page/);
  const missing = state();
  delete missing.blocksByPage.child;
  assert.throws(() => validateWorkspace(missing), /missing its blocks/);
});
test("typed booleans and empty required names cannot be silently coerced", () => {
  for (const value of ["false", 0, null]) {
    const s = state();
    s.pages[0].isDeleted = value;
    assert.throws(() => validateWorkspace(s), /boolean/);
  }
  const blank = state();
  blank.pages[0].title = " ";
  assert.throws(() => validateWorkspace(blank), /nonempty/);
});
test("cover URLs reject script schemes credentials and malformed URLs", () => {
  for (const value of [
    "javascript:alert(1)",
    "https://user:pass@example.com/a",
    "http://example.com/a",
    "not a URL",
  ]) {
    const s = state();
    s.pages[0].coverImage = value;
    assert.throws(() => validateWorkspace(s), /cover|Cover/);
  }
  const s = state();
  s.pages[0].coverImage = "https://example.com/a.png";
  validateWorkspace(s);
});
test("thread block ownership and comment author/thread references are enforced", () => {
  const s = state();
  s.commentThreads = [
    {
      id: "thread",
      pageId: "root",
      blockId: "block-root",
      resolved: false,
      createdAt: TIME,
    },
  ];
  s.comments = [
    {
      id: "comment",
      threadId: "thread",
      authorId: "owner",
      content: "Explain the boundary",
      createdAt: TIME,
    },
  ];
  validateWorkspace(s);
  s.commentThreads[0].blockId = "block-child";
  assert.throws(() => validateWorkspace(s), /unknown block/);
  s.commentThreads[0].blockId = "block-root";
  s.comments[0].authorId = "outsider";
  assert.throws(() => validateWorkspace(s), /reference/);
});
test("favorite uniqueness and recent references are validated", () => {
  const s = state();
  s.favorites = [
    { id: "f1", pageId: "root", userId: "owner" },
    { id: "f2", pageId: "root", userId: "owner" },
  ];
  assert.throws(() => validateWorkspace(s), /Duplicate favorite/);
  s.favorites = [];
  s.recent = ["absent"];
  assert.throws(() => validateWorkspace(s), /recent/);
});
test("trash entries and deleted pages must agree", () => {
  const s = state();
  s.pages[0].isDeleted = true;
  assert.throws(() => validateWorkspace(s), /trash entry/);
  s.trash = [{ id: "trash1", pageId: "root", deletedAt: TIME }];
  validateWorkspace(s);
  s.pages[0].isDeleted = false;
  assert.throws(() => validateWorkspace(s), /trash reference/);
});
test("database rows preserve real zero and false and reject string coercion", () => {
  const d = database();
  validateDatabase(d);
  assert.equal(d.rows[0].values.score, 0);
  assert.equal(d.rows[0].values.done, false);
  d.rows[0].values.score = "0";
  assert.throws(() => validateDatabase(d), /finite/);
  d.rows[0].values.score = 0;
  d.rows[0].values.done = "false";
  assert.throws(() => validateDatabase(d), /boolean/);
});
test("database dates require real calendar dates and selects require configured options", () => {
  const d = database();
  d.rows[0].values.due = "2026-02-30";
  assert.throws(() => validateDatabase(d), /Date/);
  d.rows[0].values.due = "";
  d.rows[0].values.status = "Unknown";
  assert.throws(() => validateDatabase(d), /select/);
});
test("database columns rows views filters and sorts have stable validated references", () => {
  const d = database();
  d.rows[0].values.unknown = "x";
  assert.throws(() => validateDatabase(d), /unknown property/);
  delete d.rows[0].values.unknown;
  d.activeViewId = "absent";
  assert.throws(() => validateDatabase(d), /Active/);
  d.activeViewId = "table";
  d.views[0].sorts = [{ field: "absent", direction: "asc" }];
  assert.throws(() => validateDatabase(d), /sort field/);
  d.views[0].sorts = [];
  d.views[0].filters = [{ field: "name", operator: "contains" }];
  assert.throws(() => validateDatabase(d), /requires a value/);
});
test("templates receive the same block and database validation as actual documents", () => {
  const s = state();
  s.templates = [
    {
      id: "template",
      kind: "page",
      name: "Practice",
      payload: {
        title: "Practice",
        blocks: [{ type: "database", text: "", props: database() }],
      },
    },
  ];
  validateWorkspace(s);
  s.templates[0].payload.blocks[0].props.rows[0].values.score = Infinity;
  assert.throws(() => validateWorkspace(s), /finite/);
});
test("reserved keys invalid Unicode nonfinite values and deep JSON fail before persistence", () => {
  for (const value of [
    JSON.parse('{"__proto__":{}}'),
    { x: NaN },
    { x: "\ud800" },
    { x: undefined },
  ])
    assert.throws(() => validateJson(value));
  let nested = {};
  for (let i = 0; i < 22; i++) nested = { next: nested };
  assert.throws(() => validateJson(nested), /nesting/);
});
test("authority fields cannot be changed through a document save", () => {
  const a = state(),
    b = structuredClone(a);
  b.meta.ownerId = "outsider";
  assert.throws(
    () => validateWorkspaceIdentity(a, b),
    (error) => error.status === 403,
  );
  b.meta.ownerId = "owner";
  b.users[0].name = "Impersonation";
  assert.throws(() => validateWorkspaceIdentity(a, b), /identity/);
});
