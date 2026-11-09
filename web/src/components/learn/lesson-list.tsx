"use client";

import { CircleAlert, CircleCheck, LoaderCircle, Presentation, X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import type { LessonSummary } from "@/lib/learn/schema";
import { relativeTime } from "./format";
import { removeLocalLesson, upsertLocalLesson, useLocalLessons, type LocalLesson } from "./learn-storage";
import styles from "./learn.module.css";

function statusText(lesson: LocalLesson): string {
  if (lesson.gone) return "已被删除";
  if (lesson.status === "generating") return lesson.total ? `备课中 ${lesson.done}/${lesson.total}` : "备课中";
  if (lesson.status === "failed") return "备课没有成功";
  if (lesson.completedAt) return `已学完${lesson.score !== undefined ? ` · ${lesson.score} 分` : ""}`;
  return `${lesson.total} 页`;
}

function StatusIcon({ lesson }: { lesson: LocalLesson }) {
  if (lesson.gone || lesson.status === "failed") return <CircleAlert className="size-5 shrink-0 text-muted-foreground" aria-hidden />;
  if (lesson.status === "generating") return <LoaderCircle className="size-5 shrink-0 animate-spin text-primary" aria-hidden />;
  if (lesson.completedAt) return <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />;
  return <Presentation className="size-5 shrink-0 text-primary" aria-hidden />;
}

// 把服务器上的最新状态同步到本地列表：服务器上找不到的标灰，仍在备课的继续刷新
function useSyncLessons(lessons: LocalLesson[]) {
  const ids = lessons.slice(0, 30).map((lesson) => lesson.id);
  const key = ids.join(",");
  const generating = lessons.some((lesson) => lesson.status === "generating" && !lesson.gone);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    async function sync() {
      if (document.hidden) return;
      try {
        const response = await fetch(`/api/learn/lessons?ids=${key}`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const { items } = (await response.json()) as { items: LessonSummary[] };
        if (cancelled) return;
        const found = new Map(items.map((item) => [item.id, item]));
        for (const id of key.split(",")) {
          const item = found.get(id);
          if (item) upsertLocalLesson({ id, title: item.title, status: item.status, done: item.done, total: item.total, gone: false });
          else upsertLocalLesson({ id, gone: true });
        }
      } catch {
        // 网络不好时保持原样
      }
    }
    void sync();
    if (!generating) return () => void (cancelled = true);
    const timer = setInterval(sync, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [key, generating]);
}

// 「我的课程」：这个浏览器里创建过的课程（只存在本地，换设备看不到）
export function LessonList() {
  const lessons = useLocalLessons();
  useSyncLessons(lessons);
  if (!lessons.length) return null;
  return (
    <section aria-labelledby="my-lessons" className="flex flex-col gap-3">
      <h2 id="my-lessons" className="text-base font-semibold">
        我的课程
      </h2>
      <ul className="flex flex-col gap-2">
        {lessons.map((lesson) => (
          <li key={lesson.id} className="flex items-center gap-2">
            <Link href={`/learn/${lesson.id}`} className={`${styles.row} min-w-0 flex-1`} data-gone={lesson.gone}>
              <StatusIcon lesson={lesson} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{lesson.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {statusText(lesson)} · {relativeTime(lesson.createdAt)}
                </span>
              </span>
            </Link>
            <button
              type="button"
              className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
              aria-label={`从列表里移除「${lesson.title}」`}
              onClick={() => removeLocalLesson(lesson.id)}
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-5 text-muted-foreground">列表只保存在这台设备的浏览器里；移除只是不再显示，课程本身不会被删除。</p>
    </section>
  );
}
