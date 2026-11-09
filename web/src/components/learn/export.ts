"use client";

import { toast } from "sonner";
import { downloadText } from "@/components/chat/result-preview/shared";
import type { CalendarEvent } from "@/lib/ai/tools";
import { downloadIcs } from "@/lib/ics";
import { lessonToMarkdown } from "@/lib/learn/notes";
import type { LessonProgress } from "@/lib/learn/progress";
import type { Lesson } from "@/lib/learn/schema";

// 微信内置浏览器不允许下载文件：改成复制到剪贴板，并提示用浏览器打开
const isWeChat = () => typeof navigator !== "undefined" && /MicroMessenger/i.test(navigator.userAgent);

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// 导出笔记：下载 Markdown 文件（有学习进度时带上自己的作答）
export async function exportNotes(lesson: Lesson, progress?: LessonProgress) {
  const markdown = lessonToMarkdown(lesson, progress);
  if (isWeChat()) {
    const copied = await copyText(markdown);
    toast.info("微信里不能直接下载文件", { description: `${copied ? "笔记文字已复制。" : ""}点右上角「…」选择「在浏览器打开」后可以下载。`, duration: 6000 });
    return;
  }
  const name = lesson.title.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 40) || "小狮课堂笔记";
  downloadText(`${name}.md`, markdown, "text/markdown;charset=utf-8");
  toast.success("笔记已下载");
}

// 复习提醒：下一个到期日晚上 8 点（北京时间）的日程，打开 .ics 就能加入手机日历
export async function remindReview(date: string, count: number) {
  const event: CalendarEvent = {
    id: `review-${date}`,
    title: `小狮课堂 · 复习 ${count} 张闪卡`,
    start: `${date}T20:00:00+08:00`,
    allDay: false,
    notes: "打开小狮课堂首页开始今日复习",
    kind: "other",
  };
  if (isWeChat()) {
    const copied = await copyText(`${event.title}\n时间：${date} 20:00\n${event.notes}`);
    toast.info("微信里不能直接添加日历", { description: `${copied ? "已复制提醒文字。" : ""}点右上角「…」选择「在浏览器打开」后再添加。`, duration: 6000 });
    return;
  }
  downloadIcs([event], "小狮课堂复习提醒");
  toast.success("已生成日历文件", { description: "打开它就能把复习提醒加入手机日历" });
}
