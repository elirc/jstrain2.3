import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { createDefaultWorkspace } from "./defaultWorkspace";

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "workspace.sqlite");

let dbInstance;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_state (
      workspace_id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#4a5568'
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      parent_id TEXT,
      icon TEXT,
      cover_image TEXT,
      shared TEXT DEFAULT 'private',
      is_deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      type TEXT NOT NULL,
      text TEXT,
      props_json TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS databases (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      title TEXT NOT NULL,
      props_json TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS database_properties (
      id TEXT PRIMARY KEY,
      database_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      options_json TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS database_views (
      id TEXT PRIMARY KEY,
      database_id TEXT NOT NULL,
      name TEXT NOT NULL,
      view_type TEXT NOT NULL,
      props_json TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS database_view_filters (
      id TEXT PRIMARY KEY,
      view_id TEXT NOT NULL,
      field TEXT NOT NULL,
      operator TEXT NOT NULL,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS database_view_sorts (
      id TEXT PRIMARY KEY,
      view_id TEXT NOT NULL,
      field TEXT NOT NULL,
      direction TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comment_threads (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      resolved INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS page_versions (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      author_id TEXT
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shared_links (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      token TEXT NOT NULL,
      permission TEXT NOT NULL,
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      page_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS page_activity (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL
    );
  `);
}

function seedDefaultState(db) {
  const existing = db.prepare("SELECT workspace_id FROM workspace_state WHERE workspace_id = ?").get("workspace-default");
  if (existing) {
    return;
  }
  const state = createDefaultWorkspace();
  const timestamp = new Date().toISOString();
  db.prepare(
    "INSERT INTO workspace_state (workspace_id, state_json, updated_at) VALUES (?, ?, ?)"
  ).run("workspace-default", JSON.stringify(state), timestamp);
}

export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }
  ensureDir();
  dbInstance = new Database(DB_FILE);
  ensureSchema(dbInstance);
  seedDefaultState(dbInstance);
  return dbInstance;
}

export function getWorkspaceState(workspaceId = "workspace-default") {
  const db = getDb();
  const row = db.prepare("SELECT state_json FROM workspace_state WHERE workspace_id = ?").get(workspaceId);
  if (!row) {
    const state = createDefaultWorkspace();
    upsertWorkspaceState(workspaceId, state);
    return state;
  }
  return JSON.parse(row.state_json);
}

export function upsertWorkspaceState(workspaceId, state) {
  const db = getDb();
  const timestamp = new Date().toISOString();
  db.prepare(`
      INSERT INTO workspace_state (workspace_id, state_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        state_json = excluded.state_json,
        updated_at = excluded.updated_at
    `).run(workspaceId, JSON.stringify(state), timestamp);
}

export function savePageVersion({ pageId, workspaceId = "workspace-default", authorId = "user-owner" }) {
  const db = getDb();
  const state = getWorkspaceState(workspaceId);
  const page = state.pages.find((item) => item.id === pageId);
  if (!page) {
    return null;
  }
  const snapshot = {
    page,
    blocks: state.blocksByPage[pageId] || [],
  };
  const id = randomUUID();
  db.prepare(`
      INSERT INTO page_versions (id, page_id, state_json, created_at, author_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, pageId, JSON.stringify(snapshot), new Date().toISOString(), authorId);
  return id;
}

export function listPageVersions(pageId) {
  const db = getDb();
  return db
    .prepare("SELECT id, page_id, created_at, author_id FROM page_versions WHERE page_id = ? ORDER BY created_at DESC")
    .all(pageId);
}

export function getPageVersion(versionId) {
  const db = getDb();
  const row = db.prepare("SELECT id, page_id, state_json FROM page_versions WHERE id = ?").get(versionId);
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    pageId: row.page_id,
    snapshot: JSON.parse(row.state_json),
  };
}
