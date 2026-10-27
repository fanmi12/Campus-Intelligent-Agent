import { setTimeout as sleep } from "node:timers/promises";
import { embedQuery, getEmbeddingModel, rerank } from "../ai/models";
import { getDb } from "../db";
import { env, hasEmbedding, hasRerank } from "../env";
import { ATTACHMENT_ONLY_NOTE } from "./markdown";
import { confidenceThreshold, coverageOf, planQuery } from "./query";
import { tokenize } from "./tokenize";

// 检索分三步：
// 1. 召回：SQLite 全文索引（BM25 关键词 + 同义词）和语义向量各取一批候选
// 2. 粗排：按关键词覆盖度、资料类型、栏目、时效加权
// 3. 精排：重排模型逐段判断和问题的相关度（没配置重排模型就用粗排结果）
// 有重排模型时两路并行：关键词候选先送去重排，不等问题的向量；向量回来后，只把语义检索新找到的候选补一次重排。
// 重排是逐段独立打分的，两批分数可以直接放在一起比较

export type IndexedChunk = {
  rowid: number;
  id: string;
  docPath: string;
  docTitle: string;
  heading: string;
  content: string;
  category: string | null;
  kind: string | null;
  sourceUrl: string | null;
  updated: string | null;
};

export type SearchHit = {
  chunk: IndexedChunk;
  similarity: number | null;
  relevance: number | null;
  coverage: number;
};

export type SearchResult = {
  hits: SearchHit[];
  // 最高相关度：有重排模型时是重排分数，否则是语义相似度
  topSimilarity: number | null;
  topCoverage: number;
  lowConfidence: boolean;
};

type ChunkRow = {
  rowid: number;
  id: string;
  doc_path: string;
  doc_title: string;
  heading: string;
  content: string;
  category: string | null;
  kind: string | null;
  source_url: string | null;
  updated: string | null;
};

type Candidate = {
  chunk: IndexedChunk;
  coverage: number;
  weight: number;
  similarity: number | null;
  // 粗排分
  score: number;
  // 重排分（0～1），没重排过为 null
  relevance: number | null;
};

const KEYWORD_CANDIDATES = 80;
const SEMANTIC_CANDIDATES = 40;
// 第一批（关键词候选）送去重排的段数；第二批（语义检索新找到的）段数
const RERANK_CANDIDATES = 30;
const RERANK_EXTRAS = 10;
const RERANK_PER_DOC = 3;
// 第一批重排完成后，最多再等问题的向量这么久；再晚就不等了，只用关键词候选
const SEMANTIC_GRACE_MS = 500;
const MAX_HITS_PER_DOC = 2;
const KIND_WEIGHT: Record<string, number> = { 资料: 1, 通知: 0.9, 新闻: 0.65 };
// 面向学生的栏目优先；人事招聘、科研管理、党建类对学生提问参考价值低
const CATEGORY_WEIGHT: Record<string, number> = {
  学校概况: 1.3,
  专业介绍: 1.2,
  教务处办事指南: 1.2,
  学生处: 1.1,
  教务处: 1.1,
  图书馆: 1.05,
  国际交流: 0.9,
  科研处: 0.75,
  人事处: 0.7,
  党建网: 0.6,
  网络电视台: 0.6,
};
// 团队自己整理的资料（不在 knowledge/官网/、官网附件/ 里）最可靠，优先采用。
// 官网附件/ 是识图模型转写的官网原文，没有人工核实，和官网页面同等对待
const CURATED_WEIGHT = 1.3;
const SITE_DOC = /^官网(附件)?\//;

const COLUMNS = "rowid, id, doc_path, doc_title, heading, content, category, kind, source_url, updated";

function toChunk(row: ChunkRow): IndexedChunk {
  return {
    rowid: row.rowid,
    id: row.id,
    docPath: row.doc_path,
    docTitle: row.doc_title,
    heading: row.heading,
    content: row.content,
    category: row.category,
    kind: row.kind,
    sourceUrl: row.source_url,
    updated: row.updated,
  };
}

// 越旧的通知、新闻权重越低；没有日期的资料（如学校概况）不降权
function recencyWeight(chunk: IndexedChunk, now: number): number {
  const time = chunk.updated ? Date.parse(chunk.updated.length === 7 ? `${chunk.updated}-01` : chunk.updated) : NaN;
  if (Number.isNaN(time)) return 1;
  const years = Math.max(0, (now - time) / (365 * 86_400_000));
  const perYear = chunk.kind === "新闻" || chunk.kind === "通知" ? 0.08 : 0.04;
  return Math.max(chunk.kind === "新闻" ? 0.5 : 0.7, 1 - perYear * years);
}

function documentWeight(chunk: IndexedChunk, now: number): number {
  return (
    (KIND_WEIGHT[chunk.kind ?? "资料"] ?? 1) *
    (CATEGORY_WEIGHT[chunk.category ?? ""] ?? 1) *
    (SITE_DOC.test(chunk.docPath) ? 1 : CURATED_WEIGHT) *
    recencyWeight(chunk, now)
  );
}

// 送给重排模型的文本。正文是图片或附件的资料（如校历）只给标题：
// 带上"没有可提取的文字"这句说明，重排模型会认为它答不了问题，而这类官方原文恰恰是学生最该打开的
function rerankText(chunk: IndexedChunk): string {
  if (chunk.content === ATTACHMENT_ONLY_NOTE) return chunk.docTitle;
  return `${chunk.docTitle}${chunk.heading ? ` › ${chunk.heading}` : ""}\n${chunk.content}`.slice(0, 1500);
}

// 全文索引里存的词：标题 + 小标题 + 正文切出的二元组
export function indexTerms(chunk: { docTitle: string; heading: string; content: string }): string {
  return tokenize(`${chunk.docTitle} ${chunk.heading} ${chunk.content}`).join(" ");
}

// ---------- 语义向量（配置了 EMBEDDING_MODEL 才启用）----------
// 所有向量归一化后放进一整块连续内存，算相似度只需点积（1 万段 × 4096 维约 170MB）
type VectorIndex = { model: string; dim: number; rowids: Int32Array; matrix: Float32Array };
let vectorIndex: VectorIndex | null = null;
let totalChunks: number | null = null;

export function invalidateSearchIndex() {
  vectorIndex = null;
  totalChunks = null;
}

// 服务启动时预先把向量读进内存，免得第一个提问多等几百毫秒
export function warmSearchIndex() {
  chunkCount();
  if (hasEmbedding && env.embedding.model) loadVectors(env.embedding.model);
}

function loadVectors(model: string): VectorIndex | null {
  if (vectorIndex?.model === model) return vectorIndex;
  const db = getDb();
  const first = db
    .prepare("SELECT embedding FROM kb_chunks WHERE embedding IS NOT NULL AND embedding_model = ? LIMIT 1")
    .get(model) as { embedding: Uint8Array } | undefined;
  if (!first) return null;
  const dim = first.embedding.byteLength / 4;
  const count = (db
    .prepare("SELECT COUNT(*) AS n FROM kb_chunks WHERE embedding IS NOT NULL AND embedding_model = ? AND length(embedding) = ?")
    .get(model, dim * 4) as { n: number }).n;

  const matrix = new Float32Array(count * dim);
  const rowids = new Int32Array(count);
  let i = 0;
  const rows = db
    .prepare("SELECT rowid, embedding FROM kb_chunks WHERE embedding IS NOT NULL AND embedding_model = ? AND length(embedding) = ?")
    .iterate(model, dim * 4) as Iterable<{ rowid: number; embedding: Uint8Array }>;
  for (const row of rows) {
    if (i >= count) break;
    const bytes = row.embedding;
    const vector = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    let norm = 0;
    for (let k = 0; k < dim; k++) norm += vector[k] * vector[k];
    norm = Math.sqrt(norm) || 1;
    const offset = i * dim;
    for (let k = 0; k < dim; k++) matrix[offset + k] = vector[k] / norm;
    rowids[i] = row.rowid;
    i += 1;
  }
  vectorIndex = { model, dim, rowids: rowids.subarray(0, i), matrix: matrix.subarray(0, i * dim) };
  return vectorIndex;
}

// 返回和问题最相似的若干段（rowid → 余弦相似度，按相似度从高到低）
async function semanticSearch(query: string): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  const model = hasEmbedding ? getEmbeddingModel() : null;
  const modelId = env.embedding.model;
  if (!model || !modelId) return result;
  const index = loadVectors(modelId);
  if (!index || !index.rowids.length) return result;
  try {
    const queryVector = await embedQuery(model, query);
    if (queryVector.length !== index.dim) return result;
    let norm = 0;
    for (const value of queryVector) norm += value * value;
    norm = Math.sqrt(norm) || 1;
    const q = Float32Array.from(queryVector, (value) => value / norm);

    const scores = new Float32Array(index.rowids.length);
    for (let i = 0; i < index.rowids.length; i++) {
      const offset = i * index.dim;
      let dot = 0;
      for (let k = 0; k < index.dim; k++) dot += index.matrix[offset + k] * q[k];
      scores[i] = dot;
    }
    const order = Array.from(scores.keys()).sort((a, b) => scores[b] - scores[a]).slice(0, SEMANTIC_CANDIDATES);
    for (const i of order) result.set(index.rowids[i], scores[i]);
  } catch (error) {
    console.error("[kb] 语义检索失败，本次只用关键词检索：", error instanceof Error ? error.message : error);
  }
  return result;
}

// ---------- 重排 ----------
// 按粗排顺序挑候选，同一篇资料最多 RERANK_PER_DOC 段（used 记录各篇已经挑了几段，两批共用）
function pickForRerank(items: Candidate[], count: number, used: Map<string, number>): Candidate[] {
  const picked: Candidate[] = [];
  for (const item of items) {
    if (picked.length >= count) break;
    const n = used.get(item.chunk.docPath) ?? 0;
    if (n >= RERANK_PER_DOC) continue;
    used.set(item.chunk.docPath, n + 1);
    picked.push(item);
  }
  return picked;
}

async function rerankCandidates(query: string, items: Candidate[]): Promise<Candidate[]> {
  if (!items.length) return [];
  const results = await rerank(query, items.map(({ chunk }) => rerankText(chunk)));
  if (!results?.length) throw new Error("重排接口没有返回结果");
  const relevance = new Map(results.map((item) => [item.index, item.score]));
  return items.map((item, index) => ({ ...item, relevance: relevance.get(index) ?? 0 }));
}

const byScore = (a: Candidate, b: Candidate) => b.score - a.score;
// 最终分 = 相关度 × 资料权重的平方根：同样相关时，优先近期的、面向学生的资料，多年前的新闻只在没有更好资料时才用上
const finalScore = (item: Candidate) => (item.relevance ?? 0) * Math.sqrt(item.weight);

// ---------- 检索主流程 ----------
function chunkCount(): number {
  totalChunks ??= (getDb().prepare("SELECT COUNT(*) AS n FROM kb_chunks").get() as { n: number }).n;
  return totalChunks;
}

export function knowledgeChunkCount(): number {
  return chunkCount();
}

export async function searchKnowledge(query: string, limit = 5): Promise<SearchResult> {
  const empty: SearchResult = { hits: [], topSimilarity: null, topCoverage: 0, lowConfidence: true };
  const total = chunkCount();
  const plan = planQuery(query);
  const queryTerms = plan.terms.slice(0, 48);
  const lookupTerms = [...new Set([...queryTerms, ...plan.expansions])].slice(0, 64);
  if (!total || (!queryTerms.length && !hasEmbedding)) return empty;

  const db = getDb();

  // 每个词的权重（IDF）：越少见的词越重要
  const docFreq = new Map(
    lookupTerms.length
      ? (db
          .prepare(`SELECT term, doc FROM kb_vocab WHERE term IN (${lookupTerms.map(() => "?").join(",")})`)
          .all(...lookupTerms) as { term: string; doc: number }[]).map((row) => [row.term, row.doc])
      : [],
  );
  const idf = new Map(
    lookupTerms.map((term) => {
      const df = docFreq.get(term) ?? 0;
      // 资料库里从没出现过的词（多是"学要"这类跨词组合）任何资料都对不上，不计入覆盖率
      return [term, df > 0 ? Math.log(1 + (total - df + 0.5) / (df + 0.5)) : 0];
    }),
  );

  // 1. 召回：问题的向量（要调接口）先发出去，同时查关键词（问题里的词 + 同义词）
  const knownTerms = lookupTerms.filter((term) => docFreq.has(term));
  const semanticPromise = semanticSearch(query);
  const keywordRows = knownTerms.length
    ? (db
        .prepare(
          `SELECT c.rowid AS rowid, c.id, c.doc_path, c.doc_title, c.heading, c.content, c.category, c.kind, c.source_url, c.updated
           FROM kb_fts JOIN kb_chunks c ON c.rowid = kb_fts.rowid
           WHERE kb_fts MATCH ? ORDER BY bm25(kb_fts) LIMIT ${KEYWORD_CANDIDATES}`,
        )
        .all(knownTerms.map((term) => `"${term}"`).join(" OR ")) as ChunkRow[])
    : [];
  const rowsById = new Map(keywordRows.map((row) => [row.rowid, row]));
  const keywordRank = new Map(keywordRows.map((row, index) => [row.rowid, index]));

  // 语义检索找到、关键词没找到的段，从数据库补读
  const rowsFor = (rowids: number[]): ChunkRow[] => {
    const missing = rowids.filter((rowid) => !rowsById.has(rowid));
    if (missing.length) {
      const rows = db
        .prepare(`SELECT ${COLUMNS} FROM kb_chunks WHERE rowid IN (${missing.map(() => "?").join(",")})`)
        .all(...missing) as ChunkRow[];
      for (const row of rows) rowsById.set(row.rowid, row);
    }
    return rowids.flatMap((rowid) => rowsById.get(rowid) ?? []);
  };

  // 2. 粗排：关键词排名 + 语义排名（RRF 融合），乘覆盖度、标题命中和资料权重
  const now = Date.now();
  const toCandidate = (row: ChunkRow, semantic: Map<number, number>, semanticRank: Map<number, number>): Candidate => {
    const chunk = toChunk(row);
    const coverage = coverageOf(plan, new Set(tokenize(`${chunk.docTitle} ${chunk.heading} ${chunk.content}`)), idf);
    // 问题里的词出现在标题里，说明这篇资料就是讲这件事的（如问"校历"，标题就是《2025-2026校历》）
    const titleCoverage = coverageOf(plan, new Set(tokenize(`${chunk.docTitle} ${chunk.heading}`)), idf);
    const kr = keywordRank.get(row.rowid);
    const sr = semanticRank.get(row.rowid);
    const fused = (kr === undefined ? 0 : 1 / (20 + kr)) + (sr === undefined ? 0 : 1 / (20 + sr));
    const weight = documentWeight(chunk, now);
    return {
      chunk,
      coverage,
      weight,
      similarity: semantic.get(row.rowid) ?? null,
      score: fused * weight * (0.4 + coverage) * (1 + 0.6 * titleCoverage),
      relevance: null,
    };
  };
  const rankOf = (semantic: Map<number, number>) => new Map([...semantic.keys()].map((rowid, index) => [rowid, index]));
  const coarseRanking = (semantic: Map<number, number>): Candidate[] => {
    const semanticRank = rankOf(semantic);
    const rowids = [...new Set([...keywordRows.map((row) => row.rowid), ...semantic.keys()])];
    return rowsFor(rowids).map((row) => toCandidate(row, semantic, semanticRank)).sort(byScore);
  };

  // 3. 精排
  let ranked: Candidate[];
  let semantic = new Map<number, number>();
  if (!hasRerank) {
    semantic = await semanticPromise;
    ranked = coarseRanking(semantic);
  } else {
    // 3a. 关键词候选先送去重排
    const used = new Map<string, number>();
    const firstPool = pickForRerank(
      keywordRows.map((row) => toCandidate(row, semantic, new Map())).sort(byScore),
      RERANK_CANDIDATES,
      used,
    );
    const firstRerank = rerankCandidates(query, firstPool);
    const firstSettled = firstRerank.then(
      () => true,
      () => false,
    );

    // 3b. 等问题的向量：最多等到第一批重排完成后 0.5 秒
    semantic = await Promise.race([
      semanticPromise,
      firstSettled.then(() => sleep(SEMANTIC_GRACE_MS)).then(() => new Map<number, number>()),
    ]);

    // 3c. 语义检索新找到的候选，补一次重排
    const inFirst = new Set(firstPool.map((item) => item.chunk.rowid));
    const semanticRank = rankOf(semantic);
    const extras = pickForRerank(
      rowsFor([...semantic.keys()].filter((rowid) => !inFirst.has(rowid)))
        .map((row) => toCandidate(row, semantic, semanticRank))
        .sort(byScore),
      RERANK_EXTRAS,
      used,
    );
    const [first, second] = await Promise.allSettled([firstRerank, rerankCandidates(query, extras)]);

    if (first.status === "fulfilled") {
      if (second.status === "rejected") console.error("[kb] 第二批重排失败：", second.reason instanceof Error ? second.reason.message : second.reason);
      ranked = [...first.value, ...(second.status === "fulfilled" ? second.value : [])]
        .map((item) => ({ ...item, similarity: semantic.get(item.chunk.rowid) ?? item.similarity }))
        .sort((a, b) => finalScore(b) - finalScore(a));
    } else {
      console.error("[kb] 重排失败，本次使用粗排结果：", first.reason instanceof Error ? first.reason.message : first.reason);
      semantic = await semanticPromise;
      ranked = coarseRanking(semantic);
    }
  }
  const reranked = ranked.some((item) => item.relevance !== null);

  // 4. 取结果：同一篇文章最多 2 段；明显不相关的不要（避免把无关资料当出处）
  const similarityFloor = env.kbMinSimilarity - 0.1;
  const perDoc = new Map<string, number>();
  const hits: SearchHit[] = [];
  for (const item of ranked) {
    if (reranked ? (item.relevance ?? 0) < 0.05 : item.coverage < 0.2 && (item.similarity ?? 0) < similarityFloor) continue;
    const used = perDoc.get(item.chunk.docPath) ?? 0;
    if (used >= MAX_HITS_PER_DOC) continue;
    perDoc.set(item.chunk.docPath, used + 1);
    hits.push({ chunk: item.chunk, coverage: item.coverage, similarity: item.similarity, relevance: item.relevance });
    if (hits.length >= limit) break;
  }

  // 5. 可信度：有重排时看最高相关度；没有时看关键词覆盖度和语义相似度
  const unionTerms = new Set<string>();
  for (const hit of hits.slice(0, 2)) {
    for (const term of tokenize(`${hit.chunk.docTitle} ${hit.chunk.heading} ${hit.chunk.content}`)) unionTerms.add(term);
  }
  const unionCoverage = coverageOf(plan, unionTerms, idf);
  const best = hits.reduce((max, hit) => Math.max(max, hit.coverage), 0);
  const topCoverage = Math.max(best, unionCoverage);

  if (reranked) {
    const topRelevance = hits.reduce((max, hit) => Math.max(max, hit.relevance ?? 0), 0);
    return { hits, topSimilarity: topRelevance, topCoverage, lowConfidence: topRelevance < env.rerankMinScore };
  }

  const threshold = confidenceThreshold(plan, idf);
  const similarities = [...semantic.values()];
  const topSimilarity = similarities.length ? Math.max(...similarities) : null;
  const confident =
    (topSimilarity ?? 0) >= env.kbMinSimilarity ||
    best >= threshold ||
    (unionCoverage >= threshold + 0.15 && (hits[1]?.coverage ?? 0) >= 0.3);
  return { hits, topSimilarity, topCoverage, lowConfidence: hits.length === 0 || !confident };
}
