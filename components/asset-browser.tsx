"use client";
import { AssetCommands } from "./asset-commands";
import { useCanManage,useTagPool } from "./team-context";
import { useStoreUpload } from "./image-upload-forms";
import { StoreSelector } from "@/components/store-selector";
import { AssetImage } from "@/components/asset-image";
import { sharedStoreLabel, filterSharedByStore, workstationStoreOptions, filterWorkstationByStore } from "@/lib/shared-workstation-filters";
import { arrayOrEmpty } from "@/lib/relation-values";

import { TagFilter, filterClass } from "@/components/tag-filter";
import { filterAssets } from "@/lib/asset-filters";
import { useState } from "react";
import { updateSharedAsset, updateStoreAsset } from "@/app/actions";
import { AssetDetailModal, DetailField, TagEditor, TagList, WorkstationSelector, assetCategories, savedTime } from "@/components/asset-detail-modal";
import type { AssetDetail, Tag, Workstation, StoreOption } from "@/lib/types";

type Props = { item: AssetDetail; tags: Tag[]; workstations: Workstation[]; onClose: () => void; stores?: StoreOption[]; currentStore?: StoreOption };
function AssetFields({ item, store = false }: { item: AssetDetail; store?: boolean }) {
  return <>{store && <DetailField label="分类">{assetCategories.find(([value]) => value === item.assetCategory)?.[1] || "其他"}</DetailField>}{store ? <DetailField label="标签"><TagList tags={item.tags} /></DetailField> : <DetailField label="所属店铺">{sharedStoreLabel(item)}</DetailField>}<DetailField label="工作站位置">{arrayOrEmpty(item.workstations).map(value => `${value.id}号${value.current_user_name ? ` · ${value.current_user_name}` : ""}`).join("、") || "未记录"}</DetailField>{store && <DetailField label="所属店铺">{item.store?.name || "未记录"}</DetailField>}{!store && <DetailField label="备注"><p className="whitespace-pre-wrap break-words">{item.note || "未记录"}</p></DetailField>}<DetailField label={store ? "上传时间" : "保存时间"}>{savedTime(item.createdAt)}</DetailField></>;
}
export function SharedAssetDetail({ item, stores = [], workstations, currentStore, onClose }: Props) {
  return <AssetDetailModal canEdit={useCanManage(item.createdBy)} actions={<AssetCommands kind="shared" item={item} stores={stores} workstations={workstations} currentStore={currentStore} onClose={onClose}/>} title="共享素材详情" image={item.image} onClose={onClose} onSave={form => updateSharedAsset(item.id, form)} success="共享素材已更新" editor={<><StoreSelector stores={stores} selected={item.stores} /><WorkstationSelector workstations={workstations} selected={item.workstations} /><label className="block text-sm font-medium">备注（可选）<textarea name="description" defaultValue={item.note || ""} placeholder="添加团队内部备注…" rows={4} className="mt-2 w-full rounded-xl border p-3 text-sm" /></label></>}><AssetFields item={item} /></AssetDetailModal>;
}
export function StoreAssetDetail({ item, tags, workstations, stores=[], onClose }: Props) {
  return <AssetDetailModal canEdit={useCanManage(item.createdBy)} actions={<AssetCommands kind="store" item={item} stores={stores} workstations={workstations} onClose={onClose}/>} title="店铺素材详情" image={item.image} onClose={onClose} onSave={form => updateStoreAsset(item.id, form)} success="素材已更新" editor={<><label className="block text-sm font-medium">分类<select name="category" defaultValue={item.assetCategory || "other"} className="mt-2 w-full rounded-xl border p-3">{assetCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><TagEditor scope="store" tags={useTagPool("store")} selected={item.tags} /><WorkstationSelector workstations={workstations} selected={item.workstations} /></>}><AssetFields item={item} store /></AssetDetailModal>;
}
export function AssetBrowser({ assets, tags, workstations, stores = [], kind, currentStore, initialTag = "" }: { assets: AssetDetail[]; tags: Tag[]; workstations: Workstation[]; stores?: StoreOption[]; kind: "shared" | "store" | "workstation"; currentStore?: StoreOption; initialTag?: string }) {
  assets = arrayOrEmpty(assets);
  stores = arrayOrEmpty(stores);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const upload = useStoreUpload();
  const usedTags = [...new Map(assets.filter(a => a.kind !== "shared").flatMap(a => arrayOrEmpty(a.tags)).map(t => [t.id,t])).values()];
  const [selectedTags, setSelectedTags] = useState<string[]>(initialTag ? [initialTag] : []);
  const [storeFilter, setStoreFilter] = useState("all");
  const keyOf = (item: AssetDetail) => (item.kind || kind) + ":" + item.id;
  const selected = assets.find(item => keyOf(item) === selectedKey);
  const workstationStores = workstationStoreOptions(assets);
  // A filter may disappear after an asset is moved to another workstation.
  const options = kind === "workstation" ? workstationStores : stores;
  const activeFilter = ["all", "shared", "general"].includes(storeFilter) || options.some(store => store.id === storeFilter) ? storeFilter : "all";
  const visible = kind === "store" ? filterAssets(assets, category, selectedTags) : kind === "shared" ? filterSharedByStore(assets, activeFilter) : filterWorkstationByStore(assets, activeFilter);
  const Detail = (selected?.kind || kind) === "shared" ? SharedAssetDetail : StoreAssetDetail;
  return <>
    {kind === "store" && <><nav aria-label="分类筛选" className="mb-4 flex flex-wrap gap-2">{[["all", "全部"], ...assetCategories.slice(0,3), ["shared", "共享素材"], assetCategories[3]].map(([value, label]) => <button type="button" key={value} aria-pressed={category === value} onClick={() => { setCategory(value); upload?.setCategory(value); if(value==="shared")setSelectedTags([]); }} className={filterClass(category === value)}>{label}</button>)}</nav>{category !== "shared" && <TagFilter scope="store" tags={usedTags} selected={selectedTags} onChange={setSelectedTags} />}</>}
    {kind === "shared" && <nav aria-label="所属店铺筛选" className="mb-7 flex flex-wrap gap-2">{[{ id: "all", name: "全部" }, ...stores, { id: "general", name: "通用素材" }].map(option => <button type="button" key={option.id} aria-pressed={activeFilter === option.id} onClick={() => setStoreFilter(option.id)} className={filterClass(activeFilter === option.id)}>{option.name}</button>)}</nav>}
    {kind === "workstation" && <><p aria-live="polite" className="mb-5 text-sm text-zinc-500">共 {visible.length} 项素材</p><nav aria-label="工作站店铺筛选" className="mb-7 flex flex-wrap gap-2">{[{ id: "all", name: "全部" }, ...workstationStores, { id: "shared", name: "共享素材" }].map(option => <button type="button" key={option.id} aria-pressed={activeFilter === option.id} onClick={() => setStoreFilter(option.id)} className={filterClass(activeFilter === option.id)}>{option.name} ({filterWorkstationByStore(assets, option.id).length})</button>)}</nav></>}
    {!visible.length && <p className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-zinc-500">{kind === "workstation" && !assets.length ? "这台工作站暂时没有关联素材。" : category === "shared" ? "还没有关联的共享素材。" : !assets.length ? kind === "shared" ? "还没有共享素材。" : "还没有素材，上传第一张店铺素材开始整理。" : "暂无符合条件的素材"}</p>}
    <section className={kind === "shared" ? "content-grid grid-four gap-5" : "content-grid grid-three gap-5"}>{visible.map(item => {
      const shared = (item.kind || kind) === "shared";
      const label = shared ? kind !== "shared" ? "共享" : sharedStoreLabel(item) : kind === "workstation" ? item.store?.name || "历史店铺（信息不可见）" : assetCategories.find(([value]) => value === item.assetCategory)?.[1] || "其他";
      return <button type="button" key={keyOf(item)} onClick={() => setSelectedKey(keyOf(item))} aria-label={"查看" + label + "详情"} className="group cursor-pointer overflow-hidden rounded-xl border border-zinc-200 bg-white text-left shadow-card transition hover:border-orange-brand/40 hover:shadow-float focus-visible:outline-orange-brand"><AssetImage src={item.image} alt={label} className="h-48 w-full object-cover transition duration-300 group-hover:scale-[1.03]" /><p className="p-4 text-sm font-medium">{label}</p></button>;
    })}</section>
    {selected && <Detail key={keyOf(selected)} item={selected} tags={tags} workstations={workstations} stores={stores} currentStore={currentStore} onClose={() => setSelectedKey(null)} />}
  </>;
}
