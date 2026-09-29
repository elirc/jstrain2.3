import fs from "node:fs";
import path from "node:path";
import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  fail,
  id,
  text,
  validateWorkspace,
  validateWorkspaceIdentity,
  MAX_STATE_BYTES,
} from "./workspaceSchema.mjs";

export const WORKSPACE_ID = "workspace-default";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const revisionOf = (row, version) => hash(`${version}\n${row.state_json}`);
function absolute(file) {
  if (typeof file !== "string" || !path.isAbsolute(file))
    throw new TypeError("An absolute workspace database path is required");
  return path.resolve(file);
}
function checkToken(token) {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}
function parseState(raw) {
  if (Buffer.byteLength(raw) > MAX_STATE_BYTES)
    throw fail(
      "Stored workspace exceeds its size limit; preserve the database",
      503,
    );
  try {
    return validateWorkspace(JSON.parse(raw));
  } catch {
    throw fail(
      "Stored workspace is invalid. Preserve a backup and repair an isolated copy; no reset was performed",
      503,
    );
  }
}
function tables(db) {
  return new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row) => row.name),
  );
}
function schema(db) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS workspace_state(workspace_id TEXT PRIMARY KEY,state_json TEXT NOT NULL,updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS workspace_control(workspace_id TEXT PRIMARY KEY,version INTEGER NOT NULL CHECK(version>=1));
  CREATE TABLE IF NOT EXISTS local_owner(id INTEGER PRIMARY KEY CHECK(id=1),owner_id TEXT NOT NULL,token_hash TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS workspace_snapshots(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,page_id TEXT NOT NULL,state_json TEXT NOT NULL,created_at TEXT NOT NULL,author_id TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS workspace_snapshots_page ON workspace_snapshots(workspace_id,page_id,created_at);
`);
}

// Explicit setup only. Existing data requires adoption; its old tables and bytes
// in workspace_state remain unchanged. SQLite rolls back all schema/auth work
// on failure. No application request calls this function.
export function initializeWorkspace(
  file,
  { state, token, adopt = false } = {},
) {
  file = absolute(file);
  if (!checkToken(token))
    throw fail("Setup requires a random 64-character hexadecimal token");
  const existed = fs.existsSync(file);
  if (existed && !adopt)
    throw fail(
      "A database already exists. Preserve a backup and use explicit adoption for a legacy workspace",
      409,
    );
  if (!existed && adopt)
    throw fail("Adoption requires an existing database", 409);
  if (!existed) {
    validateWorkspace(state);
    if (state.meta.workspaceId !== WORKSPACE_ID)
      throw fail("Unsupported workspace ID");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const descriptor = fs.openSync(file, "wx", 0o600);
    fs.closeSync(descriptor);
  }
  const db = new Database(file, { fileMustExist: true, timeout: 2000 });
  try {
    const result = db
      .transaction(() => {
        const existing = tables(db);
        if (
          existing.has("local_owner") &&
          db.prepare("SELECT id FROM local_owner WHERE id=1").get()
        )
          throw fail(
            "An owner is already configured; setup cannot reset credentials",
            409,
          );
        let accepted = state;
        if (existed) {
          if (!existing.has("workspace_state"))
            throw fail(
              "Existing database is not a recognized legacy workspace",
              409,
            );
          const row = db
            .prepare(
              "SELECT state_json FROM workspace_state WHERE workspace_id=?",
            )
            .get(WORKSPACE_ID);
          if (!row)
            throw fail(
              "Legacy default workspace is missing; database was not changed",
              409,
            );
          accepted = parseState(row.state_json);
        }
        validateWorkspace(accepted);
        schema(db);
        if (!existed)
          db.prepare(
            "INSERT INTO workspace_state(workspace_id,state_json,updated_at) VALUES(?,?,?)",
          ).run(
            WORKSPACE_ID,
            JSON.stringify(accepted),
            accepted.meta.updatedAt,
          );
        db.prepare(
          "INSERT INTO workspace_control(workspace_id,version) VALUES(?,1)",
        ).run(WORKSPACE_ID);
        db.prepare(
          "INSERT INTO local_owner(id,owner_id,token_hash) VALUES(1,?,?)",
        ).run(accepted.meta.ownerId, hash(token));
        let importedVersions = 0;
        if (existing.has("page_versions")) {
          const legacy = db
            .prepare(
              "SELECT id,page_id,state_json,created_at,author_id FROM page_versions ORDER BY created_at,id",
            )
            .all();
          if (legacy.length > 2000)
            throw fail(
              "Legacy history exceeds the adoption limit; migrate an isolated copy explicitly",
              409,
            );
          for (const row of legacy) {
            if (!accepted.pages.some((page) => page.id === row.page_id))
              continue; // retained in original table, never deleted
            let snapshot;
            try {
              snapshot = JSON.parse(row.state_json);
            } catch {
              throw fail(
                "Legacy snapshot JSON is invalid; adoption was rolled back",
                409,
              );
            }
            if (
              !snapshot?.page ||
              !Array.isArray(snapshot.blocks) ||
              snapshot.page.id !== row.page_id
            )
              throw fail(
                "Legacy snapshot shape is invalid; adoption was rolled back",
                409,
              );
            db.prepare(
              "INSERT INTO workspace_snapshots(id,workspace_id,page_id,state_json,created_at,author_id) VALUES(?,?,?,?,?,?)",
            ).run(
              row.id,
              WORKSPACE_ID,
              row.page_id,
              row.state_json,
              row.created_at,
              row.author_id || accepted.meta.ownerId,
            );
            importedVersions++;
          }
        }
        return {
          workspaceId: WORKSPACE_ID,
          ownerId: accepted.meta.ownerId,
          adopted: existed,
          importedVersions,
        };
      })
      .immediate();
    return result;
  } finally {
    db.close();
  }
}

export function createWorkspaceRepository(
  file,
  {
    dbFactory = (name) =>
      new Database(name, { fileMustExist: true, timeout: 2000 }),
    now = () => new Date().toISOString(),
  } = {},
) {
  file = absolute(file);
  if (!fs.existsSync(file))
    throw fail(
      "Workspace is not initialized. Run the explicit setup command",
      503,
    );
  const db = dbFactory(file);
  try {
    if (
      ![
        "workspace_state",
        "workspace_control",
        "workspace_snapshots",
        "local_owner",
      ].every((name) => tables(db).has(name))
    )
      throw fail(
        "Workspace needs explicit legacy adoption before it can be opened",
        503,
      );
  } catch (error) {
    db.close();
    throw error;
  }
  function read() {
    // Both rows come from one SQL statement and therefore one read snapshot.
    const row = db
      .prepare(
        "SELECT s.state_json,c.version,o.owner_id,o.token_hash FROM workspace_state s JOIN workspace_control c USING(workspace_id) JOIN local_owner o ON o.id=1 WHERE s.workspace_id=?",
      )
      .get(WORKSPACE_ID);
    if (!row || !Number.isSafeInteger(row.version) || row.version < 1)
      throw fail(
        "Workspace metadata is unavailable; preserve the database",
        503,
      );
    const state = parseState(row.state_json);
    if (
      state.meta.ownerId !== row.owner_id ||
      !/^[a-f0-9]{64}$/.test(row.token_hash)
    )
      throw fail(
        "Workspace owner configuration is inconsistent; preserve the database",
        503,
      );
    return {
      state,
      revision: revisionOf(row, row.version),
      version: row.version,
      instanceId: hash("workspace-instance:" + row.token_hash).slice(0, 24),
    };
  }
  function owner() {
    const value = db
      .prepare("SELECT owner_id,token_hash FROM local_owner WHERE id=1")
      .get();
    if (!value || !/^[a-f0-9]{64}$/.test(value.token_hash))
      throw fail("Owner configuration is invalid; preserve the database", 503);
    return value;
  }
  function authenticate(token) {
    if (!checkToken(token))
      throw fail("A valid workspace access token is required", 401);
    const accepted = owner();
    if (
      !timingSafeEqual(
        Buffer.from(hash(token), "hex"),
        Buffer.from(accepted.token_hash, "hex"),
      )
    )
      throw fail("A valid workspace access token is required", 401);
    return accepted.owner_id;
  }
  function expected(revision, current) {
    if (typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision))
      throw fail("Supply the accepted workspace revision", 428);
    if (revision !== current.revision)
      throw fail(
        "The workspace changed. Review the accepted version while keeping your draft",
        409,
      );
  }
  function activePage(state, pageId) {
    id(pageId, "page ID");
    const page = state.pages.find((page) => page.id === pageId);
    if (!page || page.isDeleted) throw fail("Active page not found", 404);
    return page;
  }
  function persist(current, draft, { action, pageId = null }) {
    validateWorkspaceIdentity(current.state, draft);
    const timestamp = now();
    draft.meta.updatedAt = timestamp;
    draft.activities = [
      ...current.state.activities,
      {
        id: randomUUID(),
        pageId,
        actorId: owner().owner_id,
        action,
        createdAt: timestamp,
      },
    ].slice(-200);
    validateWorkspace(draft);
    if (current.version >= Number.MAX_SAFE_INTEGER)
      throw fail("Workspace version limit reached", 409);
    db.prepare(
      "UPDATE workspace_state SET state_json=?,updated_at=? WHERE workspace_id=?",
    ).run(JSON.stringify(draft), timestamp, WORKSPACE_ID);
    db.prepare(
      "UPDATE workspace_control SET version=version+1 WHERE workspace_id=?",
    ).run(WORKSPACE_ID);
    return read();
  }
  function update(
    revision,
    mutate,
    metadata = { action: "workspace_updated" },
  ) {
    if (typeof mutate !== "function")
      throw new TypeError("A synchronous mutation is required");
    return db
      .transaction(() => {
        const current = read();
        expected(revision, current);
        const draft = structuredClone(current.state);
        const value = mutate(draft);
        if (value && typeof value.then === "function")
          throw new TypeError("Mutation must be synchronous");
        const accepted = persist(current, draft, metadata);
        return {
          ...accepted,
          ...(value === undefined ? {} : { result: structuredClone(value) }),
        };
      })
      .immediate();
  }
  function replace(revision, state) {
    validateWorkspace(state);
    return update(revision, (draft) => {
      for (const key of Object.keys(draft)) delete draft[key];
      Object.assign(draft, structuredClone(state));
    });
  }
  function capture(revision, pageId) {
    return db
      .transaction(() => {
        const current = read();
        expected(revision, current);
        const page = activePage(current.state, pageId);
        const count = db
          .prepare(
            "SELECT COUNT(*) AS total FROM workspace_snapshots WHERE workspace_id=?",
          )
          .get(WORKSPACE_ID).total;
        if (count >= 2000)
          throw fail(
            "Snapshot limit reached; export and remove old snapshots explicitly",
            409,
          );
        const threads = current.state.commentThreads.filter(
          (item) => item.pageId === pageId,
        );
        const ids = new Set(threads.map((item) => item.id));
        const snapshot = {
          page,
          blocks: current.state.blocksByPage[pageId],
          threads,
          comments: current.state.comments.filter((item) =>
            ids.has(item.threadId),
          ),
        };
        const versionId = randomUUID();
        db.prepare(
          "INSERT INTO workspace_snapshots(id,workspace_id,page_id,state_json,created_at,author_id) VALUES(?,?,?,?,?,?)",
        ).run(
          versionId,
          WORKSPACE_ID,
          pageId,
          JSON.stringify(snapshot),
          now(),
          owner().owner_id,
        );
        return { versionId, pageId, revision: current.revision };
      })
      .immediate();
  }
  function version(versionId) {
    id(versionId, "version ID");
    const row = db
      .prepare(
        "SELECT id,page_id,state_json,created_at,author_id FROM workspace_snapshots WHERE workspace_id=? AND id=?",
      )
      .get(WORKSPACE_ID, versionId);
    if (!row) throw fail("Snapshot not found", 404);
    let snapshot;
    try {
      snapshot = JSON.parse(row.state_json);
    } catch {
      throw fail("Snapshot JSON is invalid; preserve the database", 503);
    }
    return {
      id: row.id,
      pageId: row.page_id,
      createdAt: row.created_at,
      authorId: row.author_id,
      snapshot,
    };
  }
  function listVersions(pageId, { page = 1, pageSize = 20 } = {}) {
    id(pageId, "page ID");
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 50
    )
      throw fail("Invalid snapshot pagination");
    const total = db
      .prepare(
        "SELECT COUNT(*) AS total FROM workspace_snapshots WHERE workspace_id=? AND page_id=?",
      )
      .get(WORKSPACE_ID, pageId).total;
    const versions = db
      .prepare(
        "SELECT id,page_id,created_at,author_id FROM workspace_snapshots WHERE workspace_id=? AND page_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
      )
      .all(WORKSPACE_ID, pageId, pageSize, (page - 1) * pageSize);
    return { versions, total, page, pageSize };
  }
  function restore(revision, versionId) {
    return update(
      revision,
      (draft) => {
        const saved = version(versionId);
        const page = activePage(draft, saved.pageId);
        const snapshot = saved.snapshot;
        if (
          !snapshot?.page ||
          snapshot.page.id !== page.id ||
          !Array.isArray(snapshot.blocks)
        )
          throw fail("Snapshot shape is invalid; no restore performed", 503);
        // Restore document content, never historical hierarchy/visibility/deletion.
        for (const key of ["title", "icon", "coverImage"])
          page[key] = snapshot.page[key];
        page.updatedAt = now();
        const oldThreads = new Set(
          draft.commentThreads
            .filter((item) => item.pageId === page.id)
            .map((item) => item.id),
        );
        const restoredIds = new Set(snapshot.blocks.map((block) => block.id));
        const threads =
          snapshot.threads ??
          draft.commentThreads.filter(
            (item) => item.pageId === page.id && restoredIds.has(item.blockId),
          );
        const threadIds = new Set(threads.map((item) => item.id));
        const comments =
          snapshot.comments ??
          draft.comments.filter((item) => threadIds.has(item.threadId));
        draft.blocksByPage[page.id] = structuredClone(snapshot.blocks);
        draft.commentThreads = [
          ...draft.commentThreads.filter((item) => item.pageId !== page.id),
          ...structuredClone(threads),
        ];
        draft.comments = [
          ...draft.comments.filter((item) => !oldThreads.has(item.threadId)),
          ...structuredClone(comments),
        ];
        return { pageId: page.id };
      },
      { action: "page_version_restored" },
    );
  }
  function removeVersion(revision, versionId) {
    return db
      .transaction(() => {
        const current = read();
        expected(revision, current);
        const saved = version(versionId);
        db.prepare(
          "DELETE FROM workspace_snapshots WHERE workspace_id=? AND id=?",
        ).run(WORKSPACE_ID, versionId);
        return {
          deleted: true,
          versionId: saved.id,
          revision: current.revision,
        };
      })
      .immediate();
  }
  return {
    read,
    authenticate,
    replace,
    update,
    capture,
    version,
    listVersions,
    restore,
    removeVersion,
    close: () => db.close(),
  };
}
