import assert from "node:assert/strict";
import { featuredLessons } from "../src/lib/learn/featured";
import { figuresSchema } from "../src/lib/learn/figure";
import { demoLesson, previewLesson } from "../src/lib/learn/fixtures";
import { splitMath } from "../src/lib/learn/math/rich";
import { checkTex } from "../src/lib/learn/math/tex";
import {
  createLessonRequestSchema,
  flashcardsContentSchema,
  LESSON_ID,
  outlineSchema,
  quizContentSchema,
  SCENE_TOOLS,
  slideContentSchema,
  summaryContentSchema,
  type LessonScene,
} from "../src/lib/learn/schema";
import { CITATION, sceneToText, speakable } from "../src/lib/learn/scene-text";

// 小狮课堂的数据结构：合法样例通过，每条逻辑约束都能拦住不合格的输出，演示课程的每一页都合格。

type Schema = { safeParse: (value: unknown) => { success: boolean; error?: { issues: { message: string }[] } } };

function accepts(schema: Schema, value: unknown, label: string) {
  const result = schema.safeParse(value);
  assert.ok(result.success, `${label} 应该通过：${result.error?.issues.map((issue) => issue.message).join("；")}`);
}

function rejects(schema: Schema, value: unknown, message: RegExp, label: string) {
  const result = schema.safeParse(value);
  assert.equal(result.success, false, `${label} 应该被拒绝`);
  const text = result.error?.issues.map((issue) => issue.message).join("；") ?? "";
  assert.match(text, message, `${label} 的错误信息应包含 ${message}`);
}

const scene = (kind: string) => ({ kind, title: "页面", goal: "目标", keyPoints: ["要点"] });
const outline = {
  title: "番茄工作法入门",
  summary: "用 25 分钟的专注块对抗拖延",
  audience: "大一新生",
  objectives: ["说出规则", "会安排番茄钟"],
  scenes: [scene("slide"), scene("slide"), scene("quiz"), scene("summary")],
};

// ---------- 大纲 ----------
accepts(outlineSchema, outline, "合法大纲");
accepts(outlineSchema, { ...outline, scenes: [...outline.scenes.slice(0, 3), scene("flashcards"), scene("summary")] }, "含闪卡的大纲");
accepts(outlineSchema, { ...outline, unsuitable: "这不是学习主题", scenes: [], objectives: [] }, "unsuitable 时 scenes 可为空");
rejects(outlineSchema, { ...outline, scenes: [scene("quiz"), scene("slide"), scene("slide"), scene("summary")] }, /第一页必须是讲解页/, "第一页不是 slide");
rejects(outlineSchema, { ...outline, scenes: [scene("slide"), scene("slide"), scene("quiz"), scene("slide")] }, /最后一页必须是总结页/, "最后一页不是 summary");
rejects(outlineSchema, { ...outline, scenes: [scene("slide"), scene("slide"), scene("flashcards"), scene("summary")] }, /至少要有一个测验页/, "没有 quiz");
rejects(outlineSchema, { ...outline, scenes: [scene("slide"), scene("quiz"), scene("summary")] }, /至少需要 4 页/, "不足 4 页");
rejects(outlineSchema, { ...outline, scenes: [scene("slide"), scene("summary"), scene("quiz"), scene("summary")] }, /总结页只能有一页/, "两个 summary");
rejects(outlineSchema, { ...outline, scenes: [scene("slide"), scene("discussion"), scene("discussion"), scene("quiz"), scene("summary")] }, /讨论页最多一页/, "两个 discussion");
rejects(outlineSchema, { ...outline, objectives: ["只有一条"] }, /至少写 2 条学习目标/, "学习目标不足");
rejects(outlineSchema, { ...outline, scenes: Array.from({ length: 11 }, () => scene("slide")) }, /./, "超过 10 页");

// ---------- 讲解页 ----------
const slide = {
  lead: "导语",
  layout: "points",
  points: [
    { heading: "要点一", body: "说明一" },
    { heading: "要点二", body: "说明二", sourceNumbers: [1] },
  ],
  narration: [
    { point: -1, text: "开场" },
    { point: 1, text: "讲第二个要点" },
  ],
};
accepts(slideContentSchema, slide, "合法讲解页");
assert.deepEqual(slideContentSchema.parse(slide).points[0].sourceNumbers, [], "sourceNumbers 缺省为空数组");
rejects(slideContentSchema, { ...slide, narration: [{ point: -1, text: "开场" }, { point: 2, text: "越界" }] }, /point 不能大于 1/, "narration.point 越界");
rejects(slideContentSchema, { ...slide, layout: "compare", table: { columns: ["甲", "乙"], rows: [["一", "二"], ["只有一格"]] } }, /每行单元格数必须等于列数/, "表格行列不齐");
accepts(slideContentSchema, { ...slide, layout: "compare", table: { columns: ["甲", "乙"], rows: [["一", "二"]] } }, "合法表格");
rejects(slideContentSchema, { ...slide, points: [slide.points[0]] }, /./, "只有 1 个要点");
rejects(slideContentSchema, { ...slide, layout: "grid" }, /./, "未知版式");

// ---------- 测验 ----------
const single = { type: "single", prompt: "题干", options: ["甲", "乙", "丙"], answers: [1], explanation: "解析", point: "知识点" };
const multiple = { type: "multiple", prompt: "多选题", options: ["甲", "乙", "丙", "丁"], answers: [0, 2], explanation: "解析", point: "知识点" };
const short = { type: "short", prompt: "简答题", reference: "参考答案", rubric: ["得分点一"], explanation: "解析", point: "知识点" };
accepts(quizContentSchema, { questions: [single, multiple, short] }, "单选 + 多选 + 简答");
rejects(quizContentSchema, { questions: [{ ...single, answers: [0, 1] }, multiple] }, /单选题只能有 1 个答案/, "单选两个答案");
rejects(quizContentSchema, { questions: [{ ...single, answers: [3] }, multiple] }, /答案下标无效或重复/, "答案越界");
rejects(quizContentSchema, { questions: [{ ...single, options: ["甲", "甲", "乙"] }, multiple] }, /选项不能重复/, "选项重复");
rejects(quizContentSchema, { questions: [{ ...single, options: ["甲", "乙"] }, multiple] }, /需要 3-4 个选项/, "单选选项太少");
rejects(quizContentSchema, { questions: [single, { ...multiple, answers: [0] }] }, /多选题需要 2-4 个答案/, "多选只有一个答案");
rejects(quizContentSchema, { questions: [single, { ...short, rubric: [] }] }, /简答题至少 1 个得分点/, "简答缺得分点");
rejects(quizContentSchema, { questions: [single, { ...short, reference: "" }] }, /简答题必须有参考答案/, "简答缺参考答案");
rejects(quizContentSchema, { questions: [single, short, { ...short, prompt: "另一道简答" }] }, /简答题最多 1 道/, "两道简答");
rejects(quizContentSchema, { questions: [multiple, short] }, /至少 1 道单选题/, "没有单选题");
rejects(quizContentSchema, { questions: [single] }, /./, "只有 1 题");
assert.deepEqual(quizContentSchema.parse({ questions: [single, short] }).questions[0].rubric, [], "选择题的 rubric 缺省为空");

// ---------- 闪卡、总结 ----------
const cards = Array.from({ length: 3 }, (_, index) => ({ front: `术语${index}`, back: "解释" }));
accepts(flashcardsContentSchema, { cards }, "合法闪卡");
rejects(flashcardsContentSchema, { cards: cards.slice(0, 2) }, /./, "闪卡少于 3 张");
const summary = {
  recap: ["结论一", "结论二", "结论三"],
  map: [{ label: "一级一", children: ["关键词"] }, { label: "一级二" }],
  nextSteps: ["下一步"],
  narration: [{ point: -1, text: "总述" }],
};
accepts(summaryContentSchema, summary, "合法总结");
rejects(summaryContentSchema, { ...summary, recap: ["结论一", "结论二"] }, /./, "结论少于 3 条");

// ---------- 创建请求 ----------
const defaults = createLessonRequestSchema.parse({ topic: "图书馆怎么借书" });
assert.deepEqual([defaults.level, defaults.minutes, defaults.grounding], ["入门", 10, "auto"]);
rejects(createLessonRequestSchema, { topic: "学" }, /请写下想学的主题/, "主题只有 1 个字");
rejects(createLessonRequestSchema, { topic: "图".repeat(201) }, /主题最多 200 字/, "主题过长");
rejects(createLessonRequestSchema, { topic: "图书馆", minutes: 7 }, /./, "不支持的时长");
rejects(createLessonRequestSchema, { topic: "图书馆", material: "字".repeat(12001) }, /资料最多 12000 字/, "资料过长");
rejects(createLessonRequestSchema, { topic: "图书馆", images: [{ mediaType: "image/gif", url: "data:image/gif;base64,AAAA" }] }, /./, "不支持的图片格式");

// ---------- 演示课程与预览课程：每一页都合格 ----------
function checkScenes(scenes: LessonScene[], label: string) {
  for (const item of scenes) {
    if (!item.content) continue;
    const spec = SCENE_TOOLS[item.kind];
    const parsed = spec.schema.safeParse(item.content);
    assert.ok(parsed.success, `${label} 的「${item.title}」不合格：${parsed.error?.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("；")}`);
  }
}
checkScenes(demoLesson.scenes, "演示课程");
checkScenes(previewLesson.scenes, "预览课程");
// 精选课程（静态 JSON）：每一页都合格，id 以 f- 开头，已标记为精选；依据是通用知识（学科课）或校园资料（校园课，必须带出处）
for (const lesson of featuredLessons) {
  checkScenes(lesson.scenes, `精选课程 ${lesson.id}`);
  assert.match(lesson.id, LESSON_ID);
  assert.ok(lesson.id.startsWith("f-") && lesson.featured === true && lesson.status === "ready", `${lesson.id} 的标记不对`);
  assert.ok(lesson.scenes.length >= 4 && lesson.scenes.every((scene) => scene.status === "ready" && scene.content), `${lesson.id} 有页面没生成好`);
  assert.ok(lesson.grounding === "general" || lesson.grounding === "campus", `${lesson.id} 的依据只能是通用知识（学科课）或校园资料（校园课）`);
  assert.ok(lesson.grounding === "campus" ? lesson.sources.length > 0 : lesson.sources.length === 0, `${lesson.id} 的资料条数和依据不一致：校园课要带出处，学科课没有资料`);
}
assert.equal(new Set(featuredLessons.map((lesson) => lesson.id)).size, featuredLessons.length, "精选课程 id 不能重复");
// 精选课程里的图像规格都合格、公式都能解析；讲解词是读出来的，不能有 $ 公式
function everyString(value: unknown, path: string, visit: (text: string, path: string) => void) {
  if (typeof value === "string") visit(value, path);
  else if (Array.isArray(value)) value.forEach((item, index) => everyString(item, `${path}.${index}`, visit));
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) everyString(item, `${path}.${key}`, visit);
}
for (const lesson of featuredLessons) {
  for (const item of lesson.scenes) {
    if (item.kind === "slide" && item.content?.figures) accepts(figuresSchema, item.content.figures, `精选课程 ${lesson.id}「${item.title}」的图像`);
    everyString(item.content, `${lesson.id}/${item.id}`, (text, path) => {
      if (path.includes(".narration.")) return assert.ok(!text.includes("$"), `${path} 讲解词里不能有 $ 公式`);
      if (path.includes(".figures.")) return;
      for (const part of splitMath(text)) if (part.type === "math") assert.equal(checkTex(part.tex), null, `${path} 的公式 ${part.tex} 解析失败`);
    });
  }
}
assert.ok(LESSON_ID.test(demoLesson.id), "演示课程 id 要符合课程 id 格式");
assert.deepEqual(demoLesson.scenes.map((item) => item.kind), ["slide", "slide", "quiz", "flashcards", "slide", "summary"]);
assert.ok(demoLesson.scenes.every((item) => item.status === "ready" && item.content), "演示课程的每一页都是 ready");
const demoOutline = outlineSchema.safeParse({
  title: demoLesson.title,
  summary: demoLesson.summary,
  audience: demoLesson.audience,
  objectives: demoLesson.objectives,
  scenes: demoLesson.scenes.map(({ kind, title, goal, keyPoints }) => ({ kind, title, goal, keyPoints })),
});
assert.ok(demoOutline.success, "演示课程的大纲结构也要符合大纲规则");
assert.ok(previewLesson.scenes.some((item) => item.status === "failed") && previewLesson.scenes.some((item) => item.status === "generating"));

// ---------- 文本工具 ----------
assert.equal(speakable("找书 → 办借 [1] 😀 **粗体**"), "找书，办借 粗体");
assert.equal(speakable("先 A -> 再 B"), "先 A，再 B");
// [n] 出处编号只在不跟在标识符后面时才删：a[0]、arr[1][2] 这类下标要保留，连着的 [1][3] 都要删
assert.equal(speakable("写 a[0]=2，再读 arr[1][2]。规定[1][3]"), "写 a[0]=2，再读 arr[1][2]。规定");
assert.equal(speakable("nums[1] 是第二个数 [2]"), "nums[1] 是第二个数");
// 闪卡和复习卡里剥出处编号用的同一个正则
assert.equal("栈 a[5] 越界 [2]".replace(new RegExp(`\\s*${CITATION.source}`, "g"), "").trim(), "栈 a[5] 越界");
assert.deepEqual([..."栈 a[5] 越界 [2][4]".matchAll(CITATION)].map((match) => Number(match[1])), [2, 4]);
const text = sceneToText(demoLesson.scenes[0]);
assert.ok(text.includes("番茄工作法是什么") && text.includes("讲解：") && text.includes("名字的来历"));
assert.ok(sceneToText(demoLesson.scenes[2]).includes("答案：B"), "测验文本包含答案字母");
assert.ok(sceneToText({ ...demoLesson.scenes[0], content: undefined } as LessonScene).includes("学习目标"), "未生成的页面只有标题和目标");

console.log("PASS: outline/slide/quiz/flashcards/summary/request schemas, every refine rule, demo + preview lesson pages, text helpers");
