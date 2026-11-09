"use client";

import { scoreOf } from "@/lib/learn/progress";
import type { Lesson } from "@/lib/learn/schema";
import { sendLearnEvent } from "./learn-events";
import { updateProgress, upsertLocalLesson, useProgress } from "./learn-storage";

// 「完成课程」：记下完成时间和测验得分（手机上的总结页和放映模式的总结页共用）
export function useFinishLesson(lesson: Lesson, sceneId: string) {
  const progress = useProgress(lesson.id);
  function finish() {
    const score = scoreOf(lesson, progress);
    const now = Date.now();
    updateProgress(lesson.id, (current) => ({
      ...current,
      finishedAt: now,
      score: score ?? undefined,
      completed: current.completed.includes(sceneId) ? current.completed : [...current.completed, sceneId],
    }));
    upsertLocalLesson({ id: lesson.id, completedAt: now, score: score ?? undefined });
    sendLearnEvent({ lessonId: lesson.id, type: "finish", value: score ?? undefined });
  }
  return { finished: progress.finishedAt !== undefined, finish };
}
