"use client";

import { BellPlus, Check, ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CardMark } from "@/lib/learn/progress";
import { lessonToReviewCards } from "@/lib/learn/review";
import type { Lesson, LessonScene } from "@/lib/learn/schema";
import { addReviewCards, updateProgress, useProgress, useReviewCards } from "../learn-storage";
import styles from "../learn.module.css";
import { BasisLine, SourceBadges, splitCitations } from "../source-badges";
import { SceneHeader } from "./scene-header";

const MARKS: { mark: CardMark; label: string }[] = [
  { mark: "forgot", label: "忘了" },
  { mark: "fuzzy", label: "模糊" },
  { mark: "know", label: "认识" },
];

export function FlashcardsScene({ scene, lesson }: { scene: Extract<LessonScene, { kind: "flashcards" }>; lesson: Lesson }) {
  const cards = scene.content!.cards;
  const marks = useProgress(lesson.id).cards;
  const reviewKeys = new Set(useReviewCards().map((item) => item.key));
  // 只加入这一页的闪卡
  const pending = lessonToReviewCards({ ...lesson, scenes: [scene] }).filter((item) => !reviewKeys.has(item.key));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[index];
  const key = `${scene.id}:${index}`;
  const marked = cards.filter((_, i) => marks[`${scene.id}:${i}`]).length;
  const back = splitCitations(card.back);

  function go(offset: number) {
    setIndex((current) => Math.min(cards.length - 1, Math.max(0, current + offset)));
    setFlipped(false);
  }

  function mark(value: CardMark) {
    updateProgress(lesson.id, (progress) => ({
      ...progress,
      cards: { ...progress.cards, [key]: value },
      // 每张都标记过就算这一页学完了
      completed:
        cards.every((_, i) => i === index || progress.cards[`${scene.id}:${i}`]) && !progress.completed.includes(scene.id)
          ? [...progress.completed, scene.id]
          : progress.completed,
    }));
    if (index < cards.length - 1) go(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <SceneHeader kind="flashcards" title={scene.title} />
      <p className={styles.muted} aria-live="polite">
        第 {index + 1}/{cards.length} 张 · 已标记 {marked}/{cards.length}
      </p>
      <button
        type="button"
        className={styles.flash}
        data-flipped={flipped}
        aria-pressed={flipped}
        aria-label={flipped ? `${card.front}：已翻到背面，点击返回` : `${card.front}：点击翻看解释`}
        onClick={() => setFlipped((value) => !value)}
      >
        <span className={styles.flashInner}>
          <span className={`${styles.face} ${styles.faceFront}`} aria-hidden={flipped}>
            <strong>{card.front}</strong>
            {card.hint && <span className={styles.faceHint}>提示：{card.hint}</span>}
            <span className={styles.flipTip}>
              <RotateCw className="size-3.5" />
              点击翻面
            </span>
          </span>
          <span className={`${styles.face} ${styles.faceBack}`} aria-hidden={!flipped}>
            <strong>{back.text}</strong>
          </span>
        </span>
      </button>
      {/* 卡面是一个按钮，里面不能再放按钮，出处角标放在卡片下面 */}
      {flipped && back.numbers.length > 0 && (
        <p className={styles.basis}>
          出处：
          <SourceBadges numbers={back.numbers} />
        </p>
      )}
      <div className={styles.marks} role="group" aria-label="这张卡片你掌握得怎么样">
        {MARKS.map(({ mark: value, label }) => (
          <button key={value} type="button" className={styles.mark} data-mark={value} aria-pressed={marks[key] === value} onClick={() => mark(value)}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => go(-1)} disabled={index === 0}>
          <ChevronLeft />
          上一张
        </Button>
        <Button variant="ghost" size="sm" onClick={() => go(1)} disabled={index === cards.length - 1}>
          下一张
          <ChevronRight />
        </Button>
      </div>
      <Button
        variant={pending.length ? "outline" : "ghost"}
        disabled={!pending.length}
        onClick={() => toast.success(`已加入 ${addReviewCards(pending)} 张闪卡`, { description: "今天就可以在小狮课堂首页开始复习" })}
      >
        {pending.length ? <BellPlus /> : <Check />}
        {pending.length ? `加入复习计划（${pending.length} 张）` : "已加入复习计划"}
      </Button>
      <BasisLine grounding={lesson.grounding} sourceCount={lesson.sources.length} />
    </div>
  );
}
