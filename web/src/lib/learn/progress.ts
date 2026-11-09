import type { AgentId, Lesson, QuizQuestion } from "./schema";

// 学习进度：只保存在学习者自己的浏览器里（前后端共用的类型和计分规则）

export type CardMark = "know" | "fuzzy" | "forgot";

export type AnswerRecord = {
  choice?: number[]; // 选择题选了哪几项
  text?: string; // 简答题的作答
  correct?: boolean; // 选择题是否答对
  score?: number; // 简答题得分 0-100（AI 批改或自评）
  feedback?: string;
  hits?: string[];
  missing?: string[];
  graded?: "ai" | "self"; // 简答题的评分方式
};

export type DiscussionTurn = { id: string; agent: "user" | AgentId; text: string };

export type LessonProgress = {
  scene: number; // 当前在第几页（下标）
  completed: string[]; // 已学完的页（scene id）
  answers: Record<string, AnswerRecord>; // 键：`${sceneId}:${题号}`
  cards: Record<string, CardMark>; // 键：`${sceneId}:${卡片序号}`
  discussion: Record<string, DiscussionTurn[]>; // 键：scene id
  startedAt: number;
  activeMs: number; // 页面可见时累计的学习时长
  finishedAt?: number;
  score?: number; // 学完时的得分 0-100
};

export const answerKey = (sceneId: string, index: number) => `${sceneId}:${index}`;

export function emptyProgress(now = 0): LessonProgress {
  return { scene: 0, completed: [], answers: {}, cards: {}, discussion: {}, startedAt: now, activeMs: 0 };
}

// 选择题答对：选中的和正确答案完全一致
export function isChoiceCorrect(question: QuizQuestion, choice: number[]): boolean {
  const picked = [...new Set(choice)].sort((a, b) => a - b);
  const answers = [...question.answers].sort((a, b) => a - b);
  return picked.length === answers.length && picked.every((value, index) => value === answers[index]);
}

export type QuizResult = {
  sceneId: string;
  index: number;
  question: QuizQuestion;
  answer?: AnswerRecord;
  score: number; // 0-1
};

// 全部测验题的作答情况；没作答的按 0 分
export function quizResults(lesson: Lesson, progress: LessonProgress): QuizResult[] {
  const results: QuizResult[] = [];
  for (const scene of lesson.scenes) {
    if (scene.kind !== "quiz" || !scene.content) continue;
    scene.content.questions.forEach((question, index) => {
      const answer = progress.answers[answerKey(scene.id, index)];
      const score = !answer ? 0 : question.type === "short" ? Math.max(0, Math.min(100, answer.score ?? 0)) / 100 : answer.correct ? 1 : 0;
      results.push({ sceneId: scene.id, index, question, answer, score });
    });
  }
  return results;
}

// 得分 =（选择题答对数 + 简答得分/100 之和）/ 题目总数 × 100，取整；没有测验题时返回 null
export function scoreOf(lesson: Lesson, progress: LessonProgress): number | null {
  const results = quizResults(lesson, progress);
  if (!results.length) return null;
  return Math.round((results.reduce((sum, item) => sum + item.score, 0) / results.length) * 100);
}

// 薄弱点：答错或只答对一部分的题目所考查的知识点（去重，保持出现顺序）
export function weakPoints(lesson: Lesson, progress: LessonProgress): string[] {
  const points = quizResults(lesson, progress)
    .filter((item) => item.answer && item.score < 1)
    .map((item) => item.question.point);
  return [...new Set(points)];
}
