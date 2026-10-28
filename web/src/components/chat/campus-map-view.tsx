"use client";

import { LoaderCircle, MapPin, Minus, Plus, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loadAMap, searchCampusPlace, type CampusMapInstance } from "@/lib/amap-client";
import type { CampusPlace, MapPoi } from "@/lib/campus-map";
import { site } from "@/lib/config";
import { cn } from "@/lib/utils";
import styles from "./location-card.module.css";

export function CampusMapView({ place, expanded, onResolve }: {
  place: CampusPlace; expanded: boolean; onResolve: (poi: MapPoi | undefined) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<CampusMapInstance | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ phase: "loading" | "ready" | "error" | "empty"; message?: string }>({ phase: "loading" });
  const [pois, setPois] = useState<MapPoi[]>([]);
  const [selected, setSelected] = useState<string>();
  const choose = useRef<(poi: MapPoi) => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let map: CampusMapInstance | undefined;
    let renderTimer: ReturnType<typeof setTimeout> | undefined;
    onResolve(undefined);
    async function mount() {
      try {
        const sdk = await loadAMap();
        const matches = await searchCampusPlace(sdk, { name: place.name, kind: place.kind });
        if (cancelled) return;
        // 精确点位没匹配到时仍显示真实校园底图，不能把校中心当成目的地。
        const first = matches[0] ?? (await searchCampusPlace(sdk, { name: site.school, kind: "campus" }))[0];
        if (cancelled || !container.current) return;
        setPois(matches);
        if (!first) {
          setState({ phase: "empty", message: `暂未匹配到「${place.name}」的可导航地点，可打开高德确认名称或在地图上选点` });
          return;
        }
        map = new sdk.Map(container.current, {
          center: [first.longitude, first.latitude], zoom: matches.length ? 16 : 15, viewMode: "2D",
          resizeEnable: true, scrollWheel: false, keyboardEnable: true,
          // 始终用地点搜索坐标初始化，避免 SDK 根据访问者 IP 自动选择中心点。
        });
        mapRef.current = map;
        renderTimer = setTimeout(() => {
          if (!cancelled) setState({ phase: "error", message: "地图底图加载超时，请检查网络后重试" });
        }, 20000);
        map.on("complete", () => {
          clearTimeout(renderTimer);
          if (!cancelled) setState({ phase: "ready" });
        });
        choose.current = (poi) => {
          if (cancelled || !map) return;
          map.clearMap();
          map.add(new sdk.Marker({ position: [poi.longitude, poi.latitude], title: poi.name }));
          map.setCenter([poi.longitude, poi.latitude]);
          map.setZoom(17);
          setSelected(poi.id);
          onResolve(poi);
        };
        // 多个结果先展示真实地图和候选项，用户选择后才设置目的地。
        if (matches.length === 1) choose.current(first);
      } catch (error) {
        if (!cancelled) setState({ phase: "error", message: error instanceof Error ? error.message : "地图暂时无法加载，请重试" });
      }
    }
    void mount();
    return () => {
      cancelled = true;
      clearTimeout(renderTimer);
      mapRef.current = undefined;
      map?.destroy();
    };
  }, [place.name, place.kind, attempt, onResolve]);

  function retry() {
    setState({ phase: "loading" });
    setPois([]);
    setSelected(undefined);
    setAttempt((value) => value + 1);
  }

  return (
    <>
      <div className={cn(styles.map, expanded && styles.expanded)} role="region" aria-label={place.name + "高德地图"}>
        <div ref={container} className={styles.mapCanvas} />
        {state.phase !== "ready" && (
          <div className={styles.mapStatus} role="status">
            {state.phase === "loading" ? <LoaderCircle className="size-5 motion-safe:animate-spin" /> : <MapPin className="size-5" />}
            <p>{state.phase === "loading" ? "正在加载高德地图与地点…" : state.message}</p>
            {state.phase === "error" && <button type="button" className={styles.retry} onClick={retry}><RotateCw className="size-3.5" />重新加载</button>}
          </div>
        )}
        {state.phase === "ready" && <div className={styles.zoomControls}>
          <button type="button" onClick={() => mapRef.current?.zoomIn()} aria-label="放大地图"><Plus className="size-4" /></button>
          <button type="button" onClick={() => mapRef.current?.zoomOut()} aria-label="缩小地图"><Minus className="size-4" /></button>
        </div>}
      </div>
      {!pois.length && state.phase === "ready" && <p className="px-4 pt-3 text-xs leading-6 text-muted-foreground" role="status">
        当前显示{site.school}校园范围，「{place.name}」尚未精确定位。可放大查看楼名，或打开高德确认目的地。
      </p>}
      {pois.length > 1 && state.phase === "ready" && <div className={styles.candidates}>
        <p className="text-xs text-muted-foreground">找到多个地点，请确认目的地</p>
        {pois.map((poi) => <button key={poi.id} type="button" aria-pressed={selected === poi.id} onClick={() => choose.current(poi)} className={cn(styles.candidate, selected === poi.id && styles.chosen)}>
          <MapPin className="mt-0.5 size-3.5 shrink-0" />
          <span><span className="block text-[13px] font-medium">{poi.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{poi.address}</span></span>
        </button>)}
      </div>}
    </>
  );
}
