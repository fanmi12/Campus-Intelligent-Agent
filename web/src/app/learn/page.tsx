import type { Metadata } from "next";
import Link from "next/link";
import { Learn } from "@/components/learn/learn";
import { buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/config";
import { env } from "@/lib/server/env";

export const metadata: Metadata = {
  title: site.learn.name,
  description: "一句话生成一节互动微课：讲解、测验、闪卡、讨论和复习计划。",
};

// 总开关（LEARN_ENABLED）在运行时读取，页面不能在构建时预渲染成固定内容
export const dynamic = "force-dynamic";

export default function LearnPage() {
  if (!env.learn.enabled) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <h1 className="text-lg font-semibold">{site.learn.name}暂未开放</h1>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            回到{site.name}
          </Link>
        </div>
      </main>
    );
  }
  return <Learn />;
}
