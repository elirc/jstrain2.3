import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import {
  createWorkspaceRepository,
  initializeWorkspace,
} from "../src/lib/workspaceRepository.mjs";
import { state, TIME } from "./fixtures.mjs";

function fixture(t, { initialize = true } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jstrain23-test-"));
  const file = path.join(directory, "workspace.sqlite"),
    token = randomBytes(32).toString("hex");
  const connections = [];
  t.after(() => {
    for (const connection of connections) connection.close();
    assert.equal(
      path.dirname(path.resolve(directory)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(path.basename(directory).startsWith("jstrain23-test-"));
    for (const name of fs.readdirSync(directory))
      fs.unlinkSync(path.join(directory, name));
    fs.rmdirSync(directory);
  });
  if (initialize) initializeWorkspace(file, { state: state(), token });
  const open = () => {
    const repository = createWorkspaceRepository(file);
    connections.push(repository);
    return repository;
  };
  const sql = () => {
    const db = new Database(file);
    connections.push(db);
    return db;
  };
  return { directory, file, token, open, sql };
}

test("opening missing state is read-only and explicit setup never overwrites an owner", (t) => {
  const f = fixture(t, { initialize: false });
  assert.throws(
    () => f.open(),
    (error) => error.status === 503,
  );
  assert.equal(fs.existsSync(f.file), false);
  initializeWorkspace(f.file, { state: state(), token: f.token });
  const before = fs.readFileSync(f.file);
  assert.throws(
    () => initializeWorkspace(f.file, { state: state(), token: f.token }),
    (error) => error.status === 409,
  );
  assert.deepEqual(fs.readFileSync(f.file), before);
  assert.throws(
    () => initializeWorkspace(f.file, { token: f.token, adopt: true }),
    /already configured/,
  );
});
test("owner authentication uses a stored hash and does not leak through read snapshots", (t) => {
  const f = fixture(t),
    r = f.open();
  assert.equal(r.authenticate(f.token), "owner");
  for (const token of ["", f.token.slice(1), "f".repeat(64)])
    assert.throws(
      () => r.authenticate(token),
      (error) => error.status === 401,
    );
  assert.ok(!JSON.stringify(r.read()).includes(f.token));
  assert.ok(!fs.readFileSync(f.file).includes(Buffer.from(f.token)));
});
test("accepted whole-document replacement advances revision and returns detached accepted state", (t) => {
  const f = fixture(t),
    r = f.open(),
    first = r.read();
  const draft = structuredClone(first.state);
  draft.pages[0].title = "Accepted edit";
  const saved = r.replace(first.revision, draft);
  assert.notEqual(saved.revision, first.revision);
  assert.equal(saved.version, 2);
  assert.equal(saved.state.pages[0].title, "Accepted edit");
  saved.state.pages[0].title = "Alias edit";
  draft.pages[0].title = "Retained draft";
  assert.equal(r.read().state.pages[0].title, "Accepted edit");
});
test("two repository connections cannot silently overwrite a stale accepted revision", (t) => {
  const f = fixture(t),
    a = f.open(),
    b = f.open(),
    old = a.read();
  const draft = b.read().state;
  draft.pages[0].title = "Other accepted writer";
  b.replace(old.revision, draft);
  old.state.pages[0].title = "Stale writer";
  assert.throws(
    () => a.replace(old.revision, old.state),
    (error) => error.status === 409,
  );
  assert.equal(a.read().state.pages[0].title, "Other accepted writer");
});
test("accepted byte changes are detected even when an external writer forgets the version counter", (t) => {
  const f = fixture(t),
    r = f.open(),
    old = r.read();
  const changed = structuredClone(old.state);
  changed.pages[0].title = "External accepted bytes";
  f.sql()
    .prepare("UPDATE workspace_state SET state_json=?")
    .run(JSON.stringify(changed));
  assert.throws(
    () => r.replace(old.revision, old.state),
    (error) => error.status === 409,
  );
  assert.equal(r.read().state.pages[0].title, "External accepted bytes");
});
test("invalid references and changed authority leave state revision and history untouched", (t) => {
  const f = fixture(t),
    r = f.open(),
    old = r.read();
  const invalid = structuredClone(old.state);
  invalid.pages[1].parentId = "absent";
  assert.throws(() => r.replace(old.revision, invalid));
  assert.deepEqual(r.read(), old);
  const authority = structuredClone(old.state);
  authority.users[0].name = "Changed authority";
  assert.throws(
    () => r.replace(old.revision, authority),
    (error) => error.status === 403,
  );
  assert.deepEqual(r.read(), old);
});
test("activity is written by the repository rather than accepted from caller-supplied history", (t) => {
  const f = fixture(t),
    r = f.open(),
    old = r.read();
  old.state.activities = [
    {
      id: "forged",
      pageId: null,
      actorId: "outsider",
      action: "forged",
      createdAt: TIME,
    },
  ];
  const saved = r.replace(old.revision, old.state);
  assert.equal(saved.state.activities.length, 1);
  assert.equal(saved.state.activities[0].actorId, "owner");
  assert.equal(saved.state.activities[0].action, "workspace_updated");
});
test("failure after updating workspace bytes rolls back state counter and activity together", (t) => {
  const f = fixture(t),
    r = f.open(),
    sql = f.sql(),
    old = r.read();
  sql.exec(
    "CREATE TRIGGER reject_version BEFORE UPDATE ON workspace_control BEGIN SELECT RAISE(ABORT,'synthetic counter failure'); END;",
  );
  const draft = structuredClone(old.state);
  draft.pages[0].title = "Rejected change";
  assert.throws(
    () => r.replace(old.revision, draft),
    /synthetic counter failure/,
  );
  assert.deepEqual(r.read(), old);
});
test("held SQLite write transaction reports contention without stealing or accepting another write", (t) => {
  const f = fixture(t),
    r = f.open(),
    sql = f.sql(),
    old = r.read();
  sql
    .transaction(() => {
      assert.throws(
        () => r.replace(old.revision, old.state),
        (error) => error.code === "SQLITE_BUSY",
      );
      assert.deepEqual(r.read(), old);
    })
    .immediate();
  assert.deepEqual(r.read(), old);
});
test("an asynchronous mutator is rejected and cannot mutate stored state later", async (t) => {
  const f = fixture(t),
    r = f.open(),
    old = r.read();
  assert.throws(
    () =>
      r.update(old.revision, async (draft) => {
        await Promise.resolve();
        draft.pages[0].title = "Late";
      }),
    /synchronous/,
  );
  await Promise.resolve();
  assert.deepEqual(r.read(), old);
});
test("corrupt persisted JSON is surfaced without reset or recovery writes", (t) => {
  const f = fixture(t),
    r = f.open(),
    sql = f.sql();
  sql.prepare("UPDATE workspace_state SET state_json=?").run("{broken");
  assert.throws(
    () => r.read(),
    (error) => error.status === 503,
  );
  assert.equal(
    sql.prepare("SELECT state_json FROM workspace_state").get().state_json,
    "{broken",
  );
});
test("snapshot capture reads accepted content and rejects stale capture requests", (t) => {
  const f = fixture(t),
    r = f.open(),
    old = r.read();
  const captured = r.capture(old.revision, "root");
  assert.equal(r.version(captured.versionId).snapshot.page.title, "Page root");
  const draft = structuredClone(old.state);
  draft.pages[0].title = "Later";
  r.replace(old.revision, draft);
  assert.throws(
    () => r.capture(old.revision, "root"),
    (error) => error.status === 409,
  );
  assert.equal(r.version(captured.versionId).snapshot.page.title, "Page root");
  assert.equal(r.listVersions("root").total, 1);
});
test("snapshot restore restores content and comments while preserving current hierarchy and visibility", (t) => {
  const f = fixture(t),
    r = f.open();
  let current = r.read();
  current.state.commentThreads = [
    {
      id: "thread",
      pageId: "child",
      blockId: "block-child",
      resolved: false,
      createdAt: TIME,
    },
  ];
  current.state.comments = [
    {
      id: "comment",
      threadId: "thread",
      authorId: "owner",
      content: "Original comment",
      createdAt: TIME,
    },
  ];
  current = r.replace(current.revision, current.state);
  const captured = r.capture(current.revision, "child");
  current.state.pages[1].title = "Later title";
  current.state.pages[1].parentId = null;
  current.state.pages[1].shared = "workspace";
  current.state.comments[0].content = "Later comment";
  current = r.replace(current.revision, current.state);
  const restored = r.restore(current.revision, captured.versionId);
  assert.equal(restored.state.pages[1].title, "Page child");
  assert.equal(restored.state.pages[1].parentId, null);
  assert.equal(restored.state.pages[1].shared, "workspace");
  assert.equal(restored.state.comments[0].content, "Original comment");
  assert.equal(
    restored.state.activities.at(-1).action,
    "page_version_restored",
  );
});
test("snapshot restore cannot create cross-page block collisions and rolls back", (t) => {
  const f = fixture(t),
    r = f.open();
  let current = r.read();
  const captured = r.capture(current.revision, "child");
  current.state.blocksByPage.child = [];
  current.state.blocksByPage.root.push({
    id: "block-child",
    type: "paragraph",
    text: "Now another page owns this identity",
    props: {},
    children: [],
  });
  current = r.replace(current.revision, current.state);
  assert.throws(
    () => r.restore(current.revision, captured.versionId),
    /Duplicate block/,
  );
  assert.deepEqual(r.read(), current);
});
test("snapshot history is paginated and deletion is explicit", (t) => {
  const f = fixture(t),
    r = f.open(),
    old = r.read();
  for (let i = 0; i < 5; i++) r.capture(old.revision, "root");
  const first = r.listVersions("root", { page: 1, pageSize: 2 });
  assert.equal(first.total, 5);
  assert.equal(first.versions.length, 2);
  const second = r.listVersions("root", { page: 2, pageSize: 2 });
  assert.equal(second.versions.length, 2);
  assert.ok(
    !first.versions.some((a) => second.versions.some((b) => a.id === b.id)),
  );
  r.removeVersion(old.revision, first.versions[0].id);
  assert.equal(r.listVersions("root").total, 4);
  assert.throws(
    () => r.version(first.versions[0].id),
    (error) => error.status === 404,
  );
});
test("legacy adoption is explicit preserves accepted JSON and copies matching history", (t) => {
  const f = fixture(t, { initialize: false }),
    sql = f.sql(),
    value = state(),
    raw = JSON.stringify(value, null, 2);
  sql.exec(
    "CREATE TABLE workspace_state(workspace_id TEXT PRIMARY KEY,state_json TEXT,updated_at TEXT);CREATE TABLE page_versions(id TEXT,page_id TEXT,state_json TEXT,created_at TEXT,author_id TEXT);",
  );
  sql
    .prepare("INSERT INTO workspace_state VALUES(?,?,?)")
    .run("workspace-default", raw, TIME);
  sql
    .prepare("INSERT INTO page_versions VALUES(?,?,?,?,?)")
    .run(
      "legacy-version",
      "root",
      JSON.stringify({ page: value.pages[0], blocks: value.blocksByPage.root }),
      TIME,
      "owner",
    );
  assert.throws(() => f.open(), /adoption/);
  const result = initializeWorkspace(f.file, { token: f.token, adopt: true });
  assert.equal(result.importedVersions, 1);
  assert.equal(
    sql.prepare("SELECT state_json FROM workspace_state").get().state_json,
    raw,
  );
  const r = f.open();
  assert.equal(r.authenticate(f.token), "owner");
  assert.equal(r.version("legacy-version").snapshot.page.title, "Page root");
  assert.equal(
    sql.prepare("SELECT count(*) AS n FROM page_versions").get().n,
    1,
  );
});
test("invalid legacy adoption leaves original schema and data intact", (t) => {
  const f = fixture(t, { initialize: false }),
    sql = f.sql();
  sql.exec(
    "CREATE TABLE workspace_state(workspace_id TEXT PRIMARY KEY,state_json TEXT,updated_at TEXT);",
  );
  sql
    .prepare("INSERT INTO workspace_state VALUES(?,?,?)")
    .run("workspace-default", "{broken", TIME);
  assert.throws(
    () => initializeWorkspace(f.file, { token: f.token, adopt: true }),
    (error) => error.status === 503,
  );
  assert.equal(
    sql.prepare("SELECT state_json FROM workspace_state").get().state_json,
    "{broken",
  );
  assert.deepEqual(
    sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(),
    [{ name: "workspace_state" }],
  );
});
