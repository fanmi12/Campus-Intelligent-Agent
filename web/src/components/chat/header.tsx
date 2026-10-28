"use client";

import { Ellipsis, History, LayoutDashboard, Monitor, Moon, ShieldCheck, SquarePen, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { site } from "@/lib/config";
import { BrandAvatar } from "./brand-avatar";

export function ChatHeader({
  onNewChat,
  onOpenHistory,
  onOpenPrivacy,
  canReset,
  busy = false,
}: {
  onNewChat?: () => void;
  onOpenHistory?: () => void;
  onOpenPrivacy?: () => void;
  canReset?: boolean;
  busy?: boolean;
}) {
  const { setTheme } = useTheme();
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-3 px-4">
        <BrandAvatar />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] leading-5 font-semibold">{site.name}</div>
          <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span className="size-1.5 shrink-0 rounded-full bg-success" />
            {site.school} · {site.tagline}
          </div>
        </div>
        {/* 回答中不能切换对话，否则这次回答来不及保存 */}
        <Button variant="ghost" size="icon" onClick={onOpenHistory} disabled={!onOpenHistory || busy} aria-label="历史对话">
          <History />
        </Button>
        <Button variant="ghost" size="icon" onClick={onNewChat} disabled={!canReset} aria-label="开始新对话">
          <SquarePen />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="更多选项" />}>
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>外观</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setTheme("light")}>
                <Sun />
                浅色
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")}>
                <Moon />
                深色
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")}>
                <Monitor />
                跟随系统
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {onOpenPrivacy && (
              <DropdownMenuItem onClick={onOpenPrivacy}>
                <ShieldCheck />
                隐私说明
              </DropdownMenuItem>
            )}
            <DropdownMenuItem render={<a href="/admin" />}>
              <LayoutDashboard />
              管理后台
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* AI 回答时，顶栏底部出现一条流光 */}
      <div className="glow-line" data-active={busy} />
    </header>
  );
}
