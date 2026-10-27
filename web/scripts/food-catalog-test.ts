import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { campusFoods } from "../src/lib/campus-food";
import { tools } from "../src/lib/ai/tools";
import { safeValidateUIMessages } from "ai";
import type { AppUIMessage } from "../src/lib/ai/types";

async function main() {
  const photos = fs.readFileSync("../outputs/food-knowledge-2026-10-26/photos.jsonl", "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.equal(campusFoods.length, 50);
  assert.equal(new Set(campusFoods.map(f => f.id)).size, 50);
  for (const food of campusFoods) {
    const match = photos.find(p => p.entity_id === food.id && p.eligible_for_kb && p.public_url === food.image);
    assert.ok(match, `${food.id}: image must be approved for this exact entity`);
    assert.equal(createHash("sha256").update(fs.readFileSync(`public${food.image}`)).digest("hex"), match.sha256);
    assert.equal(food.imageSource, match.source_url);
    assert(food.operationNote?.includes("待核"));
    assert(!food.image.includes("候选"));
    if (food.price === null) assert.match(food.priceNote, /未取得可靠/);
    if (food.reviewSummary) assert.ok(food.reviewSource?.startsWith("https://"));
  }
  // Unverified Word averages do not silently become menu prices.
  assert.equal(campusFoods.find(f => f.id === "food-d025")?.price, null);
  assert.equal(campusFoods.find(f => f.id === "food-d095")?.price, 14);
  assert.equal(campusFoods.find(f => f.id === "food-a019")?.price, 18);
  assert.equal(campusFoods.find(f => f.id === "food-a019")?.tag, "面食");
  // Saved messages from the original three-item card still validate.
  const legacy = { id: "roast", name: "荔一烧腊", dish: "烧鸭腿饭", location: "荔香园一楼", price: 13, image: "/previews/food/roast.webp", photoDate: "2026-04-28", priceNote: "原帖图片标价，2026-04-28", source: "https://www.xiaohongshu.com/explore/69f02004000000003601b8ae", tag: "米饭" };
  for (const foods of [[legacy], campusFoods]) {
    const result = await safeValidateUIMessages<AppUIMessage>({ tools, messages: [{ id: "food-contract", role: "assistant", parts: [{ type: "tool-recommendCampusFood", toolCallId: "food-contract", state: "output-available", input: { budget: 20 }, output: { foods, budget: 20, category: "全部", references: [] } }] }] });
    assert(result.success, result.success ? "" : String(result.error));
  }
  console.log(JSON.stringify({ status: "passed", items: campusFoods.length, historicalPrices: campusFoods.filter(f => f.price !== null).length, reviews: campusFoods.filter(f => f.reviewSummary).length, oldMessageCompatibility: true }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
