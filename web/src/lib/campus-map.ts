import { site } from "./config";

export type CampusPlace = {
  name: string;
  address?: string;
  description?: string;
  kind: "campus" | "library" | "dining" | "building" | "other";
};

export type MapPoi = { id: string; name: string; address: string; longitude: number; latitude: number };

const schoolNames = ["东莞理工学院城市学院", site.school];
const chineseDigits = "一二三四五六七八九";

export const CAMPUS_PLACE_NAMING_RULES = "本校用‘学+数字’称呼宿舍楼：学三、学3、学三宿舍、学3宿舍、学三号楼、学3号楼指同一栋宿舍；其他编号按同样规则处理。只问‘学几在哪/怎么走’时默认找宿舍，只有明确说饭堂、食堂、吃饭时才找餐饮。教学楼通常用数字加字母命名，如7A、7B、7C、5A、5B、5C，这些是教学楼，不是宿舍。大小写和全角写法可统一，但7A、7B、17A是不同楼栋。这些命名规则不代表已经获得楼栋坐标或路线。";

function buildingNumber(value: string): string | undefined {
  if (/^\d{1,3}$/.test(value)) return Number(value) > 0 ? String(Number(value)) : undefined;
  if (chineseDigits.includes(value) && value.length === 1) return String(chineseDigits.indexOf(value) + 1);
  const tens = value.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/);
  if (!tens) return undefined;
  return String((tens[1] ? chineseDigits.indexOf(tens[1]) + 1 : 1) * 10 + (tens[2] ? chineseDigits.indexOf(tens[2]) + 1 : 0));
}

function chineseBuildingNumber(value: string): string {
  const number = Number(value);
  if (number < 10) return chineseDigits[number - 1];
  if (number >= 100) return value;
  return (number < 20 ? "" : chineseDigits[Math.floor(number / 10) - 1]) + "十" + (number % 10 ? chineseDigits[number % 10 - 1] : "");
}

export function isCampusPoi(poi: Pick<MapPoi, "name" | "address">): boolean {
  return schoolNames.some((name) => (poi.name + poi.address).includes(name));
}

// 只统一书写方式；“学3饭堂”不等于其他学校的“第三食堂”。
export function normalizePlaceName(value: string): string {
  value = value.normalize("NFKC");
  for (const school of schoolNames) value = value.replaceAll(school, "");
  const normalized = value.replace(/[\s（）()·—-]/g, "")
    .replace(/(学|第)([一二三四五六七八九十\d]+)(?=宿舍|号|栋|楼|食堂|饭堂|$)/g,
      (_, prefix: string, number: string) => prefix + (buildingNumber(number) ?? number))
    .replace(/^学([1-9]\d{0,2})(?:宿舍楼?|号楼)$/, "学$1宿舍")
    .replaceAll("饭堂", "食堂");
  const teaching = normalized.match(/^(?:.*学院)?(?:教学楼)?([1-9]\d{0,2}[A-Za-z])(?:教学楼|号楼|区|座)?$/);
  return teaching ? teaching[1].toUpperCase() : normalized;
}

export function normalizeCampusPlace(place: CampusPlace): CampusPlace {
  const normalized = normalizePlaceName(place.name);
  const dormitory = normalized.match(/^学([1-9]\d{0,2})(?:宿舍)?$/);
  if (dormitory) return { ...place, name: `学${dormitory[1]}宿舍楼`, kind: "building" };
  if (/^[1-9]\d{0,2}[A-Z]$/.test(normalized)) return { ...place, name: `${normalized}教学楼`, kind: "building" };
  return place;
}

export function placeSearchNames(place: CampusPlace): string[] {
  place = normalizeCampusPlace(place);
  let name = place.name;
  for (const school of schoolNames) name = name.replaceAll(school, "");
  name = name.trim();
  if (!name) return [site.school];
  const normalized = normalizePlaceName(name);
  const dormitory = normalized.match(/^学([1-9]\d{0,2})宿舍$/);
  if (dormitory) {
    const number = dormitory[1];
    return [...new Set([`学${number}号楼`, `学${number}宿舍`, `学${chineseBuildingNumber(number)}号楼`])];
  }
  if (/^[1-9]\d{0,2}[A-Z]$/.test(normalized)) return [normalized, `${normalized}区`, `${normalized}教学楼`];
  const aliases = normalized === "操场" || normalized === "田径场" ? ["操场", "田径场"] : [];
  const numbered = normalized.replace(/(学|第)([1-9]\d{0,2})(?=宿舍|号|栋|楼|食堂|$)/g,
    (_, prefix: string, number: string) => prefix + chineseBuildingNumber(number));
  return [...new Set([name, ...aliases, normalized, numbered])];
}

// 按完整地点名查高德 POI，不使用模型猜测的坐标。
export function placeSearchText(place: CampusPlace): string {
  return schoolNames.some((name) => place.name.includes(name)) ? place.name : `${site.school}${place.name}`;
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
