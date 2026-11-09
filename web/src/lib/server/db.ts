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

-- 小狮课堂：每节课一行，课程内容整体存成 JSON（data）
CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  client_id TEXT,                    -- 创建者的匿名浏览器标识（配额、删除、重新生成），不关联身份
  status TEXT NOT NULL,              -- generating | ready | failed
  title TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL,
  data TEXT NOT NULL,                -- Lesson JSON（不含 material）
  material TEXT,                     -- 用户提供的资料原文：只给服务端生成用，不随接口返回，7 天后清空
  views INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lessons_client ON lessons (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lessons_created ON lessons (created_at DESC);

-- 学习行为（匿名，不存 IP），供后台统计和体验评测报告
CREATE TABLE IF NOT EXISTS lesson_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id TEXT NOT NULL,
  client_id TEXT,
  type TEXT NOT NULL,                -- view | scene | finish | grade | discuss | review
  scene_id TEXT,
  value REAL,                        -- finish：得分 0-100；其他可空
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lesson_events_created ON lesson_events (created_at DESC);
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
