"use client";
import { relationMany } from "@/lib/relation-values";
import type { StoreOption } from "@/lib/types";

export function StoreSelector({ stores, selected = [] }: { stores: StoreOption[]; selected?: StoreOption[] }) {
  const available = relationMany(stores).filter(store => store.id && !store.archivedAt);
  const current = relationMany(selected);
  const historical = current.filter(store => !available.some(option => option.id === store.id));
  return <fieldset><legend className="mb-2 text-sm font-medium">所属店铺（可多选）</legend><div className="flex flex-wrap gap-2">{available.map(store => <label key={store.id} className="cursor-pointer"><input type="checkbox" name="store_ids" value={store.id} defaultChecked={current.some(item => item.id === store.id)} className="peer sr-only" /><span className="inline-block rounded-full border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 peer-checked:border-orange-brand peer-checked:bg-orange-brand/10 peer-checked:text-ink peer-focus-visible:ring-2 peer-focus-visible:ring-orange-brand">{store.name}</span></label>)}</div><p className="mt-2 text-xs text-zinc-400">不关联店铺时为通用素材。</p>{historical.length > 0 && <p className="mt-2 text-xs text-zinc-500">保留历史关联：{historical.map(store => store.name).join(" · ")}（不可新增选择）</p>}</fieldset>;
}
