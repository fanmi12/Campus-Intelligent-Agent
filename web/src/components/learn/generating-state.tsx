"use client";

import { Check, Circle, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandAvatar } from "@/components/chat/brand-avatar";
import type { Lesson } from "@/lib/learn/schema";
import styles from "./learn.module.css";

const TIPS = [
  "讲解页里，要点旁的数字角标可以点开，看到这句话的出处原文。",
  "测验答错了也没关系，每道题都有解析。",
  "闪卡翻面后标记「认识」「模糊」「忘了」，方便之后复习。",
  "点「播放讲解」，字幕会一句一句跟着讲，讲到的要点会高亮。",
];

const STEPS = ["查资料", "设计大纲", "编写页面"];

// 备课中：还没有大纲时显示的居中卡片（三步进度 + 小提示）
export function GeneratingState({ lesson, queuePosition }: { lesson: Lesson; queuePosition?: number }) {
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTip((value) => (value + 1) % TIPS.length), 6000);
    return () => clearInterval(timer);
  }, []);

  const current = lesson.step === "writing" ? 2 : lesson.step === "outlining" ? 1 : 0;
  const ready = lesson.scenes.filter((scene) => scene.status === "ready").length;
  const message =
    lesson.step === "queued"
      ? queuePosition
        ? `排队中，前面还有 ${queuePosition} 节课`
        : "排队中…"
      : lesson.step === "researching"
        ? lesson.grounding === "material"
          ? "正在阅读你的资料…"
          : "正在查阅校园资料…"
        : lesson.step === "outlining"
          ? "正在设计课程大纲…"
          : `正在编写第 ${Math.min(ready + 1, lesson.scenes.length)}/${lesson.scenes.length} 页…`;

  return (
    <section className={`${styles.panel} mt-6 flex flex-col items-center gap-5 py-8 text-center`} aria-label="备课进度">
      <BrandAvatar size="lg" glowing />
      <div>
        <h2 className="text-lg font-semibold">狮老师正在备课</h2>
        <p className="mt-1 text-sm text-muted-foreground" role="status" aria-live="polite">
          {message}
        </p>
      </div>
      <ol className="flex w-full max-w-xs flex-col gap-2.5 text-left text-[15px]">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-2.5" aria-current={index === current ? "step" : undefined}>
            {index < current ? (
              <Check className="size-4 text-success" aria-label="已完成" />
            ) : index === current ? (
              <LoaderCircle className="size-4 animate-spin text-primary" aria-label="进行中" />
            ) : (
              <Circle className="size-4 text-muted-foreground/50" aria-label="未开始" />
            )}
            <span className={index > current ? "text-muted-foreground" : ""}>{step}</span>
          </li>
        ))}
      </ol>
      <p className="min-h-12 max-w-xs text-[13px] leading-6 text-muted-foreground">{TIPS[tip]}</p>
      <p className="max-w-xs text-xs leading-5 text-muted-foreground/80">关掉页面也没关系，备课会在后台继续，稍后可以在「我的课程」里找到它。</p>
    </section>
  );
}
