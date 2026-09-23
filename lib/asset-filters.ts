import type { Tag, AssetDetail } from "./types";
import { arrayOrEmpty } from "./relation-values";
export function matchesTags(item: { tags?: Tag[] | null } | null | undefined, selected: string[] | null | undefined = []) {
  return arrayOrEmpty(selected).every(id => arrayOrEmpty(item?.tags).some(tag => tag.id === id));
}
export function filterAssets(items: AssetDetail[] | null | undefined, category: string, tags: string[] | null | undefined = [], source = "all") {
  return arrayOrEmpty(items).filter(item => (category === "all" || (category === "shared" ? item.kind === "shared" : item.kind !== "shared" && item.assetCategory === category)) && (item.kind === "shared" ? arrayOrEmpty(tags).length === 0 : matchesTags(item, tags)) && (source === "all" || item.kind === source));
}
