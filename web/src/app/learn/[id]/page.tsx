import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Classroom } from "@/components/learn/classroom";
import { LESSON_ID } from "@/lib/learn/schema";
import { env } from "@/lib/server/env";
import { getLesson } from "@/lib/server/learn/store";

type Props = { params: Promise<{ id: string }> };

// 课程内容和生成进度随时在变，不能在构建时固定
export const dynamic = "force-dynamic";

async function loadLesson(params: Props["params"]) {
  const { id } = await params;
  if (!env.learn.enabled || !LESSON_ID.test(id)) return null;
  return getLesson(id);
}

// 课程链接只给拿到链接的人看，不让搜索引擎收录
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lesson = await loadLesson(params);
  return {
    title: lesson?.title ?? "小狮课堂",
    description: lesson?.summary || "小狮课堂里的一节互动微课",
    robots: { index: false, follow: false },
  };
}

export default async function LessonPage({ params }: Props) {
  const lesson = await loadLesson(params);
  if (!lesson) notFound();
  return <Classroom initialLesson={lesson} />;
}
