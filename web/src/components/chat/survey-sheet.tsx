"use client";

import { Drawer } from "@base-ui/react/drawer";
import { ChevronDown, CircleCheck, ClipboardList, ExternalLink, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/config";
import { cn } from "@/lib/utils";
import type { Survey } from "./use-survey";

const { url, provider, questions, minutes } = site.survey;

// 问卷星交卷后会在 iframe 里跳到完成页，iframe 再触发一次 load，以此判断已提交。
// 打开后几秒内的跳转（重定向之类）不算，没人能这么快答完必答题。
const MIN_FILL_MS = 8000;
const SLOW_LOAD_MS = 10000;

// 手机上从底部拉起、可下滑收起；电脑上居中显示。用同一个 Drawer，
// 横竖屏切换时 iframe 不会被重建，填到一半的答案不丢（问卷星在 iframe 里不会提示恢复草稿）。
export function SurveySheet({ survey }: { survey: Survey }) {
  const { open, setOpen, mounted, submitted, startSurvey, markSubmitted } = survey;
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const firstLoadAt = useRef(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mounted || loaded) return;
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => clearTimeout(timer);
  }, [mounted, loaded]);

  function handleLoad() {
    if (!firstLoadAt.current) {
      firstLoadAt.current = Date.now();
      setLoaded(true);
      return;
    }
    if (!justSubmitted && Date.now() - firstLoadAt.current > MIN_FILL_MS) {
      setJustSubmitted(true);
      markSubmitted();
    }
  }

  // 以前提交过、这次还没点"再填一份"时，显示感谢页而不加载问卷
  const showThanks = !mounted && submitted;
  const done = justSubmitted || showThanks;

  return (
    <Drawer.Root open={open} onOpenChange={(next) => setOpen(next)}>
      <Drawer.Portal keepMounted={mounted}>
        <Drawer.Backdrop className="fixed inset-0 z-50 bg-black/45 opacity-[calc(1_-_var(--drawer-swipe-progress,0))] transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 motion-reduce:transition-none dark:bg-black/65" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center outline-none sm:items-center sm:p-8">
          <Drawer.Popup
            initialFocus={closeRef}
            className={cn(
              // 手机：约 92% 屏高的底部抽屉，下方多出 3rem 防止上拉时露底
              "relative -mb-12 flex h-[calc(92dvh_+_3rem)] w-full flex-col overflow-hidden rounded-t-[1.75rem] border-t bg-card pb-[calc(3rem_+_env(safe-area-inset-bottom))] text-card-foreground shadow-[0_-16px_48px_-24px_rgb(0_0_0/0.35)] outline-none",
              "[transform:translateY(var(--drawer-swipe-movement-y))] transition-[translate,scale,opacity,transform] duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
              "data-starting-style:translate-y-full data-ending-style:translate-y-full data-ending-style:duration-[calc(var(--drawer-swipe-strength,1)_*_400ms)] data-swiping:duration-0 data-swiping:select-none",
              // 电脑：最宽 680px 的居中弹窗，淡入缩放
              "sm:mb-0 sm:h-[min(820px,100%)] sm:max-w-[680px] sm:rounded-[1.75rem] sm:border sm:pb-0 sm:shadow-2xl",
              "sm:data-starting-style:translate-y-0 sm:data-ending-style:translate-y-0 sm:data-starting-style:scale-95 sm:data-ending-style:scale-95 sm:data-starting-style:opacity-0 sm:data-ending-style:opacity-0 sm:duration-200",
              "motion-reduce:transition-none",
            )}
          >
            <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25 sm:hidden" />
            <Drawer.Content className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center gap-3 border-b px-4 pt-2 pb-3 sm:px-5 sm:py-4">
                <span aria-hidden className="hidden size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground sm:grid">
                  <ClipboardList className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1 pl-1 sm:pl-0">
                  <Drawer.Title className="text-[15px] leading-5 font-semibold">体验问卷</Drawer.Title>
                  <Drawer.Description
                    className={cn("mt-0.5 flex items-center gap-1 text-xs leading-5", done ? "text-success" : "text-muted-foreground")}
                  >
                    {done ? (
                      <>
                        <CircleCheck className="size-3.5 shrink-0" aria-hidden />
                        已提交，谢谢你的反馈
                      </>
                    ) : (
                      `${questions} 题，约 ${minutes} 分钟 · 由${provider}收集`
                    )}
                  </Drawer.Description>
                </div>
                {mounted && !justSubmitted && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="在新页面打开问卷"
                    title="在新页面打开问卷（这里已填的内容不会带过去）"
                    className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground")}
                  >
                    <ExternalLink />
                  </a>
                )}
                <Drawer.Close
                  ref={closeRef}
                  render={<Button variant={justSubmitted ? "default" : "ghost"} size="sm" className={cn(!justSubmitted && "text-muted-foreground")} />}
                >
                  {justSubmitted ? (
                    "完成"
                  ) : (
                    <>
                      <ChevronDown className="sm:hidden" aria-hidden />
                      <X className="hidden sm:block" aria-hidden />
                      收起
                    </>
                  )}
                </Drawer.Close>
              </div>

              <div className="relative min-h-0 flex-1">
                {showThanks && (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
                    <span aria-hidden className="grid size-14 place-items-center rounded-full bg-success/10 text-success">
                      <CircleCheck className="size-7" />
                    </span>
                    <p className="text-base font-semibold">已经收到你的问卷，谢谢！</p>
                    <p className="max-w-xs text-sm leading-6 text-muted-foreground">之后有了新的想法，也可以再填一份。</p>
                    <div className="mt-2 flex gap-2">
                      <Button variant="outline" onClick={startSurvey}>
                        再填一份
                      </Button>
                      <Drawer.Close render={<Button />}>回到对话</Drawer.Close>
                    </div>
                  </div>
                )}

                {mounted && (
                  <>
                    <iframe
                      src={url}
                      title={`${site.name}体验问卷`}
                      onLoad={handleLoad}
                      className="absolute inset-0 size-full border-0 bg-white [color-scheme:light]"
                    />
                    {!loaded && (
                      <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card px-8 text-center text-sm text-muted-foreground">
                        <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
                        <p>{slow ? "问卷加载有点慢，可以再等等，或者在新页面打开" : "正在打开问卷…"}</p>
                        {slow && (
                          <a href={url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                            <ExternalLink />
                            在新页面打开
                          </a>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
