"use client";

import { CalendarPlus, Clock, Copy, MapPin, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CalendarEvent } from "@/lib/ai/tools";
import type { AppUIMessage } from "@/lib/ai/types";
import { describeEventTime, downloadIcs, eventToText } from "@/lib/ics";
import { cn } from "@/lib/utils";

type CalendarPart = Extract<AppUIMessage["parts"][number], { type: "tool-addToCalendar" }>;

const KIND_LABEL: Record<CalendarEvent["kind"], { label: string; className: string }> = {
  deadline: { label: "截止", className: "bg-primary/10 text-primary" },
  event: { label: "活动", className: "bg-chart-3/15 text-chart-3" },
  exam: { label: "考试", className: "bg-warning/15 text-warning" },
  class: { label: "上课", className: "bg-chart-4/15 text-chart-4" },
  other: { label: "日程", className: "bg-muted text-muted-foreground" },
};

const isWeChat = () => typeof navigator !== "undefined" && /MicroMessenger/i.test(navigator.userAgent);

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function addToCalendar(events: CalendarEvent[]) {
  if (isWeChat()) {
    // 微信内置浏览器不允许下载文件
    const copied = await copyText(events.map(eventToText).join("\n\n"));
    toast.info("微信里不能直接添加日历", {
      description: `${copied ? "已复制日程文字。" : ""}点右上角「…」选择「在浏览器打开」后再添加。`,
      duration: 6000,
    });
    return;
  }
  downloadIcs(events, events.length === 1 ? events[0].title : "校园日程");
  toast.success("已生成日历文件", { description: "打开它就能把日程和提醒加入手机日历" });
}

function EventCard({ event, index }: { event: CalendarEvent; index: number }) {
  const { month, day, weekday, range } = describeEventTime(event);
  const kind = KIND_LABEL[event.kind] ?? KIND_LABEL.other;

  return (
    <div
      style={{ animationDelay: `${index * 60}ms` }}
      className="animate-enter overflow-hidden rounded-2xl border bg-card shadow-sm"
    >
      <div className="flex gap-3.5 p-3.5">
        <div className="flex w-14 shrink-0 flex-col overflow-hidden rounded-xl border text-center">
          <div className="bg-primary py-0.5 text-[11px] font-medium text-primary-foreground">{month}月</div>
          <div className="pt-1.5 text-2xl leading-none font-semibold tabular-nums">{day}</div>
          <div className="pt-1 pb-1.5 text-[10.5px] text-muted-foreground">{weekday}</div>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <h4 className="leading-snug font-semibold">{event.title}</h4>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", kind.className)}>
              {kind.label}
            </span>
          </div>
          <Row icon={Clock}>{range}</Row>
          {event.location && <Row icon={MapPin}>{event.location}</Row>}
          {event.notes && <Row icon={NotebookPen}>{event.notes}</Row>}
        </div>
      </div>
      <div className="flex border-t">
        <button
          type="button"
          onClick={() => addToCalendar([event])}
          className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-primary transition hover:bg-accent active:bg-accent"
        >
          <CalendarPlus className="size-4" />
          加入日历
        </button>
        <div className="w-px bg-border" />
        <button
          type="button"
          onClick={async () => {
            if (await copyText(eventToText(event))) toast.success("已复制");
            else toast.error("复制失败，请长按选择文字");
          }}
          className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm text-muted-foreground transition hover:bg-accent active:bg-accent"
        >
          <Copy className="size-4" />
          复制
        </button>
      </div>
    </div>
  );
}

function Row({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 text-[13px] leading-5 text-muted-foreground">
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

export function CalendarCard({ part }: { part: CalendarPart }) {
  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed bg-card/60 p-3.5">
          <div className="size-14 animate-pulse rounded-xl bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="text-shimmer text-sm">正在整理日程…</div>
            <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      );
    case "output-error":
      return (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          日程没能生成：{part.errorText}
        </div>
      );
    case "output-available": {
      const events = part.output.events;
      return (
        <div className="space-y-2.5">
          {events.map((event, index) => (
            <EventCard key={event.id} event={event} index={index} />
          ))}
          {events.length > 1 && (
            <Button variant="outline" className="w-full rounded-xl" onClick={() => addToCalendar(events)}>
              <CalendarPlus />
              全部加入日历（{events.length} 个）
            </Button>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}
