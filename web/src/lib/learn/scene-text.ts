import { stripMath } from "./math/rich";
import type { LessonScene, QuizQuestion } from "./schema";

// 页面内容 ↔ 纯文本：给「问狮老师」当上下文，以及朗读、导出笔记前的清理

const LETTERS = "ABCDE";

export const letterOf = (index: number) => LETTERS[index] ?? String(index + 1);

function questionText(question: QuizQuestion, index: number): string {
  const lines = [`${index + 1}. ${question.prompt}`];
  if (question.type === "short") {
    lines.push(`   参考答案：${question.reference}`);
    if (question.rubric.length) lines.push(`   得分点：${question.rubric.join("；")}`);
  } else {
    question.options.forEach((option, optionIndex) => lines.push(`   ${letterOf(optionIndex)}. ${option}`));
    lines.push(`   答案：${question.answers.map(letterOf).join("、")}`);
  }
  lines.push(`   解析：${question.explanation}`);
  return lines.join("\n");
}

// 把一页内容转成带标题的纯文本。页面还没生成好时只返回标题和目标
export function sceneToText(scene: LessonScene): string {
  const head = `【${labelOf(scene.kind)}】${scene.title}`;
  if (!scene.content) return `${head}\n学习目标：${scene.goal}`;
  switch (scene.kind) {
    case "slide": {
      const slide = scene.content;
      const lines = [head, slide.lead];
      slide.points.forEach((point) => lines.push(`- ${point.heading}：${point.body}`));
      if (slide.example) lines.push(`${slide.example.title}：${slide.example.body}`);
      if (slide.table) {
        lines.push(slide.table.columns.join(" | "));
        slide.table.rows.forEach((row) => lines.push(row.join(" | ")));
      }
      lines.push(`讲解：${slide.narration.map((segment) => segment.text).join("")}`);
      return lines.join("\n");
    }
    case "quiz":
      return [head, ...scene.content.questions.map(questionText)].join("\n");
    case "flashcards":
      return [head, ...scene.content.cards.map((card) => `- ${card.front}：${card.back}`)].join("\n");
    case "discussion":
      return [head, `讨论问题：${scene.content.question}`, scene.content.context].join("\n");
    case "summary": {
      const summary = scene.content;
      return [
        head,
        ...summary.recap.map((item) => `- ${item}`),
        ...summary.map.map((node) => `${node.label}${node.children.length ? `：${node.children.join("、")}` : ""}`),
      ].join("\n");
    }
  }
}

function labelOf(kind: LessonScene["kind"]): string {
  return { slide: "讲解", quiz: "测验", flashcards: "闪卡", discussion: "讨论", summary: "总结" }[kind];
}

// 出处编号 [n]。前面紧挨着字母、数字、下划线或右括号的是下标（a[0]、arr[1][2]），不是出处，不能当编号删掉；
// 只能配合 replace / matchAll / split 使用（带 g 标志）
export const CITATION = /(?<![A-Za-z0-9_)](?:\[\d{1,2}\])*)\[(\d{1,2})\]/g;

// 朗读前清理：公式换成纯文本，去掉 [n] 角标、emoji 和 Markdown 符号，箭头读成停顿
export function speakable(text: string): string {
  return stripMath(text)
    .replace(CITATION, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s*[→➜➡]\s*|\s*->\s*/g, "，")
    .replace(/[*#>`_~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
