import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { env } from "./env";

// 用 Node 自带的 SQLite，一个文件就是整个数据库（data/app.db），备份直接复制即可
const SCHEMA = `
CREATE TABLE IF NOT EXISTS kb_chunks (
  id TEXT PRIMARY KEY,
  doc_path TEXT NOT NULL,
  doc_title TEXT NOT NULL,
  heading TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  category TEXT,
  kind TEXT,
  source_url TEXT,
  updated TEXT,
  embedding BLOB,
  embedding_model TEXT
);

-- 全文索引：存的是切好的中文二元组（见 kb/tokenize.ts），rowid 与 kb_chunks 的 rowid 一一对应
CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(terms, tokenize = 'unicode61 remove_diacritics 0');
CREATE VIRTUAL TABLE IF NOT EXISTS kb_vocab USING fts5vocab(kb_fts, 'row');

CREATE TABLE IF NOT EXISTS chat_logs (
  id TEXT PRIMARY KEY,
  chat_id TEXT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  top_similarity REAL,
  low_confidence INTEGER NOT NULL DEFAULT 0,
  source_ids TEXT NOT NULL DEFAULT '[]',
  tools TEXT NOT NULL DEFAULT '[]',
  has_image INTEGER NOT NULL DEFAULT 0,
  demo INTEGER NOT NULL DEFAULT 0,
  -- 从收到提问到回答出现第一个字的毫秒数
  first_token_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created ON chat_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS feedback (
  message_id TEXT PRIMARY KEY,
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

declare global {
  var __campusDb: DatabaseSync | undefined;
}

export function getDb(): DatabaseSync {
  if (!globalThis.__campusDb) {
    fs.mkdirSync(env.dataDir, { recursive: true });
    const db = new DatabaseSync(path.join(/* turbopackIgnore: true */ env.dataDir, "app.db"));
    db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    db.exec(SCHEMA);
    // 旧版本数据库缺的列，补上
    const columnsOf = (table: string) =>
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name);
    if (!columnsOf("kb_chunks").includes("kind")) db.exec("ALTER TABLE kb_chunks ADD COLUMN kind TEXT");
    if (!columnsOf("chat_logs").includes("first_token_ms")) {
      db.exec("ALTER TABLE chat_logs ADD COLUMN first_token_ms INTEGER");
    }
    globalThis.__campusDb = db;
  }
  return globalThis.__campusDb;
}

export function getMeta(key: string): string | undefined {
  const row = getDb().prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setMeta(key: string, value: string) {
  getDb()
    .prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
