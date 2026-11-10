"use client";

import { FlaskConical } from "lucide-react";
import { BrandAvatar } from "@/components/chat/brand-avatar";
import { useAppStatus } from "@/components/chat/use-app-status";
import { site } from "@/lib/config";
import { FeaturedList } from "./featured-list";
import { LearnHeader } from "./learn-header";
import { LessonForm } from "./lesson-form";
import { LessonList } from "./lesson-list";
import { ReviewBanner } from "./review-banner";

// 课堂首页 /learn：一句话备课、精选课程、我的课程
export default function LearnHome() {
  const status = useAppStatus();
  return (
    <div className="min-h-dvh bg-aurora">
      <LearnHeader title={site.learn.name} subtitle={site.name} backHref="/" backLabel={`返回${site.name}`} />
      {/* [&>*]:min-w-0：示例主题那一行不换行，不限制的话会把整个表单撑出屏幕 */}
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pt-6 pb-16 [&>*]:min-w-0">
        {status?.demo && (
          <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-5 text-foreground/80">
            <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-warning" />
            演示模式：还没接入大模型，这里展示的是示例课程
          </div>
        )}

        <section className="flex flex-col items-center gap-3 text-center">
          <BrandAvatar size="lg" />
          <div>
            <h2 className="text-[22px] leading-8 font-semibold">{site.learn.tagline}</h2>
            <p className="mt-1 text-sm text-muted-foreground">讲解 · 测验 · 闪卡 · 讨论</p>
          </div>
        </section>

        <LessonForm />
        <ReviewBanner />
        <FeaturedList />
        <LessonList />

        <footer className="flex flex-col gap-1 text-center text-xs leading-5 text-muted-foreground">
          <p>{site.learn.credit}</p>
          <p>{site.disclaimer}</p>
        </footer>
      </main>
    </div>
  );
}
