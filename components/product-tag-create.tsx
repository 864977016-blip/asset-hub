"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {createProductTag,manageProductTag} from "@/app/actions";
import {userError} from "@/lib/user-error";
import {Modal} from "./modal";
import {useTeam} from "./team-context";
import type {ProductTag} from "@/lib/types";

export function ProductTagCreate({onCreated}:{onCreated?:(tag:ProductTag)=>void}){
 const [open,setOpen]=useState(false),[name,setName]=useState(""),[error,setError]=useState(""),[pending,start]=useTransition(),router=useRouter();
 const save=()=>start(async()=>{try{const tag=await createProductTag(name);onCreated?.(tag);setOpen(false);router.refresh()}catch(e){setError(userError(e))}});
 return <><button type="button" className="whitespace-nowrap text-sm text-orange-brand" onClick={()=>{setName("");setError("");setOpen(true)}}>+ 新建标签</button>{open&&<Modal title="新建产品类型" pending={pending} onClose={()=>setOpen(false)}><input autoFocus aria-label="产品类型名称" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&name.trim()&&!pending){e.preventDefault();save()}}} className="w-full rounded border p-3"/>{error&&<p role="alert" className="mt-3 text-red-600">{error}</p>}<div className="mt-5 flex justify-end gap-3"><button type="button" disabled={pending} className="round-button" onClick={()=>setOpen(false)}>取消</button><button type="button" disabled={pending||!name.trim()} className="round-button border-orange-brand bg-orange-brand text-white" onClick={save}>{pending?"保存中…":"保存"}</button></div></Modal>}</>;
}
export function ProductTagEditor({tags,onSaved}:{tags:ProductTag[];onSaved?:()=>void}){
 const {profile}=useTeam(),router=useRouter();
 const [open,setOpen]=useState(false),[draft,setDraft]=useState<ProductTag[]>([]),[deleted,setDeleted]=useState<ProductTag[]>([]),[error,setError]=useState(""),[pending,start]=useTransition();
 if(profile.role!=="admin")return null;
 const begin=()=>{setDraft(tags.map(tag=>({...tag})));setDeleted([]);setError("");setOpen(true)};
 const save=()=>{
  const names=draft.map(tag=>tag.name.trim().toLowerCase());
  if(draft.some(tag=>!tag.name.trim())){setError("标签名称不能为空");return}
  if(new Set(names).size!==names.length){setError("标签名称不能重复");return}
  start(async()=>{try{for(const tag of draft){const old=tags.find(item=>item.id===tag.id);if(old&&old.name!==tag.name.trim())await manageProductTag(tag.id,tag.name.trim())}for(const tag of deleted)await manageProductTag(tag.id,undefined,true);onSaved?.();router.refresh();setOpen(false)}catch(e){setError(userError(e))}});
 };
 return <><button type="button" className="shrink-0 rounded px-2 py-1 text-sm text-zinc-500 hover:text-orange-brand" onClick={begin}>编辑标签</button>{open&&<Modal title="编辑产品类型" pending={pending} onClose={()=>setOpen(false)}><div className="space-y-2">{draft.map((tag,index)=><div key={tag.id} className="flex gap-2"><input aria-label={`${tag.name}名称`} value={tag.name} disabled={pending} onChange={event=>setDraft(draft.map((item,i)=>i===index?{...item,name:event.target.value}:item))} className="min-w-0 flex-1 rounded border p-2"/><button type="button" disabled={pending} aria-label={`删除${tag.name}`} className="px-2 text-zinc-400 hover:text-red-600" onClick={()=>{if(window.confirm(`删除「${tag.name}」会解除所有父体上的该产品类型，不会删除父体或素材。确认删除？`)){setDeleted([...deleted,tag]);setDraft(draft.filter(item=>item.id!==tag.id))}}}>×</button></div>)}{!draft.length&&<p className="py-5 text-center text-sm text-zinc-400">暂无标签</p>}</div>{error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}<div className="mt-5 flex justify-end gap-3"><button type="button" disabled={pending} className="round-button" onClick={()=>setOpen(false)}>取消</button><button type="button" disabled={pending} className="round-button border-orange-brand bg-orange-brand text-white" onClick={save}>{pending?"保存中…":"完成"}</button></div></Modal>}</>;
}
