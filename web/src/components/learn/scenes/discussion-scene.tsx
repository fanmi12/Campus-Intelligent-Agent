"use client";

import { useEffect, useRef } from "react";
import { AGENTS } from "@/lib/learn/agents";
import type { Lesson, LessonScene } from "@/lib/learn/schema";
import { AgentAvatar } from "../agent-avatar";
import { ChatInput } from "../chat-input";
import { updateProgress, useProgress } from "../learn-storage";
import styles from "../learn.module.css";
import { type ChatTurn, useDiscussion } from "../use-discussion";
import { SceneHeader } from "./scene-header";

const MAX_SAVED = 20;

function Turn({ turn }: { turn: ChatTurn }) {
  if (turn.agent === "user") {
    return (
      <li className="flex justify-end">
        <div className={`${styles.bubble} max-w-[85%]`} data-self="true">
          {turn.text}
        </div>
      </li>
    );
  }
  const info = AGENTS[turn.agent];
  return (
    <li className="flex items-start gap-2.5">
      <AgentAvatar agent={turn.agent} />
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs text-muted-foreground">
          {info.name} · {info.role}
        </p>
        <div className={styles.bubble}>
          {turn.text || <span className="text-muted-foreground">正在想…</span>}
          {turn.streaming && turn.text && <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-current" aria-hidden />}
        </div>
      </div>
    </li>
  );
}

// 课堂讨论页：AI 同学先抛观点，学习者发言后，AI 同学和狮老师依次回应（流式）
export function DiscussionScene({ scene, lesson }: { scene: Extract<LessonScene, { kind: "discussion" }>; lesson: Lesson }) {
  const content = scene.content!;
  const saved = useProgress(lesson.id).discussion[scene.id];
  const { turns, busy, queue, error, send, stop } = useDiscussion({
    lessonId: lesson.id,
    sceneId: scene.id,
    mode: "discuss",
    initial: saved,
    onSettled: (all) =>
      updateProgress(lesson.id, (progress) => ({
        ...progress,
        discussion: { ...progress.discussion, [scene.id]: all.slice(-MAX_SAVED) },
        completed: all.some((turn) => turn.agent === "user") && !progress.completed.includes(scene.id) ? [...progress.completed, scene.id] : progress.completed,
      })),
  });

  // 有新发言就滚到底
  const bottom = useRef<HTMLDivElement>(null);
  const last = turns.at(-1);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns.length, last?.text.length]);

  return (
    <>
      <div className="flex flex-1 flex-col gap-4">
        <SceneHeader kind="discussion" title={scene.title} />
        <div className={styles.panel}>
          <p className="text-[16.5px] leading-[1.75] font-semibold">{content.question}</p>
          <p className={`${styles.muted} mt-1`}>{content.context}</p>
        </div>
        <ul className="flex flex-col gap-3" aria-live="polite" aria-label="课堂讨论">
          {content.opening.map((turn, index) => (
            <Turn key={`opening-${index}`} turn={{ id: `opening-${index}`, agent: turn.agent, text: turn.text }} />
          ))}
          {turns.map((turn) => (
            <Turn key={turn.id} turn={turn} />
          ))}
        </ul>
        {busy && last?.agent === "user" && (
          <p className={styles.muted} role="status">
            {queue > 0 ? `人有点多，排队中，前面还有 ${queue} 位…` : "同学们在想…"}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div ref={bottom} />
      </div>
      <ChatInput busy={busy} placeholder="说说你的看法…" onSend={send} onStop={stop} className="sticky bottom-0" />
    </>
  );
}
