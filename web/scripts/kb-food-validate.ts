/** Exercise the real KB parser, SQLite ingestion and retrieval in an isolated DB. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

async function main() {
  const root = path.resolve(import.meta.dirname, "../..");
  const output = path.join(root, "outputs/food-knowledge-2026-10-26");
  const scratch = path.join(root, "data/social/knowledge_food/2026-10-26/validation-db");
  process.env.KNOWLEDGE_DIR = path.join(root, "web/knowledge/餐饮社媒");
  process.env.DATA_DIR = scratch;
  // Validation uses the keyword fallback without loading .env or sending model requests.
  for (const key of ["LLM_API_KEY", "LLM_MODEL", "EMBEDDING_API_KEY", "EMBEDDING_MODEL", "RERANK_API_KEY", "RERANK_MODEL"]) delete process.env[key];
  const { ingestKnowledge, listKnowledgeFiles } = await import("../src/lib/server/kb/ingest");
  const { searchKnowledge } = await import("../src/lib/server/kb/search");
  const { chunkMarkdown } = await import("../src/lib/server/kb/markdown");
  const { getDb } = await import("../src/lib/server/db");
  const readLines = (name: string): Record<string, unknown>[] =>
    fs.readFileSync(path.join(output, name), "utf8").trim().split("\n").map(line => JSON.parse(line));
  const entities = readLines("entities.jsonl");
  const photos = readLines("photos.jsonl");
  const memberships = readLines("source_memberships.jsonl");
  assert.equal(new Set(entities.map(e => e.entity_id)).size, entities.length);
  assert.equal(memberships.filter(e => e.batch === "first_xlsx").length, 62);
  assert.equal(memberships.filter(e => e.batch === "latest_docx").length, 166);
  assert.equal(new Set(memberships.filter(e => e.batch === "latest_docx").map(e => e.entity_id)).size, 165);
  assert.equal(readLines("first_batch_leads.jsonl").length, 98);
  assert.equal(entities.filter(e => e.kb_eligible).length, listKnowledgeFiles().length);
  const files = listKnowledgeFiles();
  const allChunks = files.flatMap(file => chunkMarkdown(file, fs.readFileSync(path.join(process.env.KNOWLEDGE_DIR!, file), "utf8")));
  assert.equal(new Set(allChunks.map(c => c.id)).size, allChunks.length);
  assert(!files.includes("food-a003.md"), "dish alias must use the identified 港卤壹号 entity");
  assert(!files.includes("food-a061.md") && !files.includes("food-a062.md"), "foreign-campus conflicts must stay in staging");
  assert(!files.includes("food-d107.md"), "area status is not a merchant");
  assert(!files.includes("food-d094.md"), "exact duplicate must not be indexed twice");
  let checkedImages = 0;
  for (const p of photos) {
    const bytes = fs.readFileSync(path.join(output, String(p.asset_path)));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), p.sha256);
    if (p.eligible_for_kb) {
      assert.equal(p.association, "来源对应");
      assert(fs.existsSync(path.join(root, "web/public", String(p.public_url))));
      checkedImages++;
    } else {
      assert.equal(p.public_url, null);
    }
  }
  for (const chunk of allChunks) {
    assert(chunk.content.includes("当前营业状态待核"), "each independent chunk must preserve evidence boundaries");
    assert(!/联系电话|15159403557/.test(chunk.content), "unverified document contact details must not enter retrieval");
    for (const match of chunk.content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      assert(photos.some(p => p.eligible_for_kb && p.public_url === match[1]));
    }
  }
  assert(!allChunks.filter(c => c.docPath === "food-a014.md").some(c => c.content.includes("99af481459e254f3")), "floor-ambiguous photo must not identify the fourth-floor branch");
  const first = await ingestKnowledge();
  assert.equal(first.chunks, allChunks.length);
  assert.equal(first.embedded, 0);
  const second = await ingestKnowledge();
  assert.equal(second.added, 0);
  assert.equal(second.removed, 0);
  const cases = [
    { query: "荔香园咖喱屋评价", expected: "food-d095.md" },
    { query: "荔香园卫孔记三楼", expected: "food-d076.md" },
    { query: "荔四卫孔记", expected: "food-a014.md" },
    { query: "皮皮大众餐", expected: "food-d081.md" },
    { query: "大道粥倒闭", expected: "food-a006.md" },
    { query: "平姐家东北饺子馆", expected: "food-a051.md" },
  ];
  const results = [];
  for (const test of cases) {
    const result = await searchKnowledge(test.query, 8);
    const paths = result.hits.map(hit => hit.chunk.docPath);
    assert(paths.includes(test.expected), `${test.query}: ${paths.join(", ")}`);
    results.push({ ...test, returned: paths, lowConfidence: result.lowConfidence });
  }
  const ftsCount = (getDb().prepare("SELECT COUNT(*) AS n FROM kb_fts").get() as { n: number }).n;
  assert.equal(ftsCount, allChunks.length);
  getDb().close();
  // Delete only this script's closed scratch database files; leave the JSON evidence.
  for (const name of ["app.db", "app.db-wal", "app.db-shm"]) {
    const file = path.join(scratch, name);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  const report = { status: "passed", testedAt: new Date().toISOString(), scope: "isolated database using actual backend modules; no live database or model calls", files: files.length, chunks: allChunks.length, checkedImageAssociations: checkedImages, firstImport: first, repeatImport: second, retrievalCases: results };
  fs.writeFileSync(path.join(output, "backend_validation.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, files: report.files, chunks: report.chunks, checkedImages, retrievalCases: results.length }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
