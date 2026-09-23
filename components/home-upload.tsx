"use client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, type ReactNode } from "react";
import { InspirationModal } from "@/components/inspiration-upload";
import { SharedAssetModal, StoreAssetModal } from "@/components/image-upload-forms";
import { useClipboardImage, usePageImageDrop } from "@/components/image-drop-zone";
import { useToast } from "@/components/toast";
import { relationMany } from "@/lib/relation-values";
import { emptyHomeUpload, homeUploadReducer } from "@/lib/home-upload-state";
import type { StoreOption, Tag, Workstation } from "@/lib/types";

export type HomeUploadOptions = { stores: StoreOption[]; tags: Tag[]; storeTags?: Tag[]; workstations: Workstation[] };
const HomeUploadContext = createContext<(() => void) | null>(null);
function TargetDialog({ children, title, onClose }: { children: ReactNode; title: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; const previous = document.activeElement as HTMLElement | null; dialog?.showModal(); return () => { dialog?.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }} className="m-auto max-h-[90vh] w-[calc(100%_-_2rem)] max-w-lg overflow-auto rounded-2xl bg-white p-6 text-ink shadow-float backdrop:bg-black/40 backdrop:backdrop-blur-sm"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">{title}</h2><button type="button" aria-label="取消添加素材" onClick={onClose} className="round-button">×</button></div>{children}</dialog>;
}
export function HomeAddButton() {
  const open = useContext(HomeUploadContext);
  return <button type="button" aria-label="新增素材" onClick={() => open?.()} className="grid h-9 w-9 place-items-center rounded-full bg-orange-brand text-white shadow-card transition hover:bg-orange-deep"><Plus size={18} /></button>;
}
export function HomeUploadProvider({ stores, tags, workstations, children, storeTags = [], captureImages = false }: HomeUploadOptions & { children: ReactNode; captureImages?: boolean }) {
  const [state, dispatch] = useReducer(homeUploadReducer, emptyHomeUpload);
  const toast = useToast();
  const active = state.step !== "closed";
  const receive = useCallback((file: File, sourceUrl?: string) => dispatch({ type: "open", file, sourceUrl }), []);
  const unsupported = useCallback(() => toast({ message: "未取得图片文件，请复制图片后粘贴或选择本地图片。", error: true }), [toast]);
  useClipboardImage(receive, captureImages && !active);
  const { isDragging } = usePageImageDrop(receive, unsupported, captureImages && !active, true);
  useEffect(() => {
    if (!active) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Let the active modal's local drop zone handle files; stop browser navigation elsewhere.
    const prevent = (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("dragover", prevent); window.removeEventListener("drop", prevent); };
  }, [active]);
  const close = () => dispatch({ type: "close" });
  const availableStores = relationMany(stores).filter(store => !store.archivedAt);
  return <HomeUploadContext.Provider value={() => dispatch({ type: "open" })}>{children}{active && <span hidden data-global-upload="true" />}
    {isDragging && !active && <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-ink/15 backdrop-blur-[1px]"><div className="rounded-2xl border border-orange-brand/40 bg-white/95 px-10 py-8 text-lg font-bold shadow-float">松开以添加素材</div></div>}
    {state.step === "target" && <TargetDialog title="添加素材" onClose={close}><p className="mb-4 text-sm text-zinc-500">选择保存位置{state.file ? " · 图片已保留" : ""}</p><div className="space-y-3">{[
      { id: "inspiration" as const, title: state.file ? "素材库" : "添加灵感素材", description: "保存外部灵感和参考图片" },
      { id: "shared" as const, title: state.file ? "共享素材" : "添加共享素材", description: "保存团队可复用视觉资产" },
      { id: "store" as const, title: state.file ? "店铺素材" : "添加店铺素材", description: "保存指定 Amazon 店铺资产" },
    ].map(target => <button type="button" key={target.id} onClick={() => dispatch({ type: "target", target: target.id })} className="block w-full rounded-xl border border-zinc-200 p-4 text-left transition hover:border-orange-brand hover:bg-orange-brand/5"><span className="font-semibold">{target.title}</span><span className="mt-1 block text-sm text-zinc-500">{target.description}</span></button>)}</div></TargetDialog>}
    {state.step === "store-picker" && <TargetDialog title="选择店铺" onClose={close}><button type="button" onClick={() => dispatch({ type: "back" })} className="mb-4 text-sm text-zinc-500 hover:text-orange-brand">← 返回保存位置</button><div className="grid gap-3 sm:grid-cols-2">{availableStores.map(store => <button key={store.id} type="button" onClick={() => dispatch({ type: "store", id: store.id })} className="rounded-xl border border-zinc-200 p-4 text-left font-medium transition hover:border-orange-brand hover:bg-orange-brand/5">{store.name}</button>)}</div>{!availableStores.length && <p className="py-8 text-center text-sm text-zinc-500">还没有店铺。<Link href="/stores" onClick={close} className="text-orange-brand">前往管理店铺 →</Link></p>}</TargetDialog>}
    {state.step === "inspiration" && <InspirationModal open initialFile={state.file} initialSourceUrl={state.sourceUrl} tags={tags} onClose={close} />}
    {state.step === "shared" && <SharedAssetModal open initialFile={state.file} stores={availableStores} workstations={workstations} onClose={close} />}
    {state.step === "store" && state.storeId && <StoreAssetModal key={state.storeId} open initialFile={state.file} storeId={state.storeId} tags={storeTags} workstations={workstations} onClose={close} />}
  </HomeUploadContext.Provider>;
}
