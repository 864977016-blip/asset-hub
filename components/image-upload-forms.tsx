"use client";
import { userError } from "@/lib/user-error";

import { createContext, useCallback, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSharedAsset, uploadStoreAsset } from "@/app/actions";
import { ImageDropZone, useClipboardImage, useLocalImage, usePageImageDrop } from "@/components/image-drop-zone";
import { useToast } from "@/components/toast";
import { StoreSelector } from "@/components/store-selector";
import type { StoreOption, Tag } from "@/lib/types";

import { TagEditor, WorkstationSelector, assetCategories as categories } from "@/components/asset-detail-modal";
type UploadContextValue = { openWith: (file?: File) => void; isModalOpen: boolean; category: string; setCategory: (value:string)=>void };
export function useStoreUpload(){return useContext(StoreUploadContext)}
const StoreUploadContext = createContext<UploadContextValue | null>(null);

function UploadDialog({ children, title, open }: { children: React.ReactNode; title: string; open: boolean }) {
  if (!open) return null;
  return <div data-upload-modal onDragOver={event => event.preventDefault()} onDrop={event => event.preventDefault()} className="fixed inset-0 z-[60] grid place-items-center bg-black/35 p-5 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-float"><h2 className="text-xl font-bold">{title}</h2>{children}</div></div>;
}

export function StoreAssetModal({ storeId, workstations, tags, open, initialFile, onClose, initialCategory = "" }: { initialCategory?: string; storeId: string; workstations: any[]; tags: Tag[]; open: boolean; initialFile: File | null; onClose: () => void }) {
  const { file, previewUrl, setFile } = useLocalImage(initialFile);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const toast = useToast();
  const router = useRouter();
  const close = () => { if (!pending) { setError(""); setFile(null); onClose(); } };
  const submit = (form: FormData) => startTransition(async () => {
    if (!file) { setError("请选择图片"); return; }
    setError("");
    form.set("image", file);
    try { await uploadStoreAsset(storeId, form); router.refresh(); toast({ message: "素材上传成功" }); setFile(null); onClose(); }
    catch (reason) { const message = userError(reason,"上传失败，请重试。"); setError(message); toast({ message, error: true }); }
  });

  return <UploadDialog title="上传素材" open={open}><form onSubmit={event=>{event.preventDefault();submit(new FormData(event.currentTarget));}} className="mt-4 space-y-4"><ImageDropZone file={file} previewUrl={previewUrl} onFileChange={setFile} /><select aria-label="分类" name="category" defaultValue={initialCategory} required className="w-full rounded-xl border p-3"><option value="">请选择分类</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><TagEditor scope="store" tags={tags} /><WorkstationSelector workstations={workstations} />{error && <p className="text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={close} disabled={pending} className="round-button">取消</button><button disabled={pending} className="round-button border-orange-brand bg-orange-brand text-white hover:bg-orange-deep disabled:opacity-60">{pending ? "上传中…" : "上传素材"}</button></div></form></UploadDialog>;
}

export function StoreAssetUploadProvider({ storeId, workstations, tags, children, stores = [] }: { stores?: StoreOption[]; storeId: string; workstations: any[]; tags: Tag[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialFile, setInitialFile] = useState<File | null>(null);
  const [category,setCategory]=useState("all");
  const openWith = useCallback((file?: File) => { setInitialFile(file ?? null); setOpen(true); }, []);
  return <StoreUploadContext.Provider value={{ openWith, isModalOpen: open, category, setCategory }}>{category === "shared" ? (open && <SharedAssetModal stores={stores} workstations={workstations} initialStores={stores.filter(s=>s.id===storeId)} open initialFile={initialFile} onClose={()=>{setOpen(false);setInitialFile(null)}}/>) : <StoreAssetModal key={category} initialCategory={category === "all" ? "" : category} storeId={storeId} workstations={workstations} tags={tags} open={open} initialFile={initialFile} onClose={() => { setOpen(false); setInitialFile(null); }} />}{children}</StoreUploadContext.Provider>;
}

export function StoreAssetUploadTrigger() {
  const context = useContext(StoreUploadContext);
  if (!context) throw new Error("StoreAssetUploadTrigger 必须在 StoreAssetUploadProvider 中使用");
  return <button onClick={() => context.openWith()} className="round-button border-orange-brand bg-orange-brand text-white hover:bg-orange-deep">{context.category === "shared" ? "+ 添加共享素材" : "+ 添加素材"}</button>;
}

export function StoreAssetPageDropZone({ children }: { children: React.ReactNode }) {
  const context = useContext(StoreUploadContext);
  if (!context) throw new Error("StoreAssetPageDropZone 必须在 StoreAssetUploadProvider 中使用");
  const openImage = useCallback((file: File) => context.openWith(file), [context]);
  const { isDragging } = usePageImageDrop(openImage, () => alert("暂不支持直接拖入此网络图片，请复制图片后使用 Ctrl+V。"), !context.isModalOpen);
  useClipboardImage(openImage);
  return <div className="relative">{children}{isDragging && <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-ink/15 backdrop-blur-[1px]"><div className="rounded-2xl border border-orange-brand/40 bg-white/95 px-10 py-8 text-center shadow-float"><p className="text-lg font-bold text-ink">松开即可添加素材</p><p className="mt-2 text-sm text-zinc-500">图片将添加到当前店铺</p></div></div>}</div>;
}

export function SharedAssetModal({ stores, workstations, open, initialFile, onClose, initialStores = [] }: { initialStores?:StoreOption[]; stores: StoreOption[]; workstations: any[]; open: boolean; initialFile: File | null; onClose: () => void }) {
  const { file, previewUrl, setFile } = useLocalImage(initialFile);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const toast = useToast();
  const router = useRouter();
  const close = () => { if (!pending) { setError(""); setFile(null); onClose(); } };
  const submit = (form: FormData) => startTransition(async () => {
    if (!file) { setError("请选择图片"); return; }
    setError(""); form.set("image", file);
    try { await createSharedAsset(form); router.refresh(); toast({ message: "共享素材上传成功" }); setFile(null); onClose(); }
    catch (reason) { const message = userError(reason,"上传失败，请重试。"); setError(message); toast({ message, error: true }); }
  });
  return <UploadDialog title="新增共享素材" open={open}><form onSubmit={event=>{event.preventDefault();submit(new FormData(event.currentTarget));}} className="mt-4 space-y-4"><ImageDropZone file={file} previewUrl={previewUrl} onFileChange={setFile} /><StoreSelector stores={stores} selected={initialStores} /><WorkstationSelector workstations={workstations} /><label className="block text-sm font-medium">备注（可选）<textarea name="description" placeholder="添加团队内部备注…" rows={3} className="mt-2 w-full rounded-xl border p-3 text-sm" /></label>{error && <p className="text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={close} disabled={pending} className="round-button">取消</button><button disabled={pending} className="round-button border-orange-brand bg-orange-brand text-white hover:bg-orange-deep disabled:opacity-60">{pending ? "上传中…" : "保存共享素材"}</button></div></form></UploadDialog>;
}
export function SharedAssetUpload({ stores, workstations }: { stores: StoreOption[]; workstations: any[] }) {
  const [open, setOpen] = useState(false);
  const [initialFile, setInitialFile] = useState<File | null>(null);
  const openWith = useCallback((file?: File) => { setInitialFile(file ?? null); setOpen(true); }, []);
  const { isDragging } = usePageImageDrop(openWith, undefined, !open);
  useClipboardImage(openWith, !open);
  return <>{open && <SharedAssetModal stores={stores} workstations={workstations} open initialFile={initialFile} onClose={() => { setOpen(false); setInitialFile(null); }} />}{isDragging && <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-ink/15"><div className="rounded-2xl bg-white px-10 py-8 shadow-float"><b>松开即可添加共享素材</b></div></div>}<button onClick={() => openWith()} className="round-button border-orange-brand bg-orange-brand text-white hover:bg-orange-deep">新增共享素材</button></>;
}
