"use client";
import {ActionMenu} from "./action-menu";

import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {deleteAsset,moveAsset} from "@/app/asset-operations";
import {Modal} from "./modal";
import {StoreSelector} from "./store-selector";
import {TagEditor,WorkstationSelector,assetCategories} from "./asset-detail-modal";
import {useCanManage,useTagPool,useTeam} from "./team-context";
import {useToast} from "./toast";
import {userError} from "@/lib/user-error";
import type {AssetDetail,StoreOption,Workstation} from "@/lib/types";
export function AssetCommands({kind,item,stores=[],workstations=[],currentStore,onClose}:{kind:"inspiration"|"store"|"shared";item:AssetDetail;stores?:StoreOption[];workstations?:Workstation[];currentStore?:StoreOption;onClose:()=>void}){
 const {ready,profile}=useTeam();const allowed=useCanManage(item.createdBy);const tags=useTagPool("store");const [step,setStep]=useState<"move"|"delete"|"permanent"|null>(null),[error,setError]=useState("");const [pending,start]=useTransition();const router=useRouter(),toast=useToast();
 const canRemove=Boolean(profile.id&&kind==="shared"&&currentStore&&item.stores?.some(store=>store.id===currentStore.id));
 if((!allowed&&!canRemove)||!ready)return null;
 const execute=(operation:()=>Promise<void>,message:string)=>start(async()=>{setError("");try{await operation();router.refresh();toast({message});setStep(null);onClose()}catch(e){setError(userError(e));}});
 return <div className="relative"><ActionMenu label="素材操作" triggerClassName="round-button">{allowed&&kind!=="inspiration"&&<button type="button" onClick={()=>{setStep("move");setError("")}} className="block w-full px-3 py-2 text-left text-sm">{kind==="store"?"移至共享素材":"移至店铺素材"}</button>}<button type="button" onClick={()=>{setStep("delete");setError("")}} className="block w-full px-3 py-2 text-left text-sm text-red-600">{allowed?"删除":"从当前店铺移除"}</button></ActionMenu>
 {step&&<Modal title={step==="move"?(kind==="store"?"移至共享素材":"移至店铺素材"):kind==="shared"?"处理这项共享素材":"删除素材"} pending={pending} onClose={()=>setStep(null)}>
 {step==="move"?<form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);execute(()=>moveAsset(kind as "store"|"shared",item.id,form),"素材已移动");}} className="space-y-5"><fieldset disabled={pending} className="space-y-5">{kind==="store"?<><StoreSelector stores={stores} selected={item.store?[item.store]:[]}/><label className="block text-sm">备注（可选）<textarea name="description" className="mt-2 w-full rounded border p-3"/></label></>:<><label className="block text-sm">目标店铺<select name="store_ids" required className="mt-2 w-full rounded border p-3"><option value="">请选择店铺</option>{stores.filter(s=>!s.archivedAt).map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label><label className="block text-sm">分类<select name="category" className="mt-2 w-full rounded border p-3">{assetCategories.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label><TagEditor scope="store" tags={tags}/></>}<WorkstationSelector workstations={workstations} selected={item.workstations}/></fieldset>{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-3"><button type="button" disabled={pending} onClick={()=>setStep(null)} className="round-button">取消</button><button disabled={pending} className="round-button">{pending?"移动中…":"移动"}</button></div></form>:<>
 {kind==="shared"?<><p className="text-sm text-zinc-600">关联店铺：{item.stores?.map(s=>s.name).join("、")||"通用素材"}</p>{step==="permanent"&&<p className="mt-4 text-sm text-red-600">永久删除后，它将从共享素材池以及所有关联店铺中消失。确定永久删除？</p>}</>:<p className="text-sm text-zinc-600">确定删除这项素材？此操作不会删除工作站电脑上的本地源文件。</p>}
 {error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}<div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" disabled={pending} onClick={()=>setStep(null)} className="round-button">取消</button>{canRemove&&currentStore&&step==="delete"&&<button type="button" disabled={pending} className="round-button" onClick={()=>execute(()=>deleteAsset(kind,item.id,currentStore.id),`已从 ${currentStore.name} 移除`)}>仅从 {currentStore.name} 移除</button>}{allowed&&<button type="button" disabled={pending} className="round-button text-red-600" onClick={()=>{if(kind==="shared"&&step!=="permanent"){setStep("permanent");return}execute(()=>deleteAsset(kind,item.id),"素材已删除")}}>{pending?"删除中…":kind==="shared"?"永久删除共享素材":"删除"}</button>}</div></>}
 </Modal>}
 </div>
}
