"use client";

import { Loader2 } from "lucide-react";
import type { AppUIMessage } from "@/lib/ai/types";
import { ExamMemo } from "./exam-memo";
import { ProcedureChecklist } from "./result-preview/checklist";
import { ContactCard } from "./result-preview/contact-card";
import { FoodMenu } from "./result-preview/food-menu";
import { StudyCards } from "./result-preview/study-card";

export type RichPart = Extract<AppUIMessage["parts"][number], { type: "tool-recommendCampusFood" | "tool-buildChecklist" | "tool-buildStudyCards" | "tool-showContactCard" | "tool-buildExamMemo" }>;
const LABELS = { "tool-recommendCampusFood": "美食菜单", "tool-buildChecklist": "办事清单", "tool-buildStudyCards": "复习卡片", "tool-showContactCard": "联系卡", "tool-buildExamMemo": "考试备忘" };

export function RichResult({ part }: { part: RichPart }) {
  if (part.state === "input-streaming" || part.state === "input-available") return <div role="status" className="flex items-center gap-2 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground"><Loader2 className="size-4 motion-safe:animate-spin" />正在整理{LABELS[part.type]}…</div>;
  if (part.state === "output-error") return <div role="alert" className="rounded-2xl border border-destructive/30 p-4 text-sm leading-6 text-destructive">{LABELS[part.type]}暂时没能生成。{part.errorText || "请补充具体信息后再试。"}</div>;
  if (part.state !== "output-available") return null;
  switch (part.type) {
    case "tool-recommendCampusFood": return <FoodMenu items={part.output.foods} initialBudget={part.output.budget} initialCategory={part.output.category} />;
    case "tool-buildChecklist": return <ProcedureChecklist data={part.output} />;
    case "tool-buildStudyCards": return <StudyCards data={part.output} />;
    case "tool-showContactCard": return <ContactCard data={part.output} />;
    case "tool-buildExamMemo": return <ExamMemo data={part.output} />;
  }
}
