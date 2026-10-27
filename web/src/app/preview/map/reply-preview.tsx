"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen, CalendarPlus, CheckSquare, Clock, Contact, MapPin, RotateCcw, Utensils } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { BrandAvatar } from "@/components/chat/brand-avatar";
import { CalendarCard } from "@/components/chat/calendar-card";
import { Composer } from "@/components/chat/composer";
import { ChatHeader } from "@/components/chat/header";
import { PlaceCard } from "@/components/chat/location-card";
import { UserMessage } from "@/components/chat/message";
import { ProcedureChecklist } from "@/components/chat/result-preview/checklist";
import { ContactCard } from "@/components/chat/result-preview/contact-card";
import { sampleEvent, sampleChecklist, sampleContact, sampleExam } from "@/components/chat/result-preview/preview-fixtures";
import { ExamMemo } from "@/components/chat/exam-memo";
import { FoodMenu } from "@/components/chat/result-preview/food-menu";
import { StudyCards } from "@/components/chat/result-preview/study-card";
import { campusFoods } from "@/lib/campus-food";
import { starterStudy } from "@/lib/campus-study";
import { cn } from "@/lib/utils";

const SCENES = [
  { id: "food", label: "找美食", icon: Utensils, prompt: "中午吃什么？预算 20 元，想看看图片。", intro: "先看看这几个选择。拖动预算、换一家，找到这顿想吃的。" },
  { id: "checklist", label: "办手续", icon: CheckSquare, prompt: "我准备复学，接下来要做哪些事？", intro: "我把资料里的流程拆成了清单。展开查看要求，办好一项就勾上一项。" },
  { id: "exam", label: "备考试", icon: Clock, prompt: "帮我把考试安排和考前准备放在一起。", intro: "时间和准备事项放在一张卡片里。试着修改日期，看看倒计时的变化。下面是演示安排。" },
  { id: "study", label: "学英语", icon: BookOpen, prompt: "想复习几个校园里常见的英语单词。", intro: "先用翻面卡记住单词，再做三道小测验，答完就能看到解析。" },
  { id: "contact", label: "找电话", icon: Contact, prompt: "招生咨询怎么联系？我想保存一下电话。", intro: "电话和地址整理好了。可以复制整张联系卡，也可以下载为手机联系人。" },
  { id: "map", label: "查地点", icon: MapPin, prompt: "图书馆在哪？带我去。", intro: "直接查看高德真实地图，确认地点后可打开高德导航。" },
  { id: "calendar", label: "加日历", icon: CalendarPlus, prompt: "把这条示例活动通知做成日历卡片。", intro: "这是现有的日历交互，放在一起方便比较。下面是示例活动，下载后可自行导入日历。" },
] as const;
type SceneId = (typeof SCENES)[number]["id"];

function guessScene(text: string): SceneId | null {
  if (/复学|休学|手续|材料|清单|办理|流程/.test(text)) return "checklist";
  if (/英语|单词|翻面|复习|测验/.test(text) && !/考试/.test(text)) return "study";
  if (/考试|考前|倒计时/.test(text)) return "exam";
  if (/联系|电话|招生/.test(text)) return "contact";
  if (/日历|活动|讲座|通知/.test(text)) return "calendar";
  if (/在哪|哪里|怎么走|怎么去|导航|带我去|地址/.test(text)) return "map";
  if (/吃|饭|面|预算|美食|餐/.test(text)) return "food";
  return null;
}

export function ReplyPreview() {
  const [scene, setScene] = useState<SceneId>("food");
  const [customPrompt, setCustomPrompt] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [unmatched, setUnmatched] = useState(false);
  const scrollArea = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = SCENES.find((item) => item.id === scene)!;

  useEffect(() => { scrollArea.current?.scrollTo({ top: 0, behavior: "instant" }); }, [scene, customPrompt]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setPlaying(false), 550);
    return () => window.clearTimeout(timer);
  }, [playing]);

  function selectScene(next: SceneId) { setScene(next); setCustomPrompt(null); setUnmatched(false); setPlaying(false); }
  function send(text: string) {
    if (!text.trim()) return;
    const next = guessScene(text);
    setCustomPrompt(text.trim());
    setUnmatched(!next);
    if (next) { setScene(next); setPlaying(true); }
  }
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % SCENES.length : event.key === "ArrowLeft" ? (index + SCENES.length - 1) % SCENES.length : event.key === "Home" ? 0 : event.key === "End" ? SCENES.length - 1 : null;
    if (next !== null) { event.preventDefault(); selectScene(SCENES[next].id); tabs.current[next]?.focus(); }
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <ChatHeader onNewChat={() => selectScene("food")} canReset />
      <div className="border-b bg-card">
        <div className="mx-auto w-full max-w-2xl px-4 pt-3 pb-2.5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Link href="/" className="inline-flex min-h-7 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />聊天首页</Link>
            <h1 className="text-[13px] font-medium">7 种互动回复 · 本地预览</h1>
          </div>
          <div role="tablist" aria-label="互动回复场景" className="grid grid-cols-4 gap-1 sm:grid-cols-7">
            {SCENES.map((item, index) => <button
              type="button" key={item.id} id={`scene-tab-${item.id}`} role="tab" aria-selected={scene === item.id}
              aria-controls={`scene-panel-${item.id}`} tabIndex={scene === item.id ? 0 : -1}
              ref={(element) => { tabs.current[index] = element; }} onKeyDown={(event) => onTabKey(event, index)} onClick={() => selectScene(item.id)}
              className={cn("flex min-h-10 items-center justify-center gap-1 rounded-lg px-1 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", scene === item.id ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
            ><item.icon className="size-3.5 shrink-0" />{item.label}</button>)}
          </div>
        </div>
      </div>
      <div ref={scrollArea} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-5 pb-8">
          <UserMessage message={{ id: `preview-user-${scene}`, role: "user", parts: [{ type: "text", text: customPrompt ?? current.prompt }] }} />
          <div className="flex gap-3">
            <BrandAvatar size="sm" glowing={playing} className="mt-0.5 self-start" />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-sm leading-7">{unmatched ? "这里是交互组件预览，还没有接入模型。可以点上方场景，或输入「20元吃什么」「保存电话」「复学流程」「复习单词」试试。" : current.intro}</p>
              {playing && <div role="status" className="flex min-h-32 items-center justify-center gap-2 rounded-2xl border border-dashed text-sm text-muted-foreground"><current.icon className="size-4 motion-safe:animate-pulse" />正在整理{current.label}的回复…</div>}
              <div hidden={playing || unmatched}>
                <section id="scene-panel-food" role="tabpanel" aria-labelledby="scene-tab-food" hidden={scene !== "food"}><FoodMenu items={campusFoods} /></section>
                <section id="scene-panel-checklist" role="tabpanel" aria-labelledby="scene-tab-checklist" hidden={scene !== "checklist"}><ProcedureChecklist data={sampleChecklist} /></section>
                <section id="scene-panel-exam" role="tabpanel" aria-labelledby="scene-tab-exam" hidden={scene !== "exam"}><ExamMemo data={sampleExam} preview /></section>
                <section id="scene-panel-study" role="tabpanel" aria-labelledby="scene-tab-study" hidden={scene !== "study"}><StudyCards data={starterStudy} /></section>
                <section id="scene-panel-contact" role="tabpanel" aria-labelledby="scene-tab-contact" hidden={scene !== "contact"}><ContactCard data={sampleContact} /></section>
                <section id="scene-panel-map" role="tabpanel" aria-labelledby="scene-tab-map" hidden={scene !== "map"}><PlaceCard place={{ name: "图书馆", kind: "library", address: "东莞城市学院校内", description: "在高德确认目的地后选择起点并导航。" }} /></section>
                <section id="scene-panel-calendar" role="tabpanel" aria-labelledby="scene-tab-calendar" hidden={scene !== "calendar"}><CalendarCard part={{ type: "tool-addToCalendar", toolCallId: "preview-calendar", state: "output-available", input: { events: [sampleEvent] }, output: { events: [sampleEvent] } }} /></section>
              </div>
              {!playing && !unmatched && <button type="button" onClick={() => setPlaying(true)} className="inline-flex min-h-8 items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary"><RotateCcw className="size-3" />重放生成效果</button>}
            </div>
          </div>
          <p className="ml-10 text-[11px] leading-5 text-muted-foreground">交互原型，不调用模型、不提交办理、不保存聊天。考试为示例数据；地图使用高德实时地点搜索。</p>
        </div>
      </div>
      <Composer busy={playing} visionEnabled={false} onSend={send} onStop={() => setPlaying(false)} />
    </div>
  );
}

