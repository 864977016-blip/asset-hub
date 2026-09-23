"use client";
import { userError } from "@/lib/user-error";
import { AssetImage } from "@/components/asset-image";
import { arrayOrEmpty } from "@/lib/relation-values";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import type { Tag, Workstation } from "@/lib/types";

export const assetCategories = [["main", "主图"], ["scene", "副图"], ["a_plus", "A+"], ["other", "其他"]];
export { ScopedTagEditor as TagEditor } from "./tag-tools";
export function WorkstationSelector({ workstations, selected = [] }: { workstations: Workstation[]; selected?: Workstation[] }) {
  workstations = arrayOrEmpty(workstations); selected = arrayOrEmpty(selected);
  return <fieldset><legend className="mb-2 text-sm font-medium">工作站位置（可多选）</legend><div className="flex flex-wrap gap-3 text-sm text-zinc-600">{workstations.map(item => <label key={item.id} className="cursor-pointer"><input name="workstation_ids" value={item.id} defaultChecked={selected.some(value => value.id === item.id)} type="checkbox" className="accent-orange-brand" /> {item.id}号{item.current_user_name ? ` · ${item.current_user_name}` : ""}</label>)}</div></fieldset>;
}
export function ImagePreview({ src, alt }: { src: string | null; alt: string }) {
  return <div className="grid min-h-64 place-items-center bg-zinc-100 p-5"><AssetImage src={src} alt={alt} loading="eager" className="max-h-[65vh] w-full object-contain" placeholderClassName="min-h-64 w-full" /></div>;
}
export function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return <div><p className="text-sm font-medium">{label}</p><div className="mt-2 text-sm text-zinc-600">{children}</div></div>;
}
export function TagList({ tags }: { tags: Tag[] }) {
  tags = arrayOrEmpty(tags);
  return <div className="flex flex-wrap gap-2">{tags.length ? tags.map(tag => <span key={tag.id} className="rounded-full border border-orange-brand/30 bg-orange-brand/10 px-3 py-1 text-xs text-ink">{tag.name}</span>) : "未添加标签"}</div>;
}
export function savedTime(value?: string) {
  return value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "未记录";
}
export function AssetDetailModal({ title, image, children, editor, onSave, onClose, success, canEdit = true, actions }: { title: string; image: string | null; children: ReactNode; editor: ReactNode; onSave: (form: FormData) => Promise<void>; onClose: () => void; success: string; canEdit?: boolean; actions?: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const toast = useToast();
  const router = useRouter();
  useEffect(() => { const element = dialog.current; const previous = document.activeElement as HTMLElement | null; element?.showModal(); const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus(); }; }, []);
  const save = (form: FormData) => start(async () => {
    setError("");
    try { await onSave(form); router.refresh(); toast({ message: success }); onClose(); }
    catch (reason) { setError(userError(reason)); router.refresh(); }
  });
  return <dialog onDragOver={event => event.preventDefault()} onDrop={event => event.preventDefault()} ref={dialog} data-asset-detail="true" aria-label={title} onCancel={event => { event.preventDefault(); if (!pending) onClose(); }} className="m-auto max-h-[90vh] w-[calc(100%_-_2rem)] max-w-4xl overflow-auto rounded-2xl bg-white p-0 text-ink shadow-float backdrop:bg-black/45 backdrop:backdrop-blur-sm"><div className="grid md:grid-cols-[1.3fr_1fr]"><ImagePreview src={image} alt={title} /><div className="p-6"><div className="flex items-center justify-between gap-4"><h2 className="text-xl font-bold">{title}</h2><button type="button" aria-label="关闭详情" disabled={pending} onClick={onClose} className="round-button">×</button></div>{editing ? <form onSubmit={event=>{event.preventDefault();save(new FormData(event.currentTarget));}} className="mt-6 space-y-5"><fieldset disabled={pending} className="space-y-5">{editor}</fieldset>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-3"><button type="button" disabled={pending} onClick={() => { setError(""); setEditing(false); }} className="round-button">取消</button><button disabled={pending} className="round-button border-orange-brand bg-orange-brand text-white disabled:opacity-60">{pending ? "保存中…" : "保存"}</button></div></form> : <div className="mt-6 space-y-6">{children}<div className="flex items-center justify-between">{canEdit && <button onClick={() => setEditing(true)} className="round-button">编辑详情</button>}{actions}</div></div>}</div></div></dialog>;
}
