"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";

// 小狮课堂各页面共用的顶栏：返回、标题、右侧操作
export function LearnHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  wide = false,
  children,
}: {
  title: string;
  subtitle?: string;
  backHref: string;
  backLabel: string;
  // 放映模式下顶栏随舞台一起变宽
  wide?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="z-20 shrink-0 border-b border-border/60 bg-background/75 backdrop-blur-md">
      <div className={`mx-auto flex h-14 w-full items-center gap-2 px-3 ${wide ? "max-w-6xl" : "max-w-2xl"}`}>
        <Link href={backHref} aria-label={backLabel} className={buttonVariants({ variant: "ghost", size: "icon" })}>
          <ArrowLeft />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] leading-5 font-semibold">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </div>
    </header>
  );
}
