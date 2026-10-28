import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 检索结果缓存：用临时数据库和两份资料（不配置模型，只走关键词检索），不碰正式数据
async function main() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "kb-cache-"));
  const knowledge = path.join(scratch, "knowledge");
  fs.mkdirSync(knowledge);
  fs.writeFileSync(path.join(knowledge, "图书馆.md"), "---\ntitle: 图书馆\ncategory: 校园设施\n---\n\n## 图书馆开放时间\n\n图书馆每天 8:00 至 22:00 开放。\n");
  fs.writeFileSync(path.join(knowledge, "饭堂.md"), "---\ntitle: 饭堂\ncategory: 校园餐饮\n---\n\n## 饭堂营业时间\n\n饭堂早餐 7:00 开始供应。\n");
  process.env.DATA_DIR = path.join(scratch, "data");
  process.env.KNOWLEDGE_DIR = knowledge;
  for (const name of ["EMBEDDING_MODEL", "RERANK_MODEL", "LLM_API_KEY"]) delete process.env[name];

  const { ingestKnowledge } = await import("../src/lib/server/kb/ingest");
  const { invalidateSearchIndex, searchKnowledge } = await import("../src/lib/server/kb/search");
  await ingestKnowledge();

  const first = searchKnowledge("图书馆几点开门");
  assert.equal(searchKnowledge("图书馆几点开门 "), first, "同时到达的相同问题共用一次检索");
  const result = await first;
  assert.equal(result.hits[0]?.chunk.docTitle, "图书馆");
  assert.equal(await searchKnowledge("图书馆几点开门"), result, "之后的相同问题直接用缓存");
  assert.notEqual(searchKnowledge("饭堂几点开门"), first, "不同问题分开检索");
  assert.notEqual(searchKnowledge("图书馆几点开门", 3), first, "条数不同分开缓存");

  invalidateSearchIndex();
  const again = await searchKnowledge("图书馆几点开门");
  assert.notEqual(again, result, "重新导入资料后缓存失效");
  assert.deepEqual(again.hits.map((hit) => hit.chunk.id), result.hits.map((hit) => hit.chunk.id));

  try {
    fs.rmSync(scratch, { recursive: true, force: true });
  } catch {
    // Windows 上数据库文件仍被占用时留给系统清理临时目录
  }
  console.log("PASS: search cache shares concurrent identical queries, reuses results, keys by limit, clears on re-ingest");
}
void main();
