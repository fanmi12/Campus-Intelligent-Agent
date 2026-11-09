"use client";

import { Eraser } from "lucide-react";
import { useEffect, useRef } from "react";
import { Markdown } from "@/components/chat/markdown";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Lesson, LessonScene } from "@/lib/learn/schema";
import { AgentAvatar } from "./agent-avatar";
import { ChatInput } from "./chat-input";
import styles from "./learn.module.css";
import { useSourceOpener } from "./source-badges";
import { useDiscussion } from "./use-discussion";

const SUGGESTIONS = ["这一页的重点是什么？", "能举个例子吗？", "我容易在哪里出错？"];

// 问狮老师：就当前页提问的底部抽屉。回答里的 [n] 是出处角标，点开能看到资料原文
export function AskTeacher({ lesson, scene, open, onOpenChange }: { lesson: Lesson; scene: LessonScene; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { turns, busy, queue, error, send, stop, clear } = useDiscussion({ lessonId: lesson.id, sceneId: scene.id, mode: "ask" });
  const openSource = useSourceOpener();
  const valid = new Set(lesson.sources.map((source) => source.n));
  // 只显示最近 6 组问答
  const shown = turns.slice(-12);

  const bottom = useRef<HTMLDivElement>(null);
  const last = turns.at(-1);
  useEffect(() => {
    if (open) bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open, turns.length, last?.text.length]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto flex h-[82dvh] w-full max-w-2xl flex-col gap-0 rounded-t-3xl p-0">
        <SheetHeader className="shrink-0 gap-0.5 border-b px-4 py-3 pr-14">
          <SheetTitle className="text-base">问狮老师</SheetTitle>
          <SheetDescription className="truncate text-xs">就「{scene.title}」这一页提问；回答里的数字角标可以点开看出处</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {shown.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm leading-6 text-muted-foreground">不懂的地方、想多了解一点的，都可以问我。</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} type="button" className={styles.chip} disabled={busy} onClick={() => void send(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-4" aria-live="polite" aria-label="提问记录">
              {shown.map((turn) =>
                turn.agent === "user" ? (
                  <li key={turn.id} className="flex justify-end">
                    <div className={`${styles.bubble} max-w-[85%]`} data-self="true">
                      {turn.text}
                    </div>
                  </li>
                ) : (
                  <li key={turn.id} className="flex items-start gap-2.5">
                    <AgentAvatar agent="teacher" />
                    <div className="min-w-0 flex-1 rounded-2xl border bg-card px-3.5 py-2.5">
                      {turn.text ? (
                        <Markdown
                          text={turn.text}
                          citations={[...turn.text.matchAll(/\[(\d{1,2})\]/g)].map((match) => Number(match[1])).filter((n) => valid.has(n))}
                          onCite={openSource}
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">正在想…</span>
                      )}
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}
          {busy && last?.agent === "user" && (
            <p className={`${styles.muted} mt-3`} role="status">
              {queue > 0 ? `人有点多，排队中，前面还有 ${queue} 位…` : "狮老师在想…"}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div ref={bottom} />
        </div>

        <div className="pb-safe shrink-0 border-t px-3 pt-2">
          {turns.length > 0 && (
            <div className="mb-1 flex justify-end">
              <Button variant="ghost" size="xs" onClick={clear} disabled={busy}>
                <Eraser />
                清空记录
              </Button>
            </div>
          )}
          <ChatInput busy={busy} placeholder="就这一页向狮老师提问…" onSend={send} onStop={stop} className="mt-0" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
