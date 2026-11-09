"use client";

import { BookOpen, NotebookPen, School } from "lucide-react";
import { createContext, Fragment, useContext, useMemo, useState, type ReactNode } from "react";
import { SourceSheet } from "@/components/chat/sources";
import type { SourceItem } from "@/lib/ai/types";
import type { Grounding, LessonSource } from "@/lib/learn/schema";
import { CITATION } from "@/lib/learn/scene-text";
import styles from "./learn.module.css";

// 课程里的出处：要点旁、闪卡、总结里的 [n] 角标，点开用聊天里同一个出处面板显示原文片段

const SourceContext = createContext<{ sources: LessonSource[]; open: (n: number) => void }>({ sources: [], open: () => {} });

function toSourceItem(source: LessonSource): SourceItem {
  return {
    n: source.n,
    id: `lesson-src-${source.n}`,
    title: source.title,
    heading: source.heading,
    snippet: source.snippet,
    url: source.url,
    updated: source.updated,
    kind: "knowledge",
  };
}

export function SourceProvider({ sources, children }: { sources: LessonSource[]; children: ReactNode }) {
  const [current, setCurrent] = useState<SourceItem | null>(null);
  const value = useMemo(
    () => ({
      sources,
      open: (n: number) => {
        const source = sources.find((item) => item.n === n);
        if (source) setCurrent(toSourceItem(source));
      },
    }),
    [sources],
  );
  return (
    <SourceContext.Provider value={value}>
      {children}
      <SourceSheet source={current} onClose={() => setCurrent(null)} />
    </SourceContext.Provider>
  );
}

// 在出处面板里打开第 n 条出处（提问抽屉里的 [n] 角标用）
export function useSourceOpener(): (n: number) => void {
  return useContext(SourceContext).open;
}

export function SourceBadge({ n }: { n: number }) {
  const { sources, open } = useContext(SourceContext);
  const source = sources.find((item) => item.n === n);
  if (!source) return null;
  return (
    <button type="button" className={styles.badge} aria-label={`查看出处 ${n}：${source.title}`} onClick={() => open(n)}>
      {n}
    </button>
  );
}

export function SourceBadges({ numbers }: { numbers: number[] }) {
  return (
    <>
      {numbers.map((n) => (
        <SourceBadge key={n} n={n} />
      ))}
    </>
  );
}

// 文字里的 [n] 换成可点击的角标；编号对不上资料的保持原样
export function RichText({ text }: { text: string }) {
  const { sources } = useContext(SourceContext);
  if (!sources.length) return <>{text}</>;
  const parts = text.split(CITATION);
  return (
    <>
      {parts.map((part, index) => {
        if (index % 2 === 0) return <Fragment key={index}>{part}</Fragment>;
        const n = Number(part);
        return sources.some((source) => source.n === n) ? <SourceBadge key={index} n={n} /> : <Fragment key={index}>{`[${part}]`}</Fragment>;
      })}
    </>
  );
}

// 把文字末尾的 [n] 拆出来（闪卡的卡面是一个按钮，里面不能再放按钮，角标放在卡片下面）
export function splitCitations(text: string): { text: string; numbers: number[] } {
  const numbers = [...text.matchAll(CITATION)].map((match) => Number(match[1]));
  return { text: text.replace(new RegExp(`\\s*${CITATION.source}`, "g"), "").trim(), numbers: [...new Set(numbers)] };
}

// 依据标注：告诉学习者这节课的内容从哪来
export function BasisLine({ grounding, sourceCount }: { grounding: Grounding; sourceCount: number }) {
  const Icon = grounding === "campus" ? School : grounding === "material" ? NotebookPen : BookOpen;
  const text =
    grounding === "campus"
      ? `依据：校园资料 ${sourceCount} 条 · 重要事项以学校官方通知为准`
      : grounding === "material"
        ? "依据：你提供的资料"
        : "依据：通用知识 · 仅供学习参考";
  return (
    <p className={styles.basis}>
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      {text}
    </p>
  );
}
