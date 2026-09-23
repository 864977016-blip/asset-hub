"use client";
import {useEffect,useRef,useState,useTransition,type ReactNode} from "react";
import {useRouter} from "next/navigation";
import {createScopedTag,manageTags,tagUsage} from "@/app/asset-operations";
import {useTagPool,useTeam} from "./team-context";
import {Modal} from "./modal";
import {userError} from "@/lib/user-error";
import {relationMany} from "@/lib/relation-values";
import type {Tag,TagScope} from "@/lib/types";
export function TagStrip({children}:{children:ReactNode}){
 const ref=useRef<HTMLDivElement>(null);const [overflow,setOverflow]=useState(false);
 useEffect(()=>{const element=ref.current;if(!element)return;const check=()=>setOverflow(element.scrollWidth>element.clientWidth+2);check();const observer=new ResizeObserver(check);observer.observe(element);window.addEventListener("resize",check);return()=>{observer.disconnect();window.removeEventListener("resize",check)}},[children]);
 return <div className="flex min-w-0 items-center gap-2">{overflow&&<button type="button" aria-label="向左滚动标签" className="round-button" onClick={()=>ref.current?.scrollBy({left:-260,behavior:"smooth"})}>‹</button>}<div ref={ref} className="flex min-w-0 flex-1 flex-nowrap gap-2 overflow-x-auto py-1 [&>*]:shrink-0">{children}</div>{overflow&&<button type="button" aria-label="向右滚动标签" className="round-button" onClick={()=>ref.current?.scrollBy({left:260,behavior:"smooth"})}>›</button>}</div>
}
export function NewTag({scope,onCreated}:{scope:TagScope;onCreated?:(tag:Tag)=>void}){
 const {ready}=useTeam();
 const [open,setOpen]=useState(false),[name,setName]=useState(""),[error,setError]=useState("");const [pending,start]=useTransition();const router=useRouter();
 if(!ready)return null;
 return <><button type="button" onClick={()=>{setName("");setError("");setOpen(true)}} className="whitespace-nowrap text-sm text-orange-brand">+ 新建标签</button>{open&&<Modal title="新建标签" onClose={()=>setOpen(false)} pending={pending}><label className="block text-sm">标签名称<input autoFocus value={name} onChange={e=>setName(e.target.value)} className="mt-2 w-full rounded-lg border p-3"/></label>{error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}<div className="mt-5 flex justify-end gap-3"><button type="button" disabled={pending} onClick={()=>setOpen(false)} className="round-button">取消</button><button type="button" disabled={pending||!name.trim()} className="round-button" onClick={()=>start(async()=>{try{const tag=await createScopedTag(scope,name.trim());onCreated?.(tag);router.refresh();setOpen(false)}catch(e){setError(userError(e))}})}>{pending?"保存中…":"保存"}</button></div></Modal>}</>
}
export function TagOrganizer({scope}:{scope:TagScope}){
 const pool=useTagPool(scope),{profile,ready}=useTeam();const [open,setOpen]=useState(false),[draft,setDraft]=useState<{id?:string;name:string}[]>([]),[deletes,setDeletes]=useState<{id:string;count:number}[]>([]),[error,setError]=useState("");const [pending,start]=useTransition();const router=useRouter();
 if(profile.role!=="admin"||!ready)return null;
 return <><button type="button" aria-label="整理标签" className="round-button" onClick={()=>{setDraft(pool.map(t=>({id:t.id,name:t.name})));setDeletes([]);setError("");setOpen(true)}}>···</button>{open&&<Modal title="整理标签" pending={pending} onClose={()=>setOpen(false)}><div className="space-y-2">{draft.map((tag,index)=><div className="flex gap-2" key={tag.id||'new'+index}><input aria-label="标签名称" value={tag.name} disabled={pending} onChange={e=>setDraft(draft.map((t,i)=>i===index?{...t,name:e.target.value}:t))} className="min-w-0 flex-1 rounded border p-2"/><button type="button" disabled={pending} aria-label={'删除'+tag.name} onClick={()=>start(async()=>{try{if(tag.id){const count=await tagUsage(scope,tag.id);if(count&&!window.confirm(`删除「${tag.name}」将移除 ${count} 个标签关联，不会删除素材。确定吗？`))return;setDeletes([...deletes,{id:tag.id,count}])}setDraft(draft.filter((_,i)=>i!==index))}catch(e){setError(userError(e))}})}>×</button></div>)}</div><button type="button" disabled={pending} onClick={()=>setDraft([...draft,{name:""}])} className="mt-4 text-sm text-orange-brand">+ 添加标签</button>{error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}<div className="mt-5 flex justify-end gap-3"><button type="button" disabled={pending} onClick={()=>setOpen(false)} className="round-button">取消</button><button type="button" disabled={pending||draft.some(t=>!t.name.trim())} className="round-button" onClick={()=>start(async()=>{try{await manageTags(scope,draft.filter(t=>!t.id||pool.find(p=>p.id===t.id)?.name!==t.name).map(t=>({...t,name:t.name.trim()})),deletes);router.refresh();setOpen(false)}catch(e){setError(userError(e))}})}>{pending?"保存中…":"完成"}</button></div></Modal>}</>
}
export function ScopedTagEditor({tags,selected=[],scope="inspiration"}:{tags?:Tag[];selected?:Tag[];scope?:TagScope}){
 const pool=useTagPool(scope);const [added,setAdded]=useState<Tag[]>([]);const [ids,setIds]=useState(relationMany(selected).map(t=>t.id));
 const options=[...new Map([...relationMany(tags??pool),...relationMany(selected),...added].map(t=>[t.id,t])).values()];
 return <fieldset><legend className="mb-2 text-sm font-medium">标签（可选）</legend><TagStrip>{options.map(t=><label key={t.id} className="cursor-pointer"><input type="checkbox" name="tag_ids" value={t.id} checked={ids.includes(t.id)} onChange={e=>setIds(e.target.checked?[...ids,t.id]:ids.filter(id=>id!==t.id))} className="peer sr-only"/><span className="inline-block max-w-56 truncate rounded-full border px-3 py-1.5 text-sm peer-checked:border-orange-brand peer-checked:bg-orange-brand/10">{t.name}</span></label>)}<NewTag scope={scope} onCreated={t=>{setAdded([...added,t]);setIds([...new Set([...ids,t.id])])}}/></TagStrip></fieldset>
}
