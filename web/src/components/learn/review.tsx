"use client";

import dynamic from "next/dynamic";
import { LearnHeader } from "./learn-header";

// 复习卡存在浏览器本地，所以只在浏览器端渲染；加载期间先显示同样的顶栏
function ReviewSkeleton() {
  return (
    <div className="min-h-dvh bg-aurora">
      <LearnHeader title="今日复习" backHref="/learn" backLabel="返回小狮课堂" />
    </div>
  );
}

const ReviewDeck = dynamic(() => import("./review-deck"), { ssr: false, loading: ReviewSkeleton });

export function Review() {
  return <ReviewDeck />;
}
