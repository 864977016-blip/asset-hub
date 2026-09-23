"use client";
import { arrayOrEmpty } from "@/lib/relation-values";
import {TagStrip,NewTag,TagOrganizer} from "./tag-tools";
import type { Tag,TagScope } from "@/lib/types";
export const filterClass = (active: boolean) => `cursor-pointer whitespace-nowrap rounded-full border px-4 py-2 text-sm transition ${active ? "border-orange-brand bg-orange-brand/10 text-ink" : "border-zinc-200 bg-white text-zinc-600 hover:border-orange-brand"}`;
export function TagFilter({tags,selected,onChange,scope="inspiration"}:{tags:Tag[];selected:string[];onChange:(ids:string[])=>void;scope?:TagScope}){
 tags=arrayOrEmpty(tags);selected=arrayOrEmpty(selected);
 return <div aria-label="标签筛选" className="mb-7 flex min-w-0 items-center gap-3"><div className="min-w-0 flex-1"><TagStrip><button type="button" aria-pressed={!selected.length} onClick={()=>onChange([])} className={filterClass(!selected.length)}>全部</button>{tags.map(t=><button type="button" key={t.id} title={t.name} aria-pressed={selected.includes(t.id)} onClick={()=>onChange(selected.includes(t.id)?selected.filter(id=>id!==t.id):[...selected,t.id])} className={filterClass(selected.includes(t.id))+" max-w-56 truncate"}>{t.name}</button>)}<NewTag scope={scope}/></TagStrip></div><TagOrganizer scope={scope}/></div>
}
