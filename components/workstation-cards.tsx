"use client";
import { userError } from "@/lib/user-error";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateWorkstation } from "@/app/actions";
import { AssetImage } from "@/components/asset-image";
import { useToast } from "@/components/toast";
import { arrayOrEmpty } from "@/lib/relation-values";
import type { Workstation, WorkstationOverview } from "@/lib/types";

function WorkstationEditor({ workstation, onClose }: { workstation: Workstation; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  const toast = useToast();
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  const save = (form: FormData) => start(async () => {
    setError("");
    try { await updateWorkstation(workstation.id, form); router.refresh(); toast({ message: "工作站已更新" }); onClose(); }
    catch (reason) { setError(userError(reason)); }
  });
  return <dialog ref={dialog} aria-label="编辑使用人" onCancel={event => { event.preventDefault(); if (!pending) onClose(); }} className="m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-2xl bg-white p-6 text-ink shadow-float backdrop:bg-black/40 backdrop:backdrop-blur-sm"><h2 className="text-xl font-bold">{workstation.id}号工作站</h2><form onSubmit={event=>{event.preventDefault();save(new FormData(event.currentTarget));}} className="mt-5 space-y-5"><label className="block text-sm font-medium">当前使用人<input autoFocus name="current_user_name" disabled={pending} defaultValue={workstation.current_user_name || ""} placeholder="未分配使用人" className="mt-2 w-full rounded-xl border border-zinc-200 p-3 outline-none focus:border-orange-brand" /></label>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-3"><button type="button" disabled={pending} onClick={onClose} className="round-button">取消</button><button disabled={pending} className="round-button border-orange-brand bg-orange-brand text-white disabled:opacity-60">{pending ? "保存中…" : "保存"}</button></div></form></dialog>;
}
export function WorkstationEditButton({ workstation, compact = false }: { workstation: Workstation; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" aria-label={`编辑${workstation.id}号工作站使用人`} onClick={event => { event.preventDefault(); event.stopPropagation(); setOpen(true); }} className={compact ? "relative z-10 rounded-full px-2 py-1 text-xl leading-none text-zinc-400 hover:bg-zinc-100 hover:text-orange-brand" : "round-button text-sm hover:border-orange-brand hover:text-orange-brand"}>{compact ? "···" : "编辑使用人"}</button>{open && <WorkstationEditor workstation={workstation} onClose={() => setOpen(false)} />}</>;
}
export function WorkstationCards({ workstations, canEdit }: { workstations: WorkstationOverview[]; canEdit: boolean }) {
  return <div className="mt-8 overflow-x-auto pb-3"><section className="content-grid grid-workstations gap-5">{arrayOrEmpty(workstations).slice().sort((a,b) => b.id - a.id).map(workstation => <article key={workstation.id} className="group relative rounded-2xl border border-zinc-200 bg-white p-5 shadow-card transition hover:border-orange-brand/40 hover:shadow-float"><Link href={`/workstations/${workstation.id}`} className="block cursor-pointer focus-visible:outline-orange-brand after:absolute after:inset-0 after:rounded-2xl" aria-label={`进入${workstation.id}号工作站`}><div className="flex items-center gap-3 pr-5"><span className="text-4xl font-semibold tracking-tight text-orange-brand">{workstation.id}</span><div className="min-w-0"><h2 className="text-sm font-bold">号工作站</h2><p className="mt-1 truncate text-sm text-zinc-500">{workstation.current_user_name?.trim() || "未分配使用人"}</p></div></div><div className="my-5 grid h-20 grid-cols-3 gap-2">{workstation.count === 0 ? <div className="col-span-3 grid place-items-center rounded-lg bg-zinc-50 text-sm text-zinc-400">暂无素材</div> : arrayOrEmpty(workstation.previews).map(preview => <AssetImage key={preview.id} src={preview.image} alt={`${workstation.id}号工作站最近素材`} className="h-20 w-full rounded-lg object-cover" placeholderClassName="h-20 w-full" />)}</div><div className="flex items-center justify-between text-sm"><span className="text-zinc-500">共 {workstation.count} 项素材</span><span aria-hidden="true" className="text-lg text-zinc-400 transition group-hover:translate-x-1 group-hover:text-orange-brand">→</span></div></Link>{canEdit && <div className="absolute right-3 top-3"><WorkstationEditButton workstation={workstation} compact /></div>}</article>)}</section></div>;
}
