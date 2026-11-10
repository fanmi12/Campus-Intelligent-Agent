import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Review } from "@/components/learn/review";
import { env } from "@/lib/server/env";

export const metadata: Metadata = { title: "今日复习", robots: { index: false, follow: false } };

// 总开关（LEARN_ENABLED）在运行时读取
export const dynamic = "force-dynamic";

export default function ReviewPage() {
  if (!env.learn.enabled) notFound();
  return <Review />;
}
