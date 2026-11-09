import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sceneToText } from "../src/lib/learn/scene-text";
import type { Lesson, Level, Minutes } from "../src/lib/learn/schema";
import { ensureKnowledgeIndexed } from "../src/lib/server/kb/ingest";
import { runLessonGeneration } from "../src/lib/server/learn/generate";
import { createLessonRecord, deleteLesson, getLesson } from "../src/lib/server/learn/store";

// 生成「精选课程」：对给定主题生成一节课，写成静态 JSON（src/lib/learn/featured/<slug>.json），
// 同时输出一份核对清单（每页内容），供人工逐页检查。
// - 学科课（grounding: general）：线性代数、高等数学这类真实的课程。没有可对照的校内资料，要逐页检查概念、公式和例题的计算；
// - 校园课（grounding: campus）：用校园知识库生成，清单里附上引用的资料原文和 knowledge/ 里的整理资料，用来核对校内事实。
// 会调用大模型（每节几分钱）；校园课还要读取本机知识库，需要先导入过知识库。
//
// 用法（在 web/ 目录下）：
//   node_modules\.bin\tsx.cmd --env-file=.env.local scripts\learn-featured.ts            生成全部
//   node_modules\.bin\tsx.cmd --env-file=.env.local scripts\learn-featured.ts <slug>     只生成一节
//   加 --report <目录> 指定核对清单的输出目录（默认是系统临时目录）
// 生成后：核对 → 把 JSON 登记到 src/lib/learn/featured/index.ts → 再提交。

type Topic = {
  slug: string;
  topic: string;
  grounding: "general" | "campus";
  level?: Level;
  minutes?: Minutes;
  // 校园课：对照的 knowledge/ 文件
  docs?: readonly string[];
};

const TOPICS: readonly Topic[] = [
  { slug: "linear-algebra-matrix", topic: "线性代数：矩阵乘法怎么算，为什么 AB 不一定等于 BA", grounding: "general" },
  { slug: "linear-algebra-gauss", topic: "线性代数：用高斯消元法解线性方程组", grounding: "general" },
  { slug: "calculus-derivative", topic: "高等数学：导数的直观理解和常用求导法则", grounding: "general" },
  { slug: "probability-bayes", topic: "概率论：条件概率与贝叶斯公式", grounding: "general" },
  { slug: "data-structure-stack-queue", topic: "数据结构：栈和队列", grounding: "general" },
  { slug: "economics-supply-demand", topic: "经济学原理：供给、需求与均衡价格", grounding: "general" },
];

const OWNER = { client: "featured-script", ip: "local" };
const FEATURED_DIR = path.resolve("src/lib/learn/featured");

async function generate(item: Topic): Promise<Lesson> {
  const record = createLessonRecord({ topic: item.topic, level: item.level ?? "入门", minutes: item.minutes ?? 10, grounding: item.grounding, clientId: OWNER.client });
  try {
    await runLessonGeneration(record.id, { owner: OWNER });
    let lesson = getLesson(record.id)!;
    // 有页面没生成好就补做一次
    if (lesson.scenes.some((scene) => scene.status !== "ready")) {
      await runLessonGeneration(record.id, { owner: OWNER, resume: true });
      lesson = getLesson(record.id)!;
    }
    return lesson;
  } finally {
    deleteLesson(record.id);
  }
}

function review(item: Topic, lesson: Lesson): string {
  const lines = [`# 精选课程核对：${lesson.title}（f-${item.slug}）`, "", `主题：${lesson.topic} · ${lesson.scenes.length} 页 · 依据 ${lesson.grounding} · ${lesson.sources.length} 条资料`, ""];
  lines.push(
    item.grounding === "general" ? "学科课没有可对照的校内资料：逐页检查概念是否准确、公式和例题的计算是否正确（能用程序重算的都重算一遍）。" : "校内事实（地点、时间、数字、流程、规定）都要能在下面的资料里找到。",
    "",
    "## 课程内容",
    "",
  );
  lesson.scenes.forEach((scene, index) => lines.push(`### 第 ${index + 1} 页`, "```", sceneToText(scene), "```", ""));
  if (lesson.sources.length) {
    lines.push("## 引用的资料", "");
    for (const source of lesson.sources) {
      lines.push(`[${source.n}] 《${source.title}》${source.heading ? ` › ${source.heading}` : ""}${source.updated ? `（更新于 ${source.updated}）` : ""} ${source.url ?? ""}`, "", source.snippet, "");
    }
  }
  if (item.docs?.length) {
    lines.push("## 对照的整理资料（knowledge/）", "");
    for (const doc of item.docs) {
      const file = path.resolve("knowledge", doc);
      lines.push(`### ${doc}`, "", fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "（找不到这份资料）", "");
    }
  }
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const reportIndex = args.indexOf("--report");
  const reportDir = path.resolve(reportIndex >= 0 ? (args[reportIndex + 1] ?? "") : os.tmpdir());
  const only = args.filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--report");
  const todo = TOPICS.filter((item) => !only.length || only.includes(item.slug));
  if (!todo.length) {
    console.error(`没有匹配的主题。可选：${TOPICS.map((item) => item.slug).join("、")}`);
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(reportDir, { recursive: true });
  if (todo.some((item) => item.grounding === "campus")) await ensureKnowledgeIndexed();

  for (const item of todo) {
    const started = Date.now();
    const lesson = await generate(item);
    const problems: string[] = [];
    if (lesson.status !== "ready" || lesson.scenes.some((scene) => scene.status !== "ready")) problems.push("有页面没生成好");
    if (lesson.grounding !== item.grounding) problems.push(`依据是 ${lesson.grounding}，不是预期的 ${item.grounding}`);
    if (item.grounding === "campus" && !lesson.sources.length) problems.push("没有用到校园资料");
    if (problems.length) {
      console.error(`✗ ${item.slug}：${problems.join("；")}（${lesson.error ?? ""}）`);
      process.exitCode = 1;
      continue;
    }
    // 去掉只在备课过程中有意义的字段
    const { generatedMs: _generatedMs, error: _error, requestedGrounding: _requested, ...rest } = lesson;
    void _generatedMs;
    void _error;
    void _requested;
    const now = Date.now();
    const featured: Lesson = { ...rest, id: `f-${item.slug}`, featured: true, status: "ready", step: "done", createdAt: now, updatedAt: now };
    fs.writeFileSync(path.join(FEATURED_DIR, `${item.slug}.json`), `${JSON.stringify(featured, null, 2)}\n`);
    const reportFile = path.join(reportDir, `featured-review-${item.slug}.md`);
    fs.writeFileSync(reportFile, review(item, featured));
    console.log(`✓ ${item.slug}：《${featured.title}》${featured.scenes.length} 页，${((Date.now() - started) / 1000).toFixed(0)} 秒 → ${reportFile}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
