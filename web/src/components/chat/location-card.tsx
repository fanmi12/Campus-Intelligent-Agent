"use client";

import { ArrowUpRight, BookOpen, Check, ChevronDown, Copy, LocateFixed, MapPin, Navigation, School, Utensils, X } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import type { AppUIMessage } from "@/lib/ai/types";
import { amapNavigationUrl, amapSearchUrl, placeSearchText, type CampusPlace, type MapPoi } from "@/lib/campus-map";
import { cn } from "@/lib/utils";
import styles from "./location-card.module.css";
import { CampusMapView } from "./campus-map-view";

type LocationPart = Extract<AppUIMessage["parts"][number], { type: "tool-showCampusMap" }>;
const KIND = {
  campus: { label: "校园", icon: School }, library: { label: "图书馆", icon: BookOpen },
  dining: { label: "餐饮", icon: Utensils }, building: { label: "教学办公", icon: School },
  other: { label: "校园地点", icon: MapPin },
};

export function PlaceCard({ place }: { place: CampusPlace }) {
  const [resolved, setResolved] = useState<MapPoi>();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const helpId = useId();
  const { label, icon: Icon } = KIND[place.kind] ?? KIND.other;

  async function copyPlace() {
    try {
      await navigator.clipboard.writeText([resolved?.name ?? placeSearchText(place), resolved?.address ?? place.address].filter(Boolean).join("\n"));
      setCopied(true);
      toast.success("已复制地点，可以粘贴到地图中搜索");
    } catch { toast.error("复制失败，可以长按下方地点文字复制"); }
  }

  return (
    <article className={styles.card} aria-label={`${place.name}地点卡片`}>
      <div className="relative">
        <CampusMapView key={place.name} place={place} expanded={expanded} onResolve={setResolved} />
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-label={expanded ? "收起地图" : "展开地图"} className={styles.expandButton}>
          {expanded ? <X className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
        </button>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h4 className="min-w-0 text-[17px] leading-6 font-semibold break-words">{place.name}</h4>
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"><Icon className="size-3" />{label}</span>
          </div>
          {(resolved?.address || place.address) && <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-5 text-muted-foreground"><MapPin className="mt-0.5 size-3.5 shrink-0" /><span>{resolved?.address || place.address}</span></p>}
          {resolved && <p className="mt-1.5 text-xs text-muted-foreground">高德地点：{resolved.name}</p>}
          {place.description && <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{place.description}</p>}
        </div>
        <div className={styles.origin}>
          <LocateFixed className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1"><p className="text-[13px] font-medium">从哪里出发？</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">打开高德后使用当前位置，或手动选择起点</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={resolved ? amapNavigationUrl(resolved) : amapSearchUrl(place)} target="_blank" rel="noopener noreferrer" className={styles.navigate} aria-label={`去${place.name}，在高德中确认地点并导航`}>
            <Navigation className="size-4" />去这里<ArrowUpRight className="ml-auto size-4 opacity-75" />
          </a>
          <button type="button" className={styles.copy} onClick={copyPlace}>{copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}{copied ? "已复制" : "复制地点"}</button>
        </div>
        <div className="border-t pt-2.5">
          <button type="button" aria-expanded={showHelp} aria-controls={helpId} onClick={() => setShowHelp((value) => !value)} className={styles.helpButton}>网页不获取你的位置<ChevronDown className={cn("size-3.5 transition-transform motion-reduce:transition-none", showHelp && "rotate-180")} /></button>
          <p id={helpId} hidden={!showHelp} className="mt-2 text-xs leading-6 text-muted-foreground">地图展示高德返回的地点，未匹配到时可以打开高德继续搜索。点击「去这里」后在高德确认起点和路线；定位授权由高德处理，也可以手动输入起点。微信里无法打开时，可复制地点到地图 App 搜索。</p>
        </div>
      </div>
    </article>
  );
}

export function LocationCard({ part }: { part: LocationPart }) {
  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return <div role="status" className="flex items-center gap-3 rounded-2xl border border-dashed bg-card p-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary"><MapPin className="size-5 motion-safe:animate-pulse" /></span><div><p className="text-sm font-medium">正在整理地点…</p><p className="mt-1 text-xs text-muted-foreground">为你准备地图入口</p></div></div>;
    case "output-error":
      return <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm leading-6 text-destructive">地点卡片没能生成，请重新提问，或在地图中搜索地点名称。</div>;
    case "output-available":
      return <div className="space-y-3">{part.output.places.map((place, index) => <PlaceCard key={`${place.name}-${index}`} place={place} />)}</div>;
    default: return null;
  }
}
