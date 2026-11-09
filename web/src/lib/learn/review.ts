import { CITATION } from "./scene-text";
import type { Lesson } from "./schema";

// 间隔复习：简化版 SM-2（不引入新依赖，纯函数，方便测试；以后可以换成 ts-fsrs）。
// 闪卡加入复习计划后，每次复习按「忘了 / 模糊 / 记得 / 很熟」评分，算出下次出现的日期（按北京时间的日期）。

export type ReviewGrade = "again" | "hard" | "good" | "easy";

export type ReviewCard = {
  key: string; // `${lessonId}:${sceneId}:${序号}`
  lessonId: string;
  lessonTitle: string;
  front: string;
  back: string;
  ease: number; // 容易程度，初始 2.5，最低 1.3
  interval: number; // 距离下次复习的天数
  reps: number; // 连续记得的次数
  lapses: number; // 忘记的次数
  due: string; // 下次复习的日期，北京时间 YYYY-MM-DD
  updatedAt: number;
};

export const GRADES: { grade: ReviewGrade; label: string }[] = [
  { grade: "again", label: "忘了" },
  { grade: "hard", label: "模糊" },
  { grade: "good", label: "记得" },
  { grade: "easy", label: "很熟" },
];

const INITIAL_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_INTERVAL = 180;

// 中国不实行夏令时，北京时间 = UTC+8
export function beijingToday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function newReviewCard(input: Pick<ReviewCard, "key" | "lessonId" | "lessonTitle" | "front" | "back">, today: string, now = Date.now()): ReviewCard {
  return { ...input, ease: INITIAL_EASE, interval: 0, reps: 0, lapses: 0, due: today, updatedAt: now };
}

export function schedule(card: ReviewCard, grade: ReviewGrade, today: string, now = Date.now()): ReviewCard {
  let { ease, interval, reps, lapses } = card;
  if (grade === "again") {
    // 忘了：回到起点，今天之内再出现一次（排到队尾）
    reps = 0;
    lapses += 1;
    ease = Math.max(MIN_EASE, ease - 0.2);
    interval = 0;
  } else if (grade === "hard") {
    ease = Math.max(MIN_EASE, ease - 0.15);
    interval = Math.max(1, Math.round(interval * 1.2));
  } else {
    // 第一次记得隔 1 天，第二次隔 3 天，之后按容易程度逐次拉长
    const next = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(interval * ease);
    if (grade === "easy") {
      interval = Math.max(next + 1, Math.round(next * 1.3));
      ease += 0.15;
    } else {
      interval = next;
    }
    reps += 1;
  }
  interval = Math.min(MAX_INTERVAL, interval);
  return { ...card, ease, interval, reps, lapses, due: addDays(today, interval), updatedAt: now };
}

// 今天或更早到期的卡片：到期早的在前，同一天里先复习的排前面（刚答「忘了」的排到队尾）
export function dueCards(cards: ReviewCard[], today: string): ReviewCard[] {
  return cards.filter((card) => card.due <= today).sort((a, b) => (a.due === b.due ? a.updatedAt - b.updatedAt : a.due < b.due ? -1 : 1));
}

export function describeInterval(days: number): string {
  if (days <= 0) return "今天";
  if (days === 1) return "明天";
  if (days < 60) return `${days} 天后`;
  return `${Math.round(days / 30)} 个月后`;
}

export type ReviewInput = Pick<ReviewCard, "key" | "lessonId" | "lessonTitle" | "front" | "back">;

// 一节课里所有闪卡页的卡片；背面文字末尾的 [n] 出处角标去掉
export function lessonToReviewCards(lesson: Lesson): ReviewInput[] {
  return lesson.scenes.flatMap((scene) =>
    scene.kind === "flashcards" && scene.content
      ? scene.content.cards.map((card, index) => ({
          key: `${lesson.id}:${scene.id}:${index}`,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          front: card.front,
          back: card.back.replace(new RegExp(`\\s*${CITATION.source}`, "g"), "").trim(),
        }))
      : [],
  );
}
