import { answerKey, quizResults, scoreOf, type LessonProgress } from "./progress";
import { letterOf } from "./scene-text";
import type { Lesson, LessonScene } from "./schema";

// 把一节课导出成 Markdown 笔记（讲解要点、测验与答案、闪卡、总结、参考资料）。
// 有学习进度时，测验题下面会带上自己的作答和得分。

const GROUNDING_TEXT = { campus: "校园资料", general: "通用知识", material: "你提供的资料" } as const;

// 表格单元格里不能有竖线和换行
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");

function slideToMarkdown(scene: Extract<LessonScene, { kind: "slide" }>): string[] {
  const slide = scene.content;
  if (!slide) return [];
  const lines = [slide.lead, ""];
  for (const point of slide.points) lines.push(`- **${point.heading}**：${point.body}`);
  if (slide.table) {
    lines.push("", `| ${slide.table.columns.map(cell).join(" | ")} |`, `|${slide.table.columns.map(() => "---").join("|")}|`);
    for (const row of slide.table.rows) lines.push(`| ${row.map(cell).join(" | ")} |`);
  }
  if (slide.example) lines.push("", `> **${slide.example.title}**：${slide.example.body}`);
  // 图像导不出来，留一句图注（公式本身就是 $…$，Markdown 阅读器大多能排版）
  for (const figure of slide.figures ?? []) if (figure.caption) lines.push("", `> 图：${figure.caption}`);
  return lines;
}

function quizToMarkdown(scene: Extract<LessonScene, { kind: "quiz" }>, progress?: LessonProgress): string[] {
  const lines: string[] = [];
  scene.content?.questions.forEach((question, index) => {
    lines.push(`${index + 1}. ${question.prompt}`);
    const answer = progress?.answers[answerKey(scene.id, index)];
    if (question.type === "short") {
      lines.push(`   - 参考答案：${question.reference}`);
      if (question.rubric.length) lines.push(`   - 得分点：${question.rubric.join("；")}`);
      lines.push(`   - 解析：${question.explanation}`);
      if (answer?.text) lines.push(`   - 我的答案：${answer.text.replace(/\s*\n\s*/g, " ")}${answer.score !== undefined ? ` · 得分：${answer.score}` : ""}`);
    } else {
      question.options.forEach((option, optionIndex) => lines.push(`   - ${letterOf(optionIndex)}. ${option}`));
      lines.push(`   - 答案：${question.answers.map(letterOf).join("、")}　解析：${question.explanation}`);
      if (answer?.choice) lines.push(`   - 我的答案：${answer.choice.map(letterOf).join("、")} · ${answer.correct ? "答对了" : "答错了"}`);
    }
  });
  return lines;
}

export function lessonToMarkdown(lesson: Lesson, progress?: LessonProgress): string {
  const lines: string[] = [`# ${lesson.title}`, ""];
  if (lesson.summary) lines.push(`> ${lesson.summary}`, "");
  lines.push(`- 面向：${lesson.audience || "同学们"} · 难度：${lesson.level} · 时长：约 ${lesson.minutes} 分钟 · 依据：${GROUNDING_TEXT[lesson.grounding]}`);
  if (progress) {
    const score = scoreOf(lesson, progress);
    if (score !== null) lines.push(`- 我的测验得分：${score}（共 ${quizResults(lesson, progress).length} 题）`);
  }
  if (lesson.objectives.length) {
    lines.push("", "## 学习目标");
    lesson.objectives.forEach((objective, index) => lines.push(`${index + 1}. ${objective}`));
  }

  lesson.scenes.forEach((scene, index) => {
    lines.push("", `## ${index + 1}. ${scene.title}`);
    if (scene.status !== "ready" || !scene.content) {
      lines.push("（这一页没有生成成功）");
      return;
    }
    switch (scene.kind) {
      case "slide":
        lines.push(...slideToMarkdown(scene));
        break;
      case "quiz":
        lines.push(...quizToMarkdown(scene, progress));
        break;
      case "flashcards":
        lines.push("| 正面 | 背面 |", "|---|---|", ...scene.content.cards.map((card) => `| ${cell(card.front)} | ${cell(card.back)} |`));
        break;
      case "discussion":
        lines.push(`讨论问题：${scene.content.question}`, "", scene.content.context);
        break;
      case "summary":
        lines.push(...scene.content.recap.map((item) => `- ${item}`), "", "### 知识结构");
        for (const node of scene.content.map) {
          lines.push(`- ${node.label}`);
          for (const child of node.children) lines.push(`  - ${child}`);
        }
        if (scene.content.nextSteps.length) lines.push("", "### 下一步", ...scene.content.nextSteps.map((step) => `- ${step}`));
        break;
    }
  });

  if (lesson.sources.length) {
    lines.push("", "## 参考资料");
    for (const source of lesson.sources) {
      lines.push(`[${source.n}] 《${source.title}》${source.heading ? ` › ${source.heading}` : ""}${source.updated ? `（更新于 ${source.updated}）` : ""}${source.url ? ` ${source.url}` : ""}`);
    }
  }
  lines.push("", "---", "由城院小狮 · 小狮课堂生成，重要事项以学校官方通知为准。", "");
  return lines.join("\n");
}
