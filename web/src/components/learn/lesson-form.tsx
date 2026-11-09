"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { getClientId } from "@/components/chat/storage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { site } from "@/lib/config";
import { LEVELS, MINUTES, type Level, type Minutes, type RequestedGrounding } from "@/lib/learn/schema";
import { upsertLocalLesson } from "./learn-storage";
import styles from "./learn.module.css";

const MAX_TOPIC = 200;

const GROUNDING_OPTIONS: { value: RequestedGrounding; label: string; hint: string }[] = [
  { value: "auto", label: "自动", hint: "和学校有关就查校园资料，否则按通用知识讲" },
  { value: "campus", label: "校园资料", hint: "只用校园资料里查到的内容讲，查不到再改按通用知识" },
  { value: "general", label: "通用知识", hint: "不查校园资料，按通用知识讲" },
];

function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-9 shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className={`${styles.seg} flex-1`} role="group" aria-label={label}>
        {options.map((option) => (
          <button key={String(option.value)} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// 课堂首页的表单：写下想学的主题，选时长、难度和依据，点「开始备课」
export function LessonForm() {
  const router = useRouter();
  const topicId = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [topic, setTopic] = useState("");
  const [minutes, setMinutes] = useState<Minutes>(10);
  const [level, setLevel] = useState<Level>("入门");
  const [grounding, setGrounding] = useState<RequestedGrounding>("auto");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const trimmed = topic.trim();
  const canSubmit = trimmed.length >= 2 && !submitting;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/learn/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Id": getClientId() },
        body: JSON.stringify({ topic: trimmed, minutes, level, grounding }),
      });
      const data = (await response.json().catch(() => ({}))) as { id?: string; status?: "generating" | "ready" | "failed"; error?: string };
      if (!response.ok || !data.id) {
        setError(data.error ?? "创建失败，请稍后再试");
        setSubmitting(false);
        return;
      }
      upsertLocalLesson({ id: data.id, title: trimmed.slice(0, 30), topic: trimmed, createdAt: Date.now(), status: data.status ?? "generating" });
      router.push(`/learn/${data.id}`);
    } catch {
      setError("网络好像断了，检查一下网络再试");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Textarea
          id={topicId}
          ref={textarea}
          value={topic}
          onChange={(event) => setTopic(event.target.value.slice(0, MAX_TOPIC))}
          rows={3}
          maxLength={MAX_TOPIC}
          placeholder="想学什么？例如：图书馆怎么借书、续借和还书"
          aria-label="想学的主题"
          className="min-h-24 rounded-2xl bg-card text-[15px]"
        />
        <p className="text-right text-xs text-muted-foreground">
          {topic.length}/{MAX_TOPIC}
        </p>
      </div>

      <div className={styles.chips} role="group" aria-label="示例主题">
        {site.learn.examples.map((example) => (
          <button
            key={example}
            type="button"
            className={styles.chip}
            onClick={() => {
              setTopic(example);
              textarea.current?.focus();
            }}
          >
            {example}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        <Segmented label="时长" value={minutes} onChange={setMinutes} options={MINUTES.map((value) => ({ value, label: `${value} 分钟` }))} />
        <Segmented label="难度" value={level} onChange={setLevel} options={LEVELS.map((value) => ({ value, label: value }))} />
        <Segmented label="依据" value={grounding} onChange={setGrounding} options={GROUNDING_OPTIONS} />
        <p className="pl-12 text-xs leading-5 text-muted-foreground">{GROUNDING_OPTIONS.find((option) => option.value === grounding)?.hint}</p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-12 text-base" disabled={!canSubmit}>
        {submitting ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
        {submitting ? "正在提交…" : "开始备课"}
      </Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">约需 1 分钟。拿到链接的人都能看到这节课，请不要填写个人隐私。</p>
    </form>
  );
}
