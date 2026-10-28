"use client";

import { ShieldCheck, SquarePen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { ChatSummary } from "./storage";

const pad = (value: number) => String(value).padStart(2, "0");

function formatTime(time: number): string {
  const date = new Date(time);
  const now = new Date();
  const days = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86_400_000,
  );
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (days === 0) return `今天 ${clock}`;
  if (days === 1) return `昨天 ${clock}`;
  const day = `${date.getMonth() + 1}月${date.getDate()}日`;
  return date.getFullYear() === now.getFullYear() ? day : `${date.getFullYear()}年${day}`;
}

// 撤销入口放在面板里：面板是模态的，面板外的提示条点不到
export function ChatHistory({
  open,
  onOpenChange,
  chats,
  currentId,
  deletedTitle,
  onSelect,
  onNewChat,
  onDelete,
  onUndo,
  onPrivacy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chats: ChatSummary[];
  currentId: string;
  deletedTitle?: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onUndo: () => void;
  onPrivacy: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[86%] gap-0 sm:max-w-sm">
        <SheetHeader className="gap-1 px-5 pt-5 pr-14 pb-3">
          <SheetTitle className="text-base">历史对话</SheetTitle>
          <SheetDescription className="text-xs">对话只保存在这台设备的浏览器里，最多保留 30 段</SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <Button variant="outline" className="w-full rounded-xl" onClick={onNewChat}>
            <SquarePen />
            新对话
          </Button>
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {deletedTitle && (
            <div role="status" className="mx-1 mb-2 flex items-center gap-2 rounded-xl border bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">已删除「{deletedTitle}」</span>
              <button type="button" onClick={onUndo} className="shrink-0 font-medium text-primary hover:underline">
                撤销
              </button>
            </div>
          )}
          {chats.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">还没有保存的对话</p>
          ) : (
            <ul className="space-y-0.5">
              {chats.map((chat) => {
                const current = chat.id === currentId;
                return (
                  <li key={chat.id} className={cn("flex items-center gap-1 rounded-xl pr-1 transition hover:bg-muted", current && "bg-accent hover:bg-accent")}>
                    <button
                      type="button"
                      aria-current={current ? "true" : undefined}
                      onClick={() => onSelect(chat.id)}
                      className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left"
                    >
                      <span className={cn("w-full truncate text-sm", current && "font-medium text-accent-foreground")}>{chat.title}</span>
                      <span className="text-xs text-muted-foreground">{formatTime(chat.updatedAt)}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`删除对话：${chat.title}`}
                      onClick={() => onDelete(chat.id)}
                      className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-background hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t px-4 pt-2 pb-safe">
          <button
            type="button"
            onClick={onPrivacy}
            className="flex items-center gap-1.5 rounded-lg px-1 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
          >
            <ShieldCheck className="size-3.5" />
            隐私说明
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
