"use client";

import dynamic from "next/dynamic";
import { site } from "@/lib/config";
import { LearnHeader } from "./learn-header";

// 「我的课程」「学习进度」存在浏览器本地，所以课堂首页只在浏览器端渲染；加载期间先显示同样的顶栏，避免页面跳动
function LearnSkeleton() {
  return (
    <div className="min-h-dvh bg-aurora">
      <LearnHeader title={site.learn.name} backHref="/" backLabel={`返回${site.name}`} />
    </div>
  );
}

const LearnHome = dynamic(() => import("./learn-home"), { ssr: false, loading: LearnSkeleton });

export function Learn() {
  return <LearnHome />;
}
