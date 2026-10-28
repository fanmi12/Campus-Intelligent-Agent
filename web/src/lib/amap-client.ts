"use client";

import { isCampusPoi, normalizePlaceName, placeSearchNames, placeSearchText, type CampusPlace, type MapPoi } from "./campus-map";

type Position = { getLng(): number; getLat(): number };
type RawPoi = { id?: string; name?: string; address?: string; cityname?: string; adname?: string; location?: Position };
export type CampusMapInstance = {
  destroy(): void;
  on(event: string, callback: () => void): void;
  setCenter(position: [number, number]): void;
  setZoom(zoom: number): void;
  zoomIn(): void;
  zoomOut(): void;
  clearMap(): void;
  add(marker: unknown): void;
};
type AMapSdk = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => CampusMapInstance;
  Marker: new (options: Record<string, unknown>) => unknown;
  PlaceSearch: new (options: Record<string, unknown>) => {
    search(keyword: string, callback: (status: string, result: { poiList?: { pois?: RawPoi[] }; info?: string }) => void): void;
  };
};
declare global {
  interface Window {
    AMap?: AMapSdk;
    _AMapSecurityConfig?: { serviceHost: string };
  }
}

let sdkPromise: Promise<AMapSdk> | undefined;
const searches = new Map<string, Promise<MapPoi[]>>();

export function loadAMap(): Promise<AMapSdk> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = (async () => {
    const response = await fetch("/api/maps/config", { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("地图配置暂时无法读取");
    const config = await response.json() as { enabled: boolean; key?: string };
    if (!config.enabled || !config.key) throw new Error("地图尚未启用，可先在高德中打开地点");
    window._AMapSecurityConfig = { serviceHost: window.location.origin + "/_AMapService" };
    if (window.AMap?.PlaceSearch) return window.AMap;
    return new Promise<AMapSdk>((resolve, reject) => {
      const script = document.createElement("script");
      const timeout = window.setTimeout(() => fail(), 15000);
      const fail = () => {
        window.clearTimeout(timeout);
        script.remove();
        reject(new Error("地图加载失败，请检查网络后重试"));
      };
      script.src = "https://webapi.amap.com/maps?" + new URLSearchParams({
        v: "2.0", key: config.key!, plugin: "AMap.PlaceSearch",
      });
      script.async = true;
      script.onerror = fail;
      script.onload = () => {
        window.clearTimeout(timeout);
        if (window.AMap?.PlaceSearch) resolve(window.AMap);
        else fail();
      };
      document.head.appendChild(script);
    });
  })().catch((error) => {
    sdkPromise = undefined;
    throw error;
  });
  return sdkPromise;
}

export function searchCampusPlace(sdk: AMapSdk, place: CampusPlace): Promise<MapPoi[]> {
  const keyword = placeSearchText(place);
  const cached = searches.get(keyword);
  if (cached) return cached;
  const names = placeSearchNames(place);
  const matchNames = names.map(normalizePlaceName);
  const structuredBuilding = matchNames.some((name) => /^(?:学[1-9]\d{0,2}宿舍|[1-9]\d{0,2}[A-Z])$/.test(name));
  const result = new Promise<MapPoi[]>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      settled = true;
      reject(new Error("地点搜索超时，请重试"));
    }, 15000);
    const search = new sdk.PlaceSearch({ city: "东莞", citylimit: true, pageSize: 25, extensions: "base" });
    const finish = (pois: MapPoi[]) => { settled = true; window.clearTimeout(timer); resolve(pois); };
    function query(index: number) {
      const text = placeSearchText({ ...place, name: names[index] });
      search.search(text, (status, result) => {
        if (settled) return;
        if (status !== "complete" && status !== "no_data") {
          settled = true;
          window.clearTimeout(timer);
          return reject(new Error("高德地点搜索暂不可用，请稍后重试"));
        }
        const pois = (result?.poiList?.pois ?? []).flatMap((poi): MapPoi[] => {
          const longitude = poi.location?.getLng();
          const latitude = poi.location?.getLat();
          if (!poi.name || !Number.isFinite(longitude) || !Number.isFinite(latitude) ||
              longitude! < 73 || longitude! > 136 || latitude! < 3 || latitude! > 54) return [];
          return [{
            id: poi.id ?? poi.name, name: poi.name, longitude: longitude!, latitude: latitude!,
            address: [poi.cityname, poi.adname, typeof poi.address === "string" ? poi.address : ""].filter(Boolean).join(""),
          }];
        });
        const relevant = pois.filter((poi) => isCampusPoi(poi) &&
          (structuredBuilding ? matchNames.includes(normalizePlaceName(poi.name)) :
            matchNames.some((name) => normalizePlaceName(poi.name).includes(name))));
        const exact = relevant.filter((poi) => matchNames.includes(normalizePlaceName(poi.name)));
        if (exact.length) return finish(exact);
        if (relevant.length) return finish(relevant);
        if (index + 1 < names.length) query(index + 1);
        else finish([]);
      });
    }
    query(0);
  }).catch((error) => {
    searches.delete(keyword);
    throw error;
  });
  if (searches.size >= 50) searches.clear();
  // 空结果允许重新查询，避免一次未命中一直留在当前页面缓存里。
  void result.then((pois) => { if (!pois.length) searches.delete(keyword); }, () => {});
  searches.set(keyword, result);
  return result;
}
