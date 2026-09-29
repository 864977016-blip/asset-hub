import type { Tag, AssetDetail, ParentProduct } from "./types";
import { arrayOrEmpty } from "./relation-values";
export function matchesTags(item: { tags?: Tag[] | null } | null | undefined, selected: string[] | null | undefined = []) {
  return arrayOrEmpty(selected).every(id => arrayOrEmpty(item?.tags).some(tag => tag.id === id));
}
export function filterAssets(items: AssetDetail[] | null | undefined, category: string, tags: string[] | null | undefined = [], source = "all") {
  return arrayOrEmpty(items).filter(item => (category === "all" || (category === "shared" ? item.kind === "shared" : item.kind !== "shared" && item.assetCategory === category)) && (item.kind === "shared" ? arrayOrEmpty(tags).length === 0 : matchesTags(item, tags)) && (source === "all" || item.kind === source));
}
export function filterStoreAssetsByProductType(items: AssetDetail[] | null | undefined, category: string, productTagId: string | null | undefined, parents: Pick<ParentProduct,"id"|"tags">[] | null | undefined) {
  const parentTags = new Map(arrayOrEmpty(parents).map(parent => [parent.id, arrayOrEmpty(parent.tags).map(tag => tag.id)]));
  return arrayOrEmpty(items).filter(item =>
    (category === "all" || (category === "shared" ? item.kind === "shared" : item.kind !== "shared" && item.assetCategory === category)) &&
    (!productTagId || (item.kind !== "shared" && !!item.parentProductId && parentTags.get(item.parentProductId)?.includes(productTagId)))
  );
}
