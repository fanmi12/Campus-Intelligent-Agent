import { Flag, Layers, ListChecks, MessagesSquare, Presentation, type LucideIcon } from "lucide-react";
import type { SceneKind } from "@/lib/learn/schema";

// 各类页面的名称和图标（页面导航、页面标题共用）
export const KIND_LABEL: Record<SceneKind, string> = {
  slide: "讲解",
  quiz: "测验",
  flashcards: "闪卡",
  discussion: "讨论",
  summary: "总结",
};

export const KIND_ICON: Record<SceneKind, LucideIcon> = {
  slide: Presentation,
  quiz: ListChecks,
  flashcards: Layers,
  discussion: MessagesSquare,
  summary: Flag,
};
