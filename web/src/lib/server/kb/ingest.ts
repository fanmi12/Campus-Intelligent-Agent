import fs from "node:fs";
import path from "node:path";
import { embedInBatches, getEmbeddingModel } from "../ai/models";
import { getDb, getMeta, setMeta, transaction } from "../db";
import { env } from "../env";
import { ATTACHMENT_ONLY_NOTE, chunkMarkdown, type ChunkDraft } from "./markdown";
import { indexTerms, invalidateSearchIndex } from "./search";

export type IngestReport = {
  files: number;
  chunks: number;
  added: number;
  embedded: number;
  removed: number;
  embeddingModel: string | null;
  finishedAt: number;
  durationMs: number;
};

export type IngestProgress = (done: number, total: number) => void;

// knowledge/ 下所有 .md 都会入库；以 _ 或 . 开头的文件/文件夹、README.md 会被跳过
export function listKnowledgeFiles(dir = env.knowledgeDir): string[] {
  const walk = (current: string): string[] => {
    if (!fs.existsSync(current)) return [];
    return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name.startsWith("_") || entry.name.startsWith(".")) return [];
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) return walk(full);
      if (!/\.md$/i.test(entry.name) || entry.name.toLowerCase() === "readme.md") return [];
      return [path.relative(dir, full).split(path.sep).join("/")];
    });
  };
  return walk(dir).sort();
}

// 官网上正文是图片或附件的页面只有一句占位说明。pnpm kb:ocr 转写过的（knowledge/官网附件/，原文网址相同），
// 占位页就不再入库，免得检索结果里出现两份同名资料
function dropTranscribedPlaceholders(drafts: ChunkDraft[]): ChunkDraft[] {
  const covered = new Set(
    drafts.filter((draft) => draft.sourceUrl && draft.content !== ATTACHMENT_ONLY_NOTE).map((draft) => draft.sourceUrl),
  );
  return drafts.filter((draft) => draft.content !== ATTACHMENT_ONLY_NOTE || !covered.has(draft.sourceUrl));
}

function toBlob(vector: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(vector).buffer);
}

// 全文索引和资料表对不上时（比如上次导入中途断电）整体重建
function ensureFtsInSync() {
  const db = getDb();
  const chunks = (db.prepare("SELECT COUNT(*) AS n FROM kb_chunks").get() as { n: number }).n;
  const indexed = (db.prepare("SELECT COUNT(*) AS n FROM kb_fts").get() as { n: number }).n;
  if (chunks === indexed) return;
  transaction(() => {
    db.exec("DELETE FROM kb_fts");
    const insert = db.prepare("INSERT INTO kb_fts (rowid, terms) VALUES (?, ?)");
    const rows = db.prepare("SELECT rowid, doc_title, heading, content FROM kb_chunks").all() as {
      rowid: number;
      doc_title: string;
      heading: string;
      content: string;
    }[];
    for (const row of rows) insert.run(row.rowid, indexTerms({ docTitle: row.doc_title, heading: row.heading, content: row.content }));
  });
  console.log(`[kb] 全文索引已重建：${chunks} 段`);
}

// 第二步：给还没有向量（或换了嵌入模型）的段落补算向量，每算完一批立即存库，中途中断下次接着算
async function backfillVectors(onProgress?: IngestProgress): Promise<number> {
  const model = getEmbeddingModel();
  const modelId = env.embedding.model;
  if (!model || !modelId) return 0;

  const db = getDb();
  const pending = db
    .prepare("SELECT rowid, doc_title, heading, content FROM kb_chunks WHERE embedding IS NULL OR embedding_model IS NOT ?")
    .all(modelId) as { rowid: number; doc_title: string; heading: string; content: string }[];
  if (!pending.length) return 0;

  const update = db.prepare("UPDATE kb_chunks SET embedding = ?, embedding_model = ? WHERE rowid = ?");
  let done = 0;
  await embedInBatches(
    model,
    pending,
    (row) => `${row.doc_title}${row.heading ? ` › ${row.heading}` : ""}\n${row.content}`,
    (batch, vectors) => {
      transaction(() => batch.forEach((row, i) => update.run(toBlob(vectors[i]), modelId, row.rowid)));
      done += batch.length;
      onProgress?.(done, pending.length);
    },
  );
  invalidateSearchIndex();
  return done;
}

let running: Promise<IngestReport> | null = null;

// 增量导入：新增的段落写入资料表和全文索引，已不存在的段落删除，没变的段落不动；
// 配置了嵌入模型时，再给缺向量的段落补算向量
export function ingestKnowledge(onProgress?: IngestProgress): Promise<IngestReport> {
  running ??= runIngest(onProgress).finally(() => {
    running = null;
  });
  return running;
}

async function runIngest(onProgress?: IngestProgress): Promise<IngestReport> {
  const startedAt = Date.now();
  const files = listKnowledgeFiles();
  const drafts = dropTranscribedPlaceholders(
    files.flatMap((file) => chunkMarkdown(file, fs.readFileSync(path.join(env.knowledgeDir, file), "utf8"))),
  );

  // 第一步：同步文字和全文索引（几秒钟）
  const db = getDb();
  ensureFtsInSync();
  const existing = new Map(
    (db.prepare("SELECT rowid, id FROM kb_chunks").all() as { rowid: number; id: string }[]).map((row) => [
      row.id,
      row,
    ]),
  );
  const keep = new Set(drafts.map((draft) => draft.id));
  const stale = [...existing.values()].filter((row) => !keep.has(row.id));
  const added = drafts.filter((draft) => !existing.has(draft.id));

  transaction(() => {
    const removeChunk = db.prepare("DELETE FROM kb_chunks WHERE rowid = ?");
    const removeTerms = db.prepare("DELETE FROM kb_fts WHERE rowid = ?");
    for (const row of stale) {
      removeTerms.run(row.rowid);
      removeChunk.run(row.rowid);
    }

    const insert = db.prepare(`
      INSERT INTO kb_chunks (id, doc_path, doc_title, heading, content, category, kind, source_url, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertTerms = db.prepare("INSERT INTO kb_fts (rowid, terms) VALUES (?, ?)");
    for (const draft of added) {
      const { lastInsertRowid } = insert.run(
        draft.id,
        draft.docPath,
        draft.docTitle,
        draft.heading,
        draft.content,
        draft.category ?? null,
        draft.kind ?? null,
        draft.sourceUrl ?? null,
        draft.updated ?? null,
      );
      insertTerms.run(lastInsertRowid, indexTerms(draft));
    }
  });
  invalidateSearchIndex();

  // 第二步：补算向量（可能要几分钟；搜索会自动用上已经算好的部分）
  const embedded = await backfillVectors(onProgress);

  const report: IngestReport = {
    files: files.length,
    chunks: drafts.length,
    added: added.length,
    embedded,
    removed: stale.length,
    embeddingModel: env.embedding.model ?? null,
    finishedAt: Date.now(),
    durationMs: Date.now() - startedAt,
  };
  setMeta("kb_last_ingest", JSON.stringify(report));
  return report;
}

export function lastIngestReport(): IngestReport | null {
  const raw = getMeta("kb_last_ingest");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IngestReport;
  } catch {
    return null;
  }
}

export type KnowledgeCategory = {
  category: string;
  docs: number;
  chunks: number;
  latest: string | null;
};

// 后台展示用：按栏目汇总（资料有几千篇，不逐篇列出）
export function knowledgeOverview(): {
  categories: KnowledgeCategory[];
  docs: number;
  chunks: number;
  embedded: number;
  filesOnDisk: number;
  lastIngest: IngestReport | null;
} {
  const db = getDb();
  const categories = db
    .prepare(
      `SELECT COALESCE(category, '未分类') AS category, COUNT(DISTINCT doc_path) AS docs, COUNT(*) AS chunks, MAX(updated) AS latest
       FROM kb_chunks GROUP BY COALESCE(category, '未分类') ORDER BY docs DESC`,
    )
    .all() as KnowledgeCategory[];
  const totals = db
    .prepare("SELECT COUNT(DISTINCT doc_path) AS docs, COUNT(*) AS chunks, SUM(embedding IS NOT NULL) AS embedded FROM kb_chunks")
    .get() as { docs: number; chunks: number; embedded: number | null };
  return {
    categories,
    docs: totals.docs,
    chunks: totals.chunks,
    embedded: totals.embedded ?? 0,
    filesOnDisk: listKnowledgeFiles().length,
    lastIngest: lastIngestReport(),
  };
}

// 首次启动或知识库为空时自动导入一次。文字和全文索引是同步写入的，调用返回时就能检索了，
// 向量在后台继续算，不让第一个提问的同学干等
export async function ensureKnowledgeIndexed(): Promise<void> {
  const row = getDb().prepare("SELECT COUNT(*) AS count FROM kb_chunks").get() as { count: number };
  if (row.count === 0 && listKnowledgeFiles().length > 0) {
    ingestKnowledge()
      .then((report) => console.log(`[kb] 已自动导入知识库：${report.files} 个文件，${report.chunks} 段`))
      .catch((error) => console.error("[kb] 自动导入失败", error));
  }
}
