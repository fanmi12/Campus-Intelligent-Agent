"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, ExternalLink, Heart, MapPin, SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";
import type { CampusFood } from "@/lib/campus-food";
import styles from "./results.module.css";

export function FoodMenu({ items, initialBudget = 20, initialCategory = "全部" }: { items: CampusFood[]; initialBudget?: number; initialCategory?: string }) {
  const [budget, setBudget] = useState(initialBudget);
  const [category, setCategory] = useState(initialCategory);
  const [includeUnknown, setIncludeUnknown] = useState(true);
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const sliderId = useId();
  const [saved, setSaved] = useState<string[]>([]);
  const categories = ["全部", ...new Set(items.map((item) => item.tag))];
  const matches = items.filter((food) => (food.price === null ? includeUnknown : food.price <= budget) && (category === "全部" || food.tag === category));
  const unknownCount = matches.filter((item) => item.price === null).length;
  const index = Math.max(0, matches.findIndex((food) => food.id === selectedId));
  const food = matches[index];

  return (
    <article className={styles.card} aria-label="校园美食菜单">
      <div className={styles.foodFilters}>
        <div className="flex items-center justify-between gap-3">
          <h3 className={styles.title}>这顿吃点什么</h3>
          <span className={styles.muted}>已收藏 {saved.length}</span>
        </div>
        <label className="flex flex-wrap items-center gap-2 text-xs" htmlFor={sliderId}><SlidersHorizontal className="size-3.5" />预算上限<span className="ml-auto font-semibold tabular-nums text-primary">¥{budget}</span></label>
        <input id={sliderId} aria-label="预算上限" type="range" min="1" max={Math.max(30, initialBudget)} step="1" value={budget} onChange={(event) => setBudget(Number(event.target.value))} className={styles.range} />
        <div className="flex flex-wrap gap-2">{categories.map((label) => <button type="button" key={label} className={styles.chip} aria-pressed={category === label} onClick={() => setCategory(label)}>{label}</button>)}</div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={includeUnknown} onChange={(event) => setIncludeUnknown(event.target.checked)} />显示价格待核的条目</label>
        <p className={styles.footnote}>{items.length} 项已对应图片的资料；预算仅筛选有历史价格的条目，营业现状待核。</p>
      </div>
      {food ? <>
        <div className={styles.foodImage}>
          <Image key={food.id} src={food.image} alt={`${food.name} · ${food.imageType ?? "来源图片"}`} fill unoptimized loading="eager" sizes="600px" className="object-cover" />
          <span className={styles.photoCaption}>{food.imageType ?? "原帖图片"} · {food.photoDate ?? "日期未提供"}</span>
          <button type="button" aria-label={`${saved.includes(food.id) ? "取消收藏" : "收藏"}${food.name}`} aria-pressed={saved.includes(food.id)} className={styles.favorite} onClick={() => setSaved((current) => current.includes(food.id) ? current.filter((id) => id !== food.id) : [...current, food.id])}><Heart className={saved.includes(food.id) ? "size-4 fill-primary text-primary" : "size-4"} /></button>
        </div>
        <div className={styles.body}>
          <div className="flex items-start justify-between gap-3"><div><h4 className={styles.title}>{food.name}</h4><p className="mt-1 text-sm">{food.dish}</p></div><p className="shrink-0 text-right">{food.price === null ? <span className="text-sm font-medium text-muted-foreground">价格待核</span> : <><span className="text-2xl font-semibold tabular-nums text-primary">¥{food.price}</span><span className="block text-[10px] text-muted-foreground">历史参考价</span></>}</p></div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="size-3.5" />{food.location}</p>
          <p className={styles.footnote}>{food.locationNote ?? "资料所述位置，现址待核"}</p>
          {food.reviewSummary && <blockquote className="border-l-2 border-primary/20 pl-3 text-xs leading-6 text-muted-foreground"><p>{food.reviewSummary}</p><footer className="mt-1 text-[10px]">历史个人评价 · {food.reviewDate ?? "日期未提供"}{food.reviewSource && <> · <a href={food.reviewSource} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">查看出处</a></>}</footer></blockquote>}
          <div className={styles.foodPaging}><button type="button" className={styles.iconButton} aria-label="上一家美食" disabled={index === 0} onClick={() => setSelectedId(matches[index - 1].id)}><ArrowLeft className="size-4" /></button><span aria-live="polite" className={styles.muted}>{index + 1} / {matches.length} 项{unknownCount > 0 ? ` · ${unknownCount}项价格待核` : ""}</span><button type="button" className={styles.iconButton} aria-label="下一家美食" disabled={index === matches.length - 1} onClick={() => setSelectedId(matches[index + 1].id)}><ArrowRight className="size-4" /></button></div>
          <details className={styles.details}><summary>查看图片、价格与核查说明</summary><p>{food.priceNote}。历史价格不代表当前售价。{food.imageNote}</p><p>{food.operationNote ?? "当前营业状态待核"}</p><div className="flex flex-wrap gap-x-4"><a href={food.source} target="_blank" rel="noopener noreferrer">查看资料来源<ExternalLink className="size-3" /></a><a href={food.imageSource ?? food.source} target="_blank" rel="noopener noreferrer">查看图片原帖<ExternalLink className="size-3" /></a><a href={food.image} target="_blank" rel="noopener noreferrer">查看完整图片<ExternalLink className="size-3" /></a></div></details>
        </div>
      </> : <div className={styles.empty}><p className="font-medium">这个预算下还没有收录的选择</p><p>目前只收录了 {items.length} 个带图片的餐食，试试调高预算或切换到「全部」。</p><button type="button" className={styles.secondary} onClick={() => { setBudget(Math.max(20, initialBudget)); setCategory("全部"); }}>恢复推荐</button></div>}
    </article>
  );
}
