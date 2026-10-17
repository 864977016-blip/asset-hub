"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createProductionPerson, disableProductionPerson, renameProductionPerson } from "@/app/actions";
import type { ProductionPerson } from "@/lib/types";

export function ProductionPeopleList({people,canEdit}:{people:ProductionPerson[];canEdit:boolean}){
  const router=useRouter();
  const dialog=useRef<HTMLDialogElement>(null);
  const [showHistory,setShowHistory]=useState(false),[adding,setAdding]=useState(false),[editing,setEditing]=useState<string|null>(null),[error,setError]=useState("");
  const [pending,start]=useTransition();
  useEffect(()=>{if(adding)dialog.current?.showModal();else dialog.current?.close();},[adding]);
  const run=(operation:()=>Promise<void>,done?:()=>void)=>start(async()=>{setError("");try{await operation();setEditing(null);done?.();router.refresh();}catch{setError("操作失败，请重试。");}});
  const visible=people.filter(person=>showHistory?Boolean(person.disabled_at):!person.disabled_at);
  return <div className="w-full min-w-0">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">制作人员</h1><p className="mt-2 text-sm text-zinc-500">点击人员查看对应的图片素材</p></div>{canEdit&&<button type="button" onClick={()=>{setError("");setAdding(true);}} className="round-button border-orange-brand bg-orange-brand text-white">+ 新增人员</button>}</header>
    <div className="mt-8 flex gap-5 border-b border-zinc-200 text-sm"><button type="button" aria-pressed={!showHistory} onClick={()=>{setShowHistory(false);setEditing(null);}} className={`pb-3 ${!showHistory?"border-b-2 border-orange-brand font-medium text-orange-brand":"text-zinc-500 hover:text-ink"}`}>在职人员</button><button type="button" aria-pressed={showHistory} onClick={()=>{setShowHistory(true);setEditing(null);}} className={`pb-3 ${showHistory?"border-b-2 border-orange-brand font-medium text-orange-brand":"text-zinc-500 hover:text-ink"}`}>已停用</button></div>
    {error&&!adding&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-zinc-200 py-3 text-xs text-zinc-500 sm:grid-cols-[minmax(0,1fr)_5rem_7rem]"><span>制作人员</span><span className="hidden sm:block">状态</span><span>管理操作</span></div>
    <div className="divide-y divide-zinc-200">{visible.map(person=><div key={person.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-1.5 sm:grid-cols-[minmax(0,1fr)_5rem_7rem]">
      {editing===person.id?<form onSubmit={event=>{event.preventDefault();run(()=>renameProductionPerson(person.id,new FormData(event.currentTarget)));}} className="flex min-w-0 gap-2 py-2"><input autoFocus required name="name" maxLength={100} defaultValue={person.name} disabled={pending} aria-label="编辑姓名" className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 outline-none focus:border-orange-brand"/><button disabled={pending} className="text-sm text-orange-brand">保存</button><button type="button" disabled={pending} onClick={()=>setEditing(null)} className="text-sm text-zinc-500">取消</button></form>:<Link href={`/workstations/people/${person.id}`} className="group flex min-w-0 items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-orange-brand/5"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{person.name}</span><span className="block text-xs text-zinc-400">查看图片素材<span className="sm:hidden"> · {person.disabled_at?"已停用":"在职"}</span></span></span><ArrowRight size={16} className="shrink-0 text-zinc-400 group-hover:text-orange-brand"/></Link>}
      <span className="hidden text-xs text-zinc-500 sm:block">{person.disabled_at?"已停用":"在职"}</span>
      <div className="flex shrink-0 gap-3 text-sm">{canEdit&&!person.disabled_at&&editing!==person.id&&<><button type="button" onClick={()=>setEditing(person.id)} className="text-zinc-500 hover:text-orange-brand">编辑</button><button type="button" disabled={pending} onClick={()=>{if(window.confirm(`停用 ${person.name}？历史作品仍可查看。`))run(()=>disableProductionPerson(person.id));}} className="text-zinc-500 hover:text-orange-brand">停用</button></>}</div>
    </div>)}</div>
    {!visible.length&&<p className="py-12 text-center text-sm text-zinc-500">{showHistory?"暂无停用人员":"暂无在职人员"}</p>}
    {adding&&<dialog ref={dialog} aria-label="新增制作人员" onCancel={event=>{if(pending)event.preventDefault();else setAdding(false);}} className="m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-2xl bg-white p-6 text-ink shadow-float backdrop:bg-black/40"><h2 className="text-xl font-bold">新增人员</h2><form onSubmit={event=>{event.preventDefault();run(()=>createProductionPerson(new FormData(event.currentTarget)),()=>setAdding(false));}} className="mt-5 space-y-4"><label className="block text-sm font-medium">姓名<input autoFocus required name="name" maxLength={100} disabled={pending} className="mt-2 w-full rounded-xl border border-zinc-200 p-3 outline-none focus:border-orange-brand"/></label>{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-3"><button type="button" disabled={pending} onClick={()=>setAdding(false)} className="round-button">取消</button><button disabled={pending} className="round-button border-orange-brand bg-orange-brand text-white">{pending?"保存中…":"新增"}</button></div></form></dialog>}
  </div>;
}
