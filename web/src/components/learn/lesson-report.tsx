"use client";

import { BellPlus, CircleCheck, CircleDot, CircleX, Copy, Download, Layers, RotateCcw, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { quizResults, weakPoints } from "@/lib/learn/progress";
import { lessonToReviewCards } from "@/lib/learn/review";
import type { Lesson } from "@/lib/learn/schema";
import { exportNotes } from "./export";
import { formatDuration } from "./format";
import { addReviewCards, resetProgress, useProgress, useReviewCards } from "./learn-storage";
import styles from "./learn.module.css";

function verdict(score: number | undefined): string {
  if (score === undefined) return "学完这节课，很棒！";
  if (score >= 90) return "掌握得很扎实";
  if (score >= 60) return "掌握得不错，再巩固一下薄弱点会更好";
  return "还有一些地方要再看看";
}

// 学习报告：得分、完成页数、用时、每道题的情况、建议复习的知识点，以及后续的操作
export function LessonReport({ lesson }: { lesson: Lesson }) {
  const progress = useProgress(lesson.id);
  const reviewCards = useReviewCards();
  const [confirming, setConfirming] = useState(false);
  const results = quizResults(lesson, progress);
  const weak = weakPoints(lesson, progress);
  const cards = lessonToReviewCards(lesson);
  const known = new Set(reviewCards.map((card) => card.key));
  const pending = cards.filter((card) => !known.has(card.key));
  const readyPages = lesson.scenes.filter((scene) => scene.status === "ready").length;
  const donePages = new Set([...progress.completed, ...lesson.scenes.filter((scene) => scene.kind === "summary").map((scene) => scene.id)]).size;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/learn/${lesson.id}`);
      toast.success("链接已复制");
    } catch {
      toast.error("复制失败，请长按地址栏里的链接复制");
    }
  }

  return (
    <section className={styles.panel} aria-label="学习报告">
      <p className="flex items-center gap-2 text-[17px] font-semibold">
        <Trophy className="size-5 text-gold" />
        这节课学完了
      </p>
      <p className={`${styles.muted} mt-0.5`}>{verdict(progress.score)}</p>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-muted/60 px-2 py-3">
          <p className="text-2xl font-semibold tabular-nums">{progress.score ?? "—"}</p>
          <p className={styles.muted}>测验得分</p>
        </div>
        <div className="rounded-xl bg-muted/60 px-2 py-3">
          <p className="text-2xl font-semibold tabular-nums">
            {Math.min(donePages, readyPages)}/{readyPages}
          </p>
          <p className={styles.muted}>学完页数</p>
        </div>
        <div className="rounded-xl bg-muted/60 px-2 py-3">
          <p className="text-[17px] leading-8 font-semibold">{formatDuration(progress.activeMs)}</p>
          <p className={styles.muted}>学习用时</p>
        </div>
      </div>

      {weak.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium">建议复习</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {weak.map((point) => (
              <span key={point} className={styles.mapChip}>
                {point}
              </span>
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <details className="mt-4 rounded-xl border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium select-none">查看每道题（{results.length} 题）</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {results.map((item) => {
              const Icon = item.score >= 0.8 ? CircleCheck : item.score >= 0.4 ? CircleDot : CircleX;
              const tone = item.score >= 0.8 ? "text-success" : item.score >= 0.4 ? "text-warning" : "text-destructive";
              return (
                <li key={`${item.sceneId}:${item.index}`} className="flex items-start gap-2 text-[14.5px] leading-6">
                  <Icon className={`mt-1 size-4 shrink-0 ${tone}`} aria-label={item.score >= 0.8 ? "答对" : item.score >= 0.4 ? "部分对" : item.answer ? "没答对" : "没作答"} />
                  <span className="min-w-0 flex-1">
                    {item.question.prompt}
                    <span className={`${styles.muted} block`}>考查：{item.question.point}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <div className="mt-5 flex flex-col gap-2">
        {cards.length > 0 && (
          <Button
            variant={pending.length ? "default" : "outline"}
            size="lg"
            disabled={!pending.length}
            onClick={() => toast.success(`已加入 ${addReviewCards(pending)} 张闪卡`, { description: "今天就可以在小狮课堂首页开始复习" })}
          >
            {pending.length ? <Layers /> : <BellPlus />}
            {pending.length ? `把本课 ${pending.length} 张闪卡加入复习` : "本课闪卡已在复习计划里"}
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => void exportNotes(lesson, progress)}>
            <Download />
            导出笔记
          </Button>
          <Button variant="outline" onClick={copyLink}>
            <Copy />
            复制链接
          </Button>
        </div>
        <Link href="/learn" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          再学一节
        </Link>
        <Button variant="ghost" onClick={() => setConfirming(true)}>
          <RotateCcw />
          重新学习这节课
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="gap-4 rounded-3xl">
          <DialogHeader className="pr-8">
            <DialogTitle>重新学习这节课？</DialogTitle>
            <DialogDescription>会清空这节课在这台设备上的作答、得分和讨论记录，从第一页重新开始。已加入复习计划的闪卡不受影响。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                resetProgress(lesson.id);
                setConfirming(false);
              }}
            >
              清空并重新开始
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
