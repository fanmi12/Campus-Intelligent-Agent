"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LessonSummary } from "@/lib/learn/schema";
import { GROUNDING_LABEL } from "./format";
import styles from "./learn.module.css";

// 精选课程：团队生成并人工核对过的课程，打开就能学，不用等待。没有精选课程时整块不显示
export function FeaturedList() {
  const [items, setItems] = useState<LessonSummary[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/learn/featured", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { items?: LessonSummary[] } | null) => {
        if (!cancelled && data?.items) setItems(data.items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  if (!items.length) return null;
  return (
    <section aria-labelledby="featured" className="flex flex-col gap-3">
      <h2 id="featured" className="text-base font-semibold">
        精选课程
      </h2>
      <ul className="grid grid-cols-2 gap-2.5">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/learn/${item.id}`} className={`${styles.row} h-full flex-col items-start gap-1.5`}>
              <span className="text-[15px] leading-6 font-medium">{item.title}</span>
              <span className="text-xs text-muted-foreground">
                {item.total} 页 · 约 {item.minutes} 分钟 · {GROUNDING_LABEL[item.grounding]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
