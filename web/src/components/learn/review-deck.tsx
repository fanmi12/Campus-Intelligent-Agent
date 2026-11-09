"use client";

import { BellPlus, PartyPopper, RotateCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { stripMath } from "@/lib/learn/math/rich";
import { addDays, beijingToday, describeInterval, dueCards, GRADES, schedule, type ReviewGrade } from "@/lib/learn/review";
import { remindReview } from "./export";
import { sendLearnEvent } from "./learn-events";
import { LearnHeader } from "./learn-header";
import { saveReviewCard, useReviewCards } from "./learn-storage";
import styles from "./learn.module.css";
import { RichText } from "./source-badges";

// 今日复习：到期的闪卡逐张翻面、评分，按评分排下次复习的日子（简化的 SM-2）
export default function ReviewDeck() {
  const cards = useReviewCards();
  // 进入页面时定下「今天」，复习过程中不会因为跨过零点而变
  const [today] = useState(() => beijingToday());
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const queue = dueCards(cards, today);
  const card = queue[0];
  const upcoming = cards.filter((item) => item.due > today).sort((a, b) => (a.due < b.due ? -1 : 1));
  const nextDate = upcoming[0]?.due;

  function grade(value: ReviewGrade) {
    if (!card) return;
    saveReviewCard(schedule(card, value, today));
    sendLearnEvent({ lessonId: card.lessonId, type: "review" });
    setFlipped(false);
    setReviewed((count) => count + 1);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-aurora">
      <LearnHeader title="今日复习" subtitle={card ? `还剩 ${queue.length} 张` : undefined} backHref="/learn" backLabel="返回小狮课堂" />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pt-5 pb-10">
        {card ? (
          <>
            <p className={styles.muted} aria-live="polite">
              已复习 {reviewed} 张 · 还剩 {queue.length} 张 · 来自《{card.lessonTitle}》
            </p>
            <button
              type="button"
              className={styles.flash}
              data-flipped={flipped}
              aria-pressed={flipped}
              aria-label={flipped ? `${stripMath(card.front)}：已翻到背面，点击返回` : `${stripMath(card.front)}：点击翻看解释`}
              onClick={() => setFlipped((value) => !value)}
            >
              <span className={styles.flashInner}>
                <span className={`${styles.face} ${styles.faceFront}`} aria-hidden={flipped}>
                  <strong>
                    <RichText text={card.front} />
                  </strong>
                  <span className={styles.flipTip}>
                    <RotateCw className="size-3.5" />
                    先想一想，再点击翻面
                  </span>
                </span>
                <span className={`${styles.face} ${styles.faceBack}`} aria-hidden={!flipped}>
                  <strong>
                    <RichText text={card.back} />
                  </strong>
                </span>
              </span>
            </button>
            {/* 按钮上写着评分后下次出现的时间 */}
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="这张卡片你记得怎么样">
              {GRADES.map(({ grade: value, label }) => (
                <button key={value} type="button" className={styles.mark} data-mark={value === "again" ? "forgot" : value === "hard" ? "fuzzy" : "know"} disabled={!flipped} onClick={() => grade(value)}>
                  {label} · {describeInterval(schedule(card, value, today).interval)}
                </button>
              ))}
            </div>
            {!flipped && <p className="text-center text-xs text-muted-foreground">翻面看过答案，才能评分</p>}
          </>
        ) : (
          <section className={`${styles.panel} mt-6 flex flex-col items-center gap-4 py-8 text-center`}>
            <PartyPopper className="size-10 text-gold" />
            {cards.length === 0 ? (
              <>
                <h2 className="text-lg font-semibold">还没有要复习的闪卡</h2>
                <p className="max-w-xs text-sm leading-6 text-muted-foreground">学完一节课后，在闪卡页点「加入复习计划」，到期的卡片就会出现在这里。</p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">{reviewed ? `今天的复习完成了，共 ${reviewed} 张` : "今天没有需要复习的卡片"}</h2>
                <p className="text-sm text-muted-foreground">{nextDate ? `下一次复习：${nextDate === addDays(today, 1) ? "明天" : nextDate}（${upcoming.filter((item) => item.due === nextDate).length} 张）` : "所有卡片都复习过了"}</p>
              </>
            )}
            <div className="flex w-full max-w-xs flex-col gap-2">
              {nextDate && (
                <Button variant="outline" size="lg" onClick={() => void remindReview(nextDate, upcoming.filter((item) => item.due === nextDate).length)}>
                  <BellPlus />
                  提醒我复习
                </Button>
              )}
              <Link href="/learn" className={buttonVariants({ size: "lg" })}>
                回到小狮课堂
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
