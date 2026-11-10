import assert from "node:assert/strict";
import fs from "node:fs";
import { safeValidateUIMessages } from "ai";
import { CORE_TOOL_NAMES, normalizeEvent, tools } from "../src/lib/ai/tools";
import { studyInputSchema } from "../src/lib/ai/result-schemas";
import { starterStudy } from "../src/lib/campus-study";
import { campusFoods } from "../src/lib/campus-food";
import { createChatTools } from "../src/lib/server/ai/web-tools";
import { buildInstructions } from "../src/lib/server/ai/prompt";
import { hasCardResult } from "../src/lib/ai/tool-flow";
import type { AppUIMessage, SourceItem } from "../src/lib/ai/types";
import { buildIcs } from "../src/lib/ics";

async function main() {
  const sources: SourceItem[] = [{ n: 1, id: "contact", title: "学校联系方式", snippet: "东莞城市学院招生电话0769-23382107，地址文昌路1号", url: "https://dgcu.edu.cn/about.html" }];
  const factory = (userEvidence: string) => createChatTools({ question: userEvidence, userEvidence, sources, signal: new AbortController().signal, onSources() {}, onProgress() {} });
  const service = factory("我11月10日有英语考试");
  const options = { toolCallId: "rich-test", messages: [], context: undefined };
  const menu = await service.recommendCampusFood.execute!({ budget: 20 }, options);
  assert.ok(menu && "foods" in menu);
  if (menu && "foods" in menu) {
    assert.deepEqual(menu.foods.map((food) => food.n), campusFoods.map((_, index) => index + 2));
    for (const food of menu.foods) assert.equal(sources.find((source) => source.n === food.n)?.url, food.source);
  }
  const contact = await service.showContactCard.execute!({ name: "招生咨询", phones: [{ label: "招生热线", number: "0769-23382107" }], basis: "sources", sourceNumbers: [1] }, options);
  assert.ok(contact && "references" in contact && contact.references[0].url === sources[0].url);
  await assert.rejects(async () => await service.showContactCard.execute!({ name: "招生咨询", phones: [{ label: "电话", number: "13800000000" }], basis: "sources", sourceNumbers: [1] }, options), /未找到/);
  await assert.rejects(async () => await service.buildChecklist.execute!({ title: "流程", steps: [{ title: "步骤", detail: "内容" }], basis: "sources", sourceNumbers: [99] }, options), /缺少/);
  const checklist = await service.buildChecklist.execute!({ title: "个人待办", steps: [{ title: "阅读通知", detail: "查看原文" }], basis: "user", sourceNumbers: [] }, options);
  assert.ok(checklist && "steps" in checklist && checklist.steps.length === 1);
  const examInput = { event: { title: "英语考试", start: "2026-11-10T09:00:00+08:00" }, checklist: ["准备学生证"], basis: "user" as const, sourceNumbers: [] };
  const exam = await service.buildExamMemo.execute!(examInput, options);
  assert.ok(exam && "event" in exam && exam.event.kind === "exam");
  await assert.rejects(async () => await factory("我想准备考试").buildExamMemo.execute!(examInput, options), /缺少明确/);
  await assert.rejects(async () => await service.buildExamMemo.execute!({ ...examInput, event: { ...examInput.event, start: "2026-02-31" } }, options), /日期/);
  assert.throws(() => normalizeEvent({ title: "错误日期", start: "2026-02-30" }, 0), /日期/);
  assert.ok(studyInputSchema.safeParse(starterStudy).success);
  assert.equal(studyInputSchema.safeParse({ title: "坏题目", words: [{ ...starterStudy.words[0], options: ["一样", "一样"] }] }).success, false);
  assert.equal(studyInputSchema.safeParse({ title: "坏答案", words: [{ ...starterStudy.words[0], answer: 3 }] }).success, false);
  assert.equal(CORE_TOOL_NAMES.some((name: string) => /timetable|schedule/i.test(name)), false);
  for (const food of campusFoods) {
    assert.ok(fs.statSync(`public${food.image}`).size > 0);
    if (food.price === null) assert.match(food.priceNote, /未取得可靠/);
    else assert.match(food.priceNote, /\d{4}-\d{2}-\d{2}/);
  }
  // 小狮课堂：聊天里的 createLesson 工具
  assert.ok((CORE_TOOL_NAMES as readonly string[]).includes("createLesson"));
  const lessonInput = tools.createLesson.inputSchema as unknown as { safeParse: (value: unknown) => { success: boolean } };
  assert.equal(lessonInput.safeParse({ topic: "学" }).success, false, "主题只有 1 个字");
  assert.equal(lessonInput.safeParse({ topic: "图书馆怎么借书", minutes: 30 }).success, false, "时长超出 5-15 分钟");
  assert.equal(lessonInput.safeParse({ topic: "图书馆怎么借书", level: "专家" }).success, false, "未知难度");
  assert.ok(lessonInput.safeParse({ topic: "图书馆怎么借书", minutes: 5, level: "进阶" }).success);
  await assert.rejects(async () => await service.createLesson.execute!({ topic: "图书馆怎么借书" }, options), /刷新页面/, "没有提问者标识时不能创建课程");
  // 测试环境没有大模型配置，创建课程走演示模式：直接返回示例课程，不写数据库
  const withOwner = createChatTools({ question: "x", userEvidence: "x", sources, signal: new AbortController().signal, onSources() {}, onProgress() {}, owner: { client: "rich-test-client", ip: "192.0.2.20" } });
  const lesson = await withOwner.createLesson.execute!({ topic: "图书馆怎么借书", minutes: 6 }, options);
  assert.ok(lesson && "id" in lesson && lesson.url === `/learn/${lesson.id}` && lesson.status === "ready");
  assert.ok(hasCardResult([{ toolResults: [{ toolName: "createLesson" }] }]), "课程卡片出现后，回答只写一两句收尾");
  assert.ok(buildInstructions({ sources: [], lowConfidence: true }).includes("createLesson"), "提示词里有创建课程的规则");
  assert.ok(!buildInstructions({ sources: [], lowConfidence: true, learn: false }).includes("createLesson"), "关闭小狮课堂后提示词不再提 createLesson");
  const outputs = [
    { type: "tool-showContactCard", toolCallId: "contact", state: "output-available", input: { name: "招生咨询", phones: [{ label: "招生热线", number: "0769-23382107" }], basis: "sources", sourceNumbers: [1] }, output: contact },
    { type: "tool-buildExamMemo", toolCallId: "exam", state: "output-available", input: examInput, output: exam },
    { type: "tool-buildStudyCards", toolCallId: "study", state: "output-available", input: starterStudy, output: starterStudy },
    { type: "tool-createLesson", toolCallId: "lesson", state: "output-available", input: { topic: "图书馆怎么借书" }, output: { id: "demo-pomodoro", topic: "图书馆怎么借书", url: "/learn/demo-pomodoro", status: "ready" } },
  ];
  const valid = await safeValidateUIMessages<AppUIMessage>({ messages: [{ id: "rich-result", role: "assistant", parts: outputs }], tools });
  assert.ok(valid.success, valid.success ? "" : String(valid.error));
  if (exam && "event" in exam) assert.ok(buildIcs([exam.event]).includes("DTSTART:20261110T010000Z"));
  console.log("Rich UI contracts passed: source/phone/date guards, quiz schema, calendar, saved-message validation, food assets, no timetable tool.");
}
void main();
