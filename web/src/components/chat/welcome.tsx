"use client";

import { BookOpen, CalendarPlus, CheckSquare, Contact, MapPin, ShieldCheck, Utensils, type LucideIcon } from "lucide-react";
import { site, type SuggestionIcon } from "@/lib/config";
import { BrandAvatar } from "./brand-avatar";

const ICONS: Record<SuggestionIcon, LucideIcon> = {
  map: MapPin,
  calendar: CalendarPlus,
  food: Utensils,
  checklist: CheckSquare,
  study: BookOpen,
  contact: Contact,
};

function greeting(hour: number) {
  if (hour < 5) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

export function Welcome({ onSelect, onPrivacy }: { onSelect: (prompt: string) => void; onPrivacy: () => void }) {
  return (
    <div className="flex flex-col items-center pt-6 sm:pt-14">
      <div className="animate-pop relative isolate">
        <div className="hero-halo -z-10" />
        <BrandAvatar size="lg" />
      </div>

      <div className="animate-enter mt-5 text-center [animation-delay:60ms]">
        <h1 className="text-glow text-[1.75rem] leading-tight font-semibold tracking-tight">
          {greeting(new Date().getHours())}，同学
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          我是{site.name}。帮你查校园资料、选餐食、整理办事清单；通知、电话和复习内容，也能变成可操作的卡片。
        </p>
      </div>

      <div className="mt-8 grid w-full grid-cols-2 gap-2.5">
        {site.suggestions.map((suggestion, index) => {
          const Icon = ICONS[suggestion.icon];
          return (
            <button
              key={suggestion.title}
              type="button"
              onClick={() => onSelect(suggestion.prompt)}
              style={{ animationDelay: `${120 + index * 50}ms` }}
              className="glow-card animate-enter flex flex-col items-start gap-2 rounded-2xl border bg-card/80 p-3.5 text-left shadow-xs backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-transparent hover:shadow-md active:translate-y-0"
            >
              <span className="grid size-8 place-items-center rounded-xl bg-accent text-accent-foreground">
                <Icon className="size-4" />
              </span>
              <span className="text-sm font-medium">{suggestion.title}</span>
              <span className="line-clamp-2 text-xs leading-5 text-muted-foreground">{suggestion.prompt}</span>
            </button>
          );
        })}
      </div>

      <p
        style={{ animationDelay: `${120 + site.suggestions.length * 50}ms` }}
        className="animate-enter mt-5 flex max-w-sm items-start gap-1.5 text-xs leading-5 text-muted-foreground"
      >
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        <span>
          提问会匿名记录，用于补充校园资料；请不要输入身份证号、密码等敏感信息。
          <button type="button" onClick={onPrivacy} className="underline underline-offset-2 transition hover:text-foreground">
            隐私说明
          </button>
        </span>
      </p>
    </div>
  );
}
