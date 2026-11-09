"use client";

import { CircleAlert, GraduationCap, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { upsertLocalLesson } from "@/components/learn/learn-storage";
import { Button, buttonVariants } from "@/components/ui/button";
import type { AppUIMessage } from "@/lib/ai/types";
import type { Lesson } from "@/lib/learn/schema";
import { getClientId } from "./storage";

type Part = Extract<AppUIMessage["parts"][number], { type: "tool-createLesson" }>;

function Shell({ children }: { children: React.ReactNode }) {
  return <article className="rounded-2xl border bg-card p-4 text-card-foreground">{children}</article>;
}

// 课程备课进度：每 2 秒读一次，备好或失败就停；最多等 4 分钟（之后可以去课堂页看）
function useLessonProgress(id: string): Lesson | null {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    async function tick() {
      try {
        const response = await fetch(`/api/learn/lessons/${id}`, { headers: { "X-Client-Id": getClientId() }, cache: "no-store" });
        if (response.ok && !cancelled) {
          const data = (await response.json()) as { lesson: Lesson };
          setLesson(data.lesson);
          // 记进「我的课程」，之后可以从课堂首页找到
          upsertLocalLesson({
            id,
            title: data.lesson.title,
            topic: data.lesson.topic,
            createdAt: data.lesson.createdAt,
            status: data.lesson.status,
            done: data.lesson.scenes.filter((scene) => scene.status === "ready").length,
            total: data.lesson.scenes.length,
            gone: false,
          });
          if (data.lesson.status !== "generating") return;
        }
      } catch {
        // 网络不好时下一轮再试
      }
      if (!cancelled && Date.now() - started < 4 * 60_000) timer = setTimeout(tick, 2000);
    }
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);
  return lesson;
}

function progressText(lesson: Lesson): string {
  const ready = lesson.scenes.filter((scene) => scene.status === "ready").length;
  if (lesson.status === "ready") return `已备好 ${lesson.scenes.length} 页 · 约 ${lesson.minutes} 分钟`;
  if (lesson.step === "queued") return "排队中，马上开始备课…";
  if (lesson.step === "writing" && lesson.scenes.length) return `正在编写第 ${Math.min(ready + 1, lesson.scenes.length)}/${lesson.scenes.length} 页…`;
  return "正在设计课程大纲…";
}

function ReadyCard({ id, topic, streaming }: { id: string; topic: string; streaming: boolean }) {
  const lesson = useLessonProgress(id);
  const ready = lesson?.scenes.filter((scene) => scene.status === "ready").length ?? 0;
  const total = lesson?.scenes.length ?? 0;
  const failed = lesson?.status === "failed" && ready === 0;
  // 回答还在输出时离开页面，这条回答不会被保存，所以等回答结束后才能进入
  const canEnter = ready > 0 && !streaming;
  return (
    <Shell>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
          {failed ? <CircleAlert className="size-5 text-destructive" /> : <GraduationCap className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">小狮课堂</p>
          <h3 className="text-[15px] leading-6 font-semibold [overflow-wrap:anywhere]">{lesson?.title || topic}</h3>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground" role="status" aria-live="polite">
            {failed ? (lesson?.error ?? "备课失败了，请稍后再试") : lesson ? progressText(lesson) : "正在准备课程…"}
          </p>
        </div>
      </div>
      {lesson?.status === "generating" && total > 0 && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`已备好 ${ready}/${total} 页`}>
          <span className="block h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(ready / total) * 100}%` }} />
        </div>
      )}
      <div className="mt-3 flex flex-col gap-1.5">
        {canEnter ? (
          <Link href={`/learn/${id}`} className={buttonVariants({ size: "lg" })}>
            进入课堂
          </Link>
        ) : failed ? (
          <Link href={`/learn/${id}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
            去课堂页重新生成
          </Link>
        ) : (
          <Button size="lg" disabled>
            {lesson?.status === "generating" || !lesson ? <LoaderCircle className="animate-spin" /> : null}
            进入课堂
          </Button>
        )}
        {ready > 0 && streaming && <p className="text-center text-xs text-muted-foreground">回答结束后就可以进入课堂</p>}
      </div>
    </Shell>
  );
}

export function LessonCard({ part, streaming }: { part: Part; streaming: boolean }) {
  if (part.state === "output-error") {
    return (
      <Shell>
        <p className="flex items-start gap-2 text-sm" role="alert">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          {part.errorText || "课程没能创建，请稍后再试"}
        </p>
      </Shell>
    );
  }
  if (part.state !== "output-available") {
    return (
      <Shell>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          正在准备课程…
        </p>
      </Shell>
    );
  }
  return <ReadyCard id={part.output.id} topic={part.output.topic} streaming={streaming} />;
}
