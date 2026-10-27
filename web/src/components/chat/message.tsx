"use client";

import {
  AlertTriangle,
  BookOpenCheck,
  Check,
  ChevronDown,
  Copy,
  Globe,
  ImageIcon,
  Loader2,
  RotateCcw,
  ScanText,
  SearchX,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { AppDataParts, AppUIMessage, SourceItem } from "@/lib/ai/types";
import { formatAnswerCitations } from "@/lib/ai/citations";
import { cn } from "@/lib/utils";
import { BrandAvatar } from "./brand-avatar";
import { CalendarCard } from "./calendar-card";
import { Spark } from "./glow";
import { Markdown } from "./markdown";
import { LocationCard } from "./location-card";
import { RichResult } from "./rich-result";
import { SourceChips, SourceSheet } from "./sources";

type Part = AppUIMessage["parts"][number];

function dataOf<K extends keyof AppDataParts>(message: AppUIMessage, name: K): AppDataParts[K] | undefined {
  const part = message.parts.find((p) => p.type === `data-${name}`) as { data: AppDataParts[K] } | undefined;
  return part?.data;
}

const textOf = (message: AppUIMessage) => {
  const text = message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n")
    .trim();
  return message.role === "assistant" ? formatAnswerCitations(text, dataOf(message, "sources")?.items ?? []) : text;
};

export function UserMessage({ message }: { message: AppUIMessage }) {
  const text = textOf(message);
  const images = message.parts.filter((part) => part.type === "file");
  return (
    <div className="animate-enter flex justify-end">
      <div className="flex max-w-[85%] flex-col items-end gap-1.5">
        {images.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {images.map((image, index) =>
              image.type === "file" && image.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- 本地压缩后的 data URL，不需要 next/image 优化
                <img
                  key={index}
                  src={image.url}
                  alt="用户上传的图片"
                  className="h-28 w-auto max-w-48 rounded-2xl border object-cover"
                />
              ) : (
                <div
                  key={index}
                  className="grid size-20 place-items-center rounded-2xl border bg-muted text-muted-foreground"
                  title="图片未保存在本地"
                >
                  <ImageIcon className="size-5" />
                </div>
              ),
            )}
          </div>
        )}
        {text && (
          <div className="rounded-3xl rounded-br-lg bg-primary px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-primary-foreground shadow-sm [overflow-wrap:anywhere]">
            {text}
          </div>
        )}
      </div>
    </div>
  );
}

function VisionStep({ data }: { data: AppDataParts["vision"] }) {
  const [open, setOpen] = useState(false);
  if (data.status === "loading") {
    return (
      <StepRow icon={<Loader2 className="size-3.5 animate-spin" />}>
        <span className="text-shimmer">正在识别 {data.images} 张图片…</span>
      </StepRow>
    );
  }
  if (data.status === "error") {
    return (
      <StepRow icon={<AlertTriangle className="size-3.5 text-warning" />}>
        图片没能识别（可能没有开启识图功能）
      </StepRow>
    );
  }
  return (
    <div>
      <button type="button" onClick={() => setOpen((value) => !value)} className="group/step">
        <StepRow icon={<ScanText className="size-3.5 text-success" />}>
          已识别图片中的文字
          <ChevronDown className={cn("size-3.5 transition", open && "rotate-180")} />
        </StepRow>
      </button>
      {open && data.text && (
        <pre
          className="animate-enter mt-1.5 max-h-60 overflow-y-auto rounded-xl border bg-muted/50 p-3 font-sans text-[13px] leading-6 whitespace-pre-wrap text-muted-foreground"
        >
          {data.text}
        </pre>
      )}
    </div>
  );
}

function StepRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1 text-xs text-muted-foreground">
      {icon}
      {children}
    </div>
  );
}

function Thinking({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
      <Spark />
      {label && <span className="text-shimmer">{label}</span>}
    </div>
  );
}

export function ThinkingMessage() {
  return (
    <div className="animate-fade flex gap-3">
      <BrandAvatar size="sm" glowing className="mt-0.5 self-start" />
      <Thinking label="正在查阅校园资料…" />
    </div>
  );
}

function FeedbackButtons({ message, onRegenerate }: { message: AppUIMessage; onRegenerate?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState<1 | -1 | null>(null);

  async function sendFeedback(value: 1 | -1) {
    const next = rating === value ? null : value;
    setRating(next);
    if (next === null) return;
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.id, rating: next }),
      });
      if (!response.ok) throw new Error();
      toast.success(next === 1 ? "谢谢你的肯定！" : "收到，我们会尽快补充这部分资料");
    } catch {
      toast.error("反馈没提交成功，稍后再试");
    }
  }

  const buttonClass =
    "grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground";

  return (
    <div className="-ml-1.5 flex items-center gap-0.5 opacity-80 transition group-hover:opacity-100">
      <button
        type="button"
        aria-label="复制回答"
        className={buttonClass}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(textOf(message));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            toast.error("复制失败");
          }
        }}
      >
        {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
      </button>
      <button
        type="button"
        aria-label="有帮助"
        aria-pressed={rating === 1}
        className={cn(buttonClass, rating === 1 && "text-primary")}
        onClick={() => sendFeedback(1)}
      >
        <ThumbsUp className={cn("size-4", rating === 1 && "fill-current")} />
      </button>
      <button
        type="button"
        aria-label="没帮助"
        aria-pressed={rating === -1}
        className={cn(buttonClass, rating === -1 && "text-primary")}
        onClick={() => sendFeedback(-1)}
      >
        <ThumbsDown className={cn("size-4", rating === -1 && "fill-current")} />
      </button>
      {onRegenerate && (
        <button type="button" aria-label="重新回答" className={buttonClass} onClick={onRegenerate}>
          <RotateCcw className="size-4" />
        </button>
      )}
    </div>
  );
}

export function AssistantMessage({
  message,
  streaming,
  onRegenerate,
  feedbackEnabled = true,
}: {
  message: AppUIMessage;
  streaming: boolean;
  onRegenerate?: () => void;
  feedbackEnabled?: boolean;
}) {
  const [openSource, setOpenSource] = useState<SourceItem | null>(null);
  const vision = dataOf(message, "vision");
  const sources = dataOf(message, "sources");
  const queue = dataOf(message, "queue");
  const webSteps = message.parts.filter((part) => part.type === "data-webSearch");
  const knowledgeCount = sources?.items.filter((item) => item.kind !== "web").length ?? 0;
  const text = textOf(message);

  // 只展示回答里真正引用到的资料
  const numbers = new Set([...text.matchAll(/\[(\d{1,2})\]/g)].map((match) => Number(match[1])));
  const cited = sources?.items.filter((item) => numbers.has(item.n)) ?? [];
  const citedNumbers = cited.map((item) => item.n);

  const hasContent = message.parts.some(
    (part: Part) => (part.type === "text" && part.text.trim()) || part.type.startsWith("tool-"),
  );
  const openByNumber = (n: number) => setOpenSource(sources?.items.find((item) => item.n === n) ?? null);

  return (
    <div className="group animate-enter flex gap-3">
      <BrandAvatar size="sm" glowing={streaming} className="mt-0.5 self-start" />
      <div className="min-w-0 flex-1 space-y-3">
        {(vision || sources || webSteps.length > 0) && (
          <div className="flex flex-wrap items-start gap-1.5">
            {vision && <VisionStep data={vision} />}
            {sources && knowledgeCount > 0 &&
              (sources.lowConfidence ? (
                <StepRow icon={<SearchX className="size-3.5 text-warning" />}>资料库里没找到很匹配的内容</StepRow>
              ) : (
                <StepRow icon={<BookOpenCheck className="size-3.5 text-success" />}>
                  查阅了 {knowledgeCount} 条校园资料
                </StepRow>
              ))}
            {webSteps.map((part, index) => (
              <div key={part.id ?? index} role="status" aria-live="polite" title={part.data.query}>
                <StepRow icon={part.data.status === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : part.data.status === "error" ? <AlertTriangle className="size-3.5 text-warning" /> : <Globe className="size-3.5 text-success" />}>
                  {part.data.status === "error" ? part.data.error : part.data.status === "loading" ? (part.data.action === "search" ? "正在联网搜索…" : "正在读取网页…") : part.data.action === "search" ? (part.data.count ? `联网找到 ${part.data.count} 条结果` : "联网未找到相关结果") : "已读取网页正文"}
                </StepRow>
              </div>
            ))}
          </div>
        )}

        {message.parts.map((part, index) => {
          if (part.type === "text") {
            return part.text.trim() ? (
              <Markdown key={index} text={formatAnswerCitations(part.text, sources?.items ?? [])} citations={citedNumbers} onCite={openByNumber} />
            ) : null;
          }
          if (part.type === "tool-addToCalendar") {
            return <CalendarCard key={part.toolCallId} part={part} />;
          }
          if (part.type === "tool-showCampusMap") {
            return <LocationCard key={part.toolCallId} part={part} />;
          }
          if (part.type === "tool-recommendCampusFood" || part.type === "tool-buildChecklist" || part.type === "tool-buildStudyCards" || part.type === "tool-showContactCard" || part.type === "tool-buildExamMemo") {
            return <RichResult key={part.toolCallId} part={part} />;
          }
          return null;
        })}

        {streaming && !hasContent && (
          queue?.status === "waiting" ? (
            <div role="status" aria-live="polite" className="rounded-2xl border bg-muted/50 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium"><Loader2 className="size-4 animate-spin" />人有点多，已为你排队</div>
              <p className="mt-2 text-muted-foreground">当前排第 {queue.position} 位，共 {queue.waiting} 人等待。轮到后会自动回答，请保持页面打开。</p>
              <p className="mt-1 text-xs text-muted-foreground">点击下方停止按钮可取消排队。</p>
            </div>
          ) : <Thinking label={vision?.status === "loading" ? undefined : "正在组织回答…"} />
        )}

        {!streaming && cited.length > 0 && <SourceChips items={cited} onOpen={setOpenSource} />}
        {!streaming && hasContent && feedbackEnabled && <FeedbackButtons message={message} onRegenerate={onRegenerate} />}
      </div>
      <SourceSheet source={openSource} onClose={() => setOpenSource(null)} />
    </div>
  );
}
