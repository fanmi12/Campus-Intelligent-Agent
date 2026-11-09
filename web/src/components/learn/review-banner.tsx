"use client";

import { Layers } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { beijingToday, dueCards } from "@/lib/learn/review";
import { useReviewCards } from "./learn-storage";
import styles from "./learn.module.css";

// 课堂首页的「今日复习」：有闪卡加入过复习计划才显示，到期的卡片数一目了然
export function ReviewBanner() {
  const cards = useReviewCards();
  const [today] = useState(() => beijingToday());
  if (!cards.length) return null;
  const due = dueCards(cards, today).length;
  return (
    <section aria-label="今日复习" className={`${styles.row} justify-between`}>
      <span className="flex min-w-0 items-center gap-3">
        <Layers className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0">
          <span className="block text-[15px] font-medium">今日复习</span>
          <span className="block text-xs text-muted-foreground">{due ? `${due} 张闪卡到期` : `今天没有要复习的卡片 · 共 ${cards.length} 张`}</span>
        </span>
      </span>
      {due > 0 && (
        <Link href="/learn/review" className={buttonVariants({ size: "sm" })}>
          开始
        </Link>
      )}
    </section>
  );
}
