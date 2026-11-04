import exclusions from "./campus-food-exclusions.json";

export const removedCampusFoods = exclusions;

const normalize = (value: string) => value.replace(/[\s（）()]/g, "");

export function mentionsRemovedFood(text: string): boolean {
  return exclusions.some((item) => normalize(text).includes(normalize(item.name)));
}

export function isRemovedCampusFood(food: { id: string; name: string; image?: string }): boolean {
  return exclusions.some((item) => item.id === food.id ||
    normalize(food.name).includes(normalize(item.name)) || item.image === food.image);
}

// 历史消息保存过整份菜单，展示时也应用当前下架规则。
export function availableFoodItems<T extends { id: string; name: string; image?: string; reviewSummary?: string | null }>(items: readonly T[]): T[] {
  return items.filter((item) => !isRemovedCampusFood(item)).map((item) =>
    item.reviewSummary && mentionsRemovedFood(item.reviewSummary)
      ? { ...item, reviewSummary: null, reviewDate: null, reviewSource: null }
      : item);
}
