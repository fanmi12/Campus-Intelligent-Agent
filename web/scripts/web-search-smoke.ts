import assert from "node:assert/strict";
import { hasWebSearch } from "../src/lib/server/env";
import { readWebPage, searchWeb } from "../src/lib/server/web-search";

async function main() {
  assert.ok(hasWebSearch, "请先配置 DeepSeek Key 并开启联网搜索");
  const results = await searchWeb("东莞城市学院 site:dgcu.edu.cn", 3, "东莞城市学院的官方信息");
  assert.ok(results.length, "搜索未返回网页");
  const page = await readWebPage("https://api-docs.deepseek.com/zh-cn/guides/search/");
  assert.ok(page.content.replaceAll("\\", "").includes("/v1/tools/search"), "未读到官方网页正文");
  console.log(JSON.stringify({
    search: { ok: true, results: results.map(({ title, url }) => ({ title, url })) },
    fetch: { ok: true, title: page.title, characters: page.content.length },
  }, null, 2));
}
void main();
