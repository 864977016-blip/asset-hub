import type { AssetDetail, StoreOption } from "./types";
import { relationMany } from "./relation-values";
export function sharedStoreLabel(item: AssetDetail) {
  const stores = relationMany(item.stores);
  return stores.length ? stores.map(store => store.name).join(" · ") : "通用素材";
}
export function filterSharedByStore(items: AssetDetail[], selected: string) {
  return relationMany(items).filter(item => selected === "all" || (selected === "general" ? relationMany(item.stores).length === 0 : relationMany(item.stores).some(store => store.id === selected)));
}
export function workstationStoreOptions(items: AssetDetail[]): StoreOption[] {
  const stores = new Map<string, StoreOption>();
  for (const item of relationMany(items)) if (item.kind === "store" && item.store?.id) stores.set(item.store.id, item.store);
  return [...stores.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}
export function filterWorkstationByStore(items: AssetDetail[], selected: string) {
  return relationMany(items).filter(item => selected === "all" || (selected === "shared" ? item.kind === "shared" : item.kind === "store" && item.store?.id === selected));
}
