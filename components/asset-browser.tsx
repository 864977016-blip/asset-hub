"use client";
import { ParentSelector } from "./parent-selector";
import { ProductTagCreate, ProductTagEditor } from "./product-tag-create";
import { BatchAssetBar } from "./store-batch";
import { useTeam } from "./team-context";
import { AssetCommands } from "./asset-commands";
import { useCanManage } from "./team-context";
import { useStoreUpload } from "./image-upload-forms";
import { StoreSelector } from "@/components/store-selector";
import { AssetImage } from "@/components/asset-image";
import { sharedStoreLabel, filterSharedByStore, workstationStoreOptions, filterWorkstationByStore } from "@/lib/shared-workstation-filters";
import { arrayOrEmpty } from "@/lib/relation-values";

import { TagStrip } from "@/components/tag-tools";
import { filterClass, tagChipClass } from "@/components/tag-filter";
import { filterStoreAssetsByProductType } from "@/lib/asset-filters";
import { useEffect, useState } from "react";
import { updateSharedAsset, updateStoreAsset } from "@/app/actions";
import { AssetDetailModal, DetailField, WorkstationSelector, assetCategories, savedTime } from "@/components/asset-detail-modal";
import type { AssetDetail, Tag, Workstation, StoreOption, ParentProduct, ProductTag } from "@/lib/types";

type Props = { item: AssetDetail; tags: Tag[]; workstations: Workstation[]; onClose: () => void; stores?: StoreOption[]; currentStore?: StoreOption; parents?: ParentProduct[] };
function AssetFields({ item, parent }: { item: AssetDetail; parent?: Pick<ParentProduct,"name"|"tags"> }) {
  if(item.kind==="store")return <><DetailField label="分类">{assetCategories.find(([value]) => value === item.assetCategory)?.[1] || "其他"}</DetailField><DetailField label="父体">{parent?.name||"未归类"}</DetailField><DetailField label="标签">{parent?.tags.map(tag=>tag.name).join("、")||"—"}</DetailField><DetailField label="工作站位置">{arrayOrEmpty(item.workstations).map(value => `${value.id}号${value.current_user_name ? ` · ${value.current_user_name}` : ""}`).join("、") || "未记录"}</DetailField><DetailField label="所属店铺">{item.store?.name || "未记录"}</DetailField></>;
  return <><DetailField label="所属店铺">{sharedStoreLabel(item)}</DetailField><DetailField label="工作站位置">{arrayOrEmpty(item.workstations).map(value => `${value.id}号${value.current_user_name ? ` · ${value.current_user_name}` : ""}`).join("、") || "未记录"}</DetailField><DetailField label="备注"><p className="whitespace-pre-wrap break-words">{item.note || "未记录"}</p></DetailField><DetailField label="保存时间">{savedTime(item.createdAt)}</DetailField></>;
}
export function SharedAssetDetail({ item, stores = [], workstations, currentStore, onClose }: Props) {
  return <AssetDetailModal canEdit={useCanManage(item.createdBy)} actions={<AssetCommands kind="shared" item={item} stores={stores} workstations={workstations} currentStore={currentStore} onClose={onClose}/>} title="共享素材详情" image={item.image} onClose={onClose} onSave={form => updateSharedAsset(item.id, form)} success="共享素材已更新" editor={<><StoreSelector stores={stores} selected={item.stores} /><WorkstationSelector workstations={workstations} selected={item.workstations} /><label className="block text-sm font-medium">备注（可选）<textarea name="description" defaultValue={item.note || ""} placeholder="添加团队内部备注…" rows={4} className="mt-2 w-full rounded-xl border p-3 text-sm" /></label></>}><AssetFields item={item} /></AssetDetailModal>;
}
export function StoreAssetDetail({ item, tags, workstations, stores=[], parents, onClose }: Props) {
  const parent=parents?.find(value=>value.id===item.parentProductId)??item.parentProduct??undefined;
  return <AssetDetailModal canEdit={useCanManage(item.createdBy)} actions={<AssetCommands kind="store" item={item} stores={stores} workstations={workstations} onClose={onClose}/>} title="店铺素材详情" image={item.image} onClose={onClose} onSave={form => updateStoreAsset(item.id, form)} success="素材已更新" editor={<><label className="block text-sm font-medium">分类<select name="category" defaultValue={item.assetCategory || "other"} className="mt-2 w-full rounded-xl border p-3">{assetCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><ParentSelector storeId={item.store?.id} selected={item.parentProductId} options={parents} showTag/><WorkstationSelector workstations={workstations} selected={item.workstations} /></>}><AssetFields item={item} parent={parent}/></AssetDetailModal>;
}
export function AssetBrowser({ assets, tags, workstations, stores = [], kind, currentStore, initialTag = "", parents = [], productTags = [], parentOnly = false }: { parents?:ParentProduct[]; productTags?:ProductTag[]; parentOnly?:boolean; assets: AssetDetail[]; tags: Tag[]; workstations: Workstation[]; stores?: StoreOption[]; kind: "shared" | "store" | "workstation"; currentStore?: StoreOption; initialTag?: string }) {
  const {profile}=useTeam();
  const [batch,setBatch]=useState(false),[chosen,setChosen]=useState<string[]>([]);
  const manageable=(item:AssetDetail)=>item.kind!=="shared"&&(profile.role==="admin"||Boolean(item.createdBy&&profile.id===item.createdBy));
  useEffect(()=>{setChosen([])},[assets]);
  assets = arrayOrEmpty(assets);
  stores = arrayOrEmpty(stores);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const upload = useStoreUpload();
  const [extraProductTags,setExtraProductTags]=useState<ProductTag[]>([]);
  const allProductTags=[...new Map([...arrayOrEmpty(productTags),...extraProductTags].map(tag=>[tag.id,tag])).values()];
  const [selectedProductTag, setSelectedProductTag] = useState(productTags.some(tag=>tag.id===initialTag)?initialTag:"");
  const [storeFilter, setStoreFilter] = useState("all");
  const keyOf = (item: AssetDetail) => (item.kind || kind) + ":" + item.id;
  const selected = assets.find(item => keyOf(item) === selectedKey);
  const workstationStores = workstationStoreOptions(assets);
  // A filter may disappear after an asset is moved to another workstation.
  const options = kind === "workstation" ? workstationStores : stores;
  const activeFilter = ["all", "shared", "general"].includes(storeFilter) || options.some(store => store.id === storeFilter) ? storeFilter : "all";
  const visible = kind === "store" ? filterStoreAssetsByProductType(assets, category, selectedProductTag, parents) : kind === "shared" ? filterSharedByStore(assets, activeFilter) : filterWorkstationByStore(assets, activeFilter);
  const Detail = (selected?.kind || kind) === "shared" ? SharedAssetDetail : StoreAssetDetail;
  return <>
    {kind === "store" && <><nav aria-label="分类筛选" className="mb-5 flex max-w-full gap-7 overflow-x-auto border-b border-zinc-200 text-sm">{[["all", "全部"], ...assetCategories.slice(0,3), ...(parentOnly?[]:[["shared", "共享素材"]]), assetCategories[3]].map(([value, label]) => <button type="button" key={value} aria-pressed={category === value} onClick={() => { setCategory(value); upload?.setCategory(value); if(value==="shared")setSelectedProductTag(""); }} className={`shrink-0 border-b-2 px-0.5 pb-2.5 transition ${category===value?"border-orange-brand font-medium text-orange-brand":"border-transparent text-zinc-500 hover:text-ink"}`}>{label}</button>)}</nav>{!parentOnly&&category!=="shared"&&<div aria-label="产品类型筛选" className="mb-7 flex min-w-0 items-center gap-3"><span className="shrink-0 text-sm text-zinc-500">标签：</span><div className="min-w-0 flex-1"><TagStrip><button type="button" aria-pressed={!selectedProductTag} className={tagChipClass(!selectedProductTag)} onClick={()=>setSelectedProductTag("")}>全部</button>{allProductTags.map(tag=><button type="button" key={tag.id} title={tag.name} aria-pressed={selectedProductTag===tag.id} className={tagChipClass(selectedProductTag===tag.id)+" max-w-56 truncate"} onClick={()=>setSelectedProductTag(tag.id)}>{tag.name}</button>)}<ProductTagCreate onCreated={tag=>{setExtraProductTags(items=>[...items,tag]);setSelectedProductTag(tag.id)}}/></TagStrip></div><ProductTagEditor tags={allProductTags} onSaved={()=>{setExtraProductTags([]);setSelectedProductTag("")}}/></div>}</>}
    {kind === "shared" && <nav aria-label="所属店铺筛选" className="mb-7 flex flex-wrap gap-2">{[{ id: "all", name: "全部" }, ...stores, { id: "general", name: "通用素材" }].map(option => <button type="button" key={option.id} aria-pressed={activeFilter === option.id} onClick={() => setStoreFilter(option.id)} className={filterClass(activeFilter === option.id)}>{option.name}</button>)}</nav>}
    {kind === "workstation" && <><p aria-live="polite" className="mb-5 text-sm text-zinc-500">共 {visible.length} 项素材</p><nav aria-label="工作站店铺筛选" className="mb-7 flex flex-wrap gap-2">{[{ id: "all", name: "全部" }, ...workstationStores, { id: "shared", name: "共享素材" }].map(option => <button type="button" key={option.id} aria-pressed={activeFilter === option.id} onClick={() => setStoreFilter(option.id)} className={filterClass(activeFilter === option.id)}>{option.name} ({filterWorkstationByStore(assets, option.id).length})</button>)}</nav></>}
    {!visible.length && <p className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-zinc-500">{kind === "workstation" && !assets.length ? "这台工作站暂时没有关联素材。" : category === "shared" ? "还没有关联的共享素材。" : !assets.length ? kind === "shared" ? "还没有共享素材。" : "还没有素材，上传第一张店铺素材开始整理。" : "暂无符合条件的素材"}</p>}
    {kind==="store"&&currentStore&&!parentOnly&&<BatchAssetBar storeId={currentStore.id} parents={parents} active={batch} selected={chosen} eligible={visible.filter(manageable).map(a=>a.id)} onSelect={setChosen} onActive={value=>{setBatch(value);setChosen([])}}/>}
    <section className={kind === "store" ? "inspiration-masonry" : kind === "shared" ? "content-grid grid-four gap-5" : "content-grid grid-three gap-5"}>{visible.map(item => {
      const shared = (item.kind || kind) === "shared";
      const label = shared ? kind !== "shared" ? "共享" : sharedStoreLabel(item) : kind === "workstation" ? item.store?.name || "历史店铺（信息不可见）" : assetCategories.find(([value]) => value === item.assetCategory)?.[1] || "其他";
      const open=()=>{if(batch&&kind==="store"){if(manageable(item))setChosen(ids=>ids.includes(item.id)?ids.filter(id=>id!==item.id):ids.length<100?[...ids,item.id]:ids);return;}setSelectedKey(keyOf(item));};
      if(kind==="store")return <button type="button" key={keyOf(item)} onClick={open} aria-label={"查看"+label+"详情"} aria-pressed={batch?chosen.includes(item.id):undefined} disabled={batch&&!manageable(item)} className={`group relative mb-6 inline-block w-full break-inside-avoid overflow-hidden rounded-xl bg-zinc-100 text-left transition hover:ring-1 hover:ring-orange-brand/40 focus-visible:outline-orange-brand ${chosen.includes(item.id)?"ring-2 ring-orange-brand":""} ${batch&&!manageable(item)?"opacity-50":""}`}><AssetImage src={item.image} alt={label} className="block h-auto w-full rounded-xl" placeholderClassName="min-h-32 w-full rounded-xl"/><span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">{label}</span>{batch&&manageable(item)&&<span aria-hidden className={`absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border-2 border-white shadow ${chosen.includes(item.id)?"bg-orange-brand":"bg-black/35"}`}>{chosen.includes(item.id)&&<span className="h-2 w-2 rounded-full bg-white"/>}</span>}</button>;
      return <button type="button" key={keyOf(item)} onClick={open} aria-label={"查看" + label + "详情"} className="group cursor-pointer overflow-hidden rounded-xl border border-zinc-200 bg-white text-left shadow-card transition hover:border-orange-brand/40 hover:shadow-float focus-visible:outline-orange-brand"><AssetImage src={item.image} alt={label} className="h-48 w-full object-cover transition duration-300 group-hover:scale-[1.03]"/><p className="p-4 text-sm font-medium">{label}</p></button>;
    })}</section>
    {selected && <Detail key={keyOf(selected)} item={selected} tags={tags} workstations={workstations} stores={stores} currentStore={currentStore} parents={parents} onClose={() => setSelectedKey(null)} />}
  </>;
}
