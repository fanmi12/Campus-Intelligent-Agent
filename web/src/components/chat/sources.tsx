"use client";

import { ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { SourceItem } from "@/lib/ai/types";

export function SourceChips({ items, onOpen }: { items: SourceItem[]; onOpen: (item: SourceItem) => void }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-xs text-muted-foreground">参考资料</span>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpen(item)}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card/70 py-1 pr-2.5 pl-1 text-xs text-foreground/80 transition hover:border-primary/30 hover:bg-accent"
        >
          <span className="grid size-[1.15rem] shrink-0 place-items-center rounded-full bg-primary/10 text-[10.5px] font-semibold text-primary">
            {item.n}
          </span>
          <span className="truncate">
            {item.title}
            {item.heading ? ` · ${item.heading}` : ""}
          </span>
        </button>
      ))}
    </div>
  );
}

export function SourceSheet({ source, onClose }: { source: SourceItem | null; onClose: () => void }) {
  return (
    <Sheet open={source !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[80dvh] w-full max-w-2xl rounded-t-3xl pb-safe">
        {source && (
          <>
            <SheetHeader className="pr-12">
              <SheetTitle className="flex items-center gap-2 text-base">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {source.n}
                </span>
                《{source.title}》
              </SheetTitle>
              <SheetDescription>
                {[source.kind === "web" ? "联网来源" : null, source.heading, source.updated ? `${source.kind === "web" ? "网页发布于" : "资料更新于"} ${source.updated}` : null].filter(Boolean).join(" · ") ||
                  "校园资料"}
              </SheetDescription>
            </SheetHeader>
            <div className="overflow-y-auto px-4 pb-4">
              <p className="rounded-2xl bg-muted/60 p-4 text-sm leading-7 whitespace-pre-wrap">{source.snippet}</p>
              {source.url &&
                (/^https?:\/\/\S+$/.test(source.url) ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary"
                  >
                    查看原始出处 <ExternalLink className="size-3.5" />
                  </a>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                    出处：{source.url}
                  </p>
                ))}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
