"use client";

import { AGENTS } from "@/lib/learn/agents";
import type { Lesson, LessonScene } from "@/lib/learn/schema";
import { AgentAvatar } from "../agent-avatar";
import styles from "../learn.module.css";
import { SceneHeader } from "./scene-header";

// 课堂讨论页。Phase 1 只显示问题和 AI 同学的开场发言（旧数据里可能已有讨论页），互动讨论在 Phase 2 接入
export function DiscussionScene({ scene }: { scene: Extract<LessonScene, { kind: "discussion" }>; lesson: Lesson }) {
  const content = scene.content!;
  return (
    <div className="flex flex-col gap-4">
      <SceneHeader kind="discussion" title={scene.title} />
      <div className={styles.panel}>
        <p className="text-[16.5px] leading-[1.75] font-semibold">{content.question}</p>
        <p className={`${styles.muted} mt-1`}>{content.context}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {content.opening.map((turn, index) => (
          <li key={index} className="flex items-start gap-2.5">
            <AgentAvatar agent={turn.agent} />
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs text-muted-foreground">
                {AGENTS[turn.agent].name} · {AGENTS[turn.agent].role}
              </p>
              <div className={styles.bubble}>{turn.text}</div>
            </div>
          </li>
        ))}
      </ul>
      <p className={styles.muted}>讨论功能即将开放，现在先看看他们怎么说。</p>
    </div>
  );
}
