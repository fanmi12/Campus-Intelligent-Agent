import { site } from "./config";

export type CampusPlace = {
  name: string;
  address?: string;
  description?: string;
  kind: "campus" | "library" | "dining" | "building" | "other";
};

export type MapPoi = { id: string; name: string; address: string; longitude: number; latitude: number };

// 按完整地点名查高德 POI，不使用模型猜测的坐标。
export function placeSearchText(place: CampusPlace): string {
  return place.name.includes(site.school) ? place.name : `${site.school}${place.name}`;
}

export function amapSearchUrl(place: CampusPlace): string {
  const params = new URLSearchParams({
    keyword: placeSearchText(place), city: "东莞", view: "map",
    src: "chengyuan-xiaoshi", callnative: "1",
  });
  return `https://uri.amap.com/search?${params}`;
}

export function amapNavigationUrl(poi: MapPoi): string {
  const params = new URLSearchParams({
    to: `${poi.longitude},${poi.latitude},${poi.name}`, mode: "walk",
    coordinate: "gaode", src: "chengyuan-xiaoshi", callnative: "1",
  });
  return `https://uri.amap.com/navigation?${params}`;
}
