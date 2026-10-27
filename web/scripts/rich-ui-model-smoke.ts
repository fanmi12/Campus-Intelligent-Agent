import assert from "node:assert/strict";
import fs from "node:fs";
import { z } from "zod";
import { isStepCount, streamText } from "ai";
import { CORE_TOOL_NAMES, type AppTools } from "../src/lib/ai/tools";
import { hasCardResult } from "../src/lib/ai/tool-flow";
import type { SourceItem } from "../src/lib/ai/types";
import { getChatModel } from "../src/lib/server/ai/models";
import { buildInstructions } from "../src/lib/server/ai/prompt";
import { createChatTools } from "../src/lib/server/ai/web-tools";

async function main() {
  const model = getChatModel();
  assert.ok(model, "需要配置真实对话模型");
  const school = fs.readFileSync("knowledge/学校概况.md", "utf8");
  const procedure = fs.readFileSync("knowledge/官网附件/09-教务处办事指南/复学申请审批流程.md", "utf8");
  const seeds = [{ n: 1, title: "学校概况", content: school, url: "https://dgcu.edu.cn/about.html" }, { n: 2, title: "复学申请审批流程", content: procedure, url: "http://tr.dgcu.edu.cn/front/article/2313.html" }];
  const cases = [
    ["预算20元，今天中午在学校吃什么？想看看菜单图片。", "recommendCampusFood"],
    ["复学申请有哪些步骤？整理成可以勾选的办事清单。", "buildChecklist"],
    ["学校招生咨询电话是多少？帮我生成一张可以保存的联系卡。", "showContactCard"],
    ["帮我复习校园英语单词deadline、application、enrollment，做成翻面卡和小测验。", "buildStudyCards"],
    ["我2026年11月15日上午9点到11点考英语，需要带学生证。生成考试倒计时备忘卡。", "buildExamMemo"],
    ["学校详细地址是什么？给我地图入口。", "showCampusMap"],
    ["帮我把通知加日历：2026年11月16日下午2点在图书馆报告厅开讲座，带学生证。", "addToCalendar"],
    ["看看我的个人课表。", null],
  ] as const;
  const report: { expected: string | null; tools: string[]; steps: number; durationMs: number; answer: string }[] = [];
  for (const [question, expected] of cases) {
    if (process.argv.includes("--food-only") && expected !== "recommendCampusFood") continue;
    const started = Date.now();
    const sources: SourceItem[] = seeds.map((seed) => ({ n: seed.n, id: `seed-${seed.n}`, title: seed.title, snippet: seed.content, url: seed.url }));
    const result: ReturnType<typeof streamText<AppTools>> = streamText<AppTools>({
      model, instructions: buildInstructions({ sources: seeds, lowConfidence: false }),
      messages: [{ role: "user", content: question }],
      tools: createChatTools({ question, sources, signal: AbortSignal.timeout(60000), onSources() {}, onProgress() {} }),
      activeTools: [...CORE_TOOL_NAMES], stopWhen: isStepCount(5), temperature: 0.1,
      prepareStep: ({ steps }) => hasCardResult(steps) ? { activeTools: [] } : undefined,
      abortSignal: AbortSignal.timeout(60000),
    });
    const steps = await result.steps;
    const names = steps.flatMap((step) => step.toolCalls.map((call) => call.toolName));
    const errors = steps.flatMap((step) => step.toolResults).filter((part) => "isError" in part && part.isError);
    if (expected) assert.ok(names.includes(expected), `${expected}未触发，实际${names.join(",")}：${await result.text}`);
    else assert.ok((await result.text).includes("未接入") || (await result.text).includes("没有"));
    assert.equal(errors.length, 0);
    if (expected === "recommendCampusFood") {
      const menu = steps.flatMap((step) => step.toolResults).find((part) => part.toolName === "recommendCampusFood");
      const parsed = z.object({ foods: z.array(z.object({ n: z.number().int().min(1) })) }).parse(menu?.output);
      const allowed = new Set(parsed.foods.map((food) => food.n));
      for (const match of (await result.text).matchAll(/\[(\d+)\]/g)) assert.ok(allowed.has(Number(match[1])), `错误的餐食引用${match[1]}`);
    }
    report.push({ expected, tools: names, steps: steps.length, durationMs: Date.now() - started, answer: await result.text });
    console.log(JSON.stringify(report.at(-1)));
  }
  fs.mkdirSync("../outputs/rich-ui", { recursive: true });
  fs.writeFileSync("../outputs/rich-ui/model-smoke.json", JSON.stringify(report, null, 2));
}
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
