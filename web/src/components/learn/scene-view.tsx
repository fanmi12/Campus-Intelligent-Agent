"use client";

import type { Lesson, LessonScene } from "@/lib/learn/schema";
import { DiscussionScene } from "./scenes/discussion-scene";
import { FlashcardsScene } from "./scenes/flashcards-scene";
import { QuizScene } from "./scenes/quiz-scene";
import { SlideScene } from "./scenes/slide-scene";
import { SummaryScene } from "./scenes/summary-scene";

// 一页的实际内容（页面已生成好才会渲染）：手机上的单列课堂页，放映模式里的测验、闪卡、讨论也用它
export function SceneView({ scene, lesson, hasNext, onNext }: { scene: LessonScene; lesson: Lesson; hasNext: boolean; onNext: () => void }) {
  switch (scene.kind) {
    case "slide":
      return <SlideScene scene={scene} lesson={lesson} hasNext={hasNext} onNext={onNext} />;
    case "quiz":
      return <QuizScene scene={scene} lesson={lesson} hasNext={hasNext} onNext={onNext} />;
    case "flashcards":
      return <FlashcardsScene scene={scene} lesson={lesson} />;
    case "discussion":
      return <DiscussionScene scene={scene} lesson={lesson} />;
    case "summary":
      return <SummaryScene scene={scene} lesson={lesson} />;
  }
}
