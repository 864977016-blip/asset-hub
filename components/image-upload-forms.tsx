"use client";
import { ParentSelector } from "./parent-selector";
import { userError } from "@/lib/user-error";
import { watchUploadRefresh } from "@/lib/upload-batch";

import { createContext, useCallback, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadSelection, useUploadSelection } from "./upload-selection";
import { useClipboardImage, usePageImageDrop } from "@/components/image-drop-zone";
import { useToast } from "@/components/toast";
import { StoreSelector } from "@/components/store-selector";
import type { StoreOption, Tag, ProductionPerson } from "@/lib/types";

import { ProductionPersonSelector, assetCategories as categories } from "@/components/asset-detail-modal";
type UploadContextValue = { openWith: (file?: File,files?:File[]) => void; isModalOpen: boolean; category: string; setCategory: (value:string)=>void };
export function useStoreUpload(){return useContext(StoreUploadContext)}
const StoreUploadContext = createContext<UploadContextValue | null>(null);

function UploadDialog({ children, title, open }: { children: React.ReactNode; title: string; open: boolean }) {
  if (!open) return null;
  return <div data-upload-modal onDragOver={event => event.preventDefault()} onDrop={event => event.preventDefault()} className="fixed inset-0 z-[60] grid place-items-center bg-black/35 p-5 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-float"><h2 className="text-xl font-bold">{title}</h2>{children}</div></div>;
}

export function StoreAssetModal({ storeId, people, open, initialFile, initialFiles, onClose, initialCategory = "", parents, initialPeople = [], onUploaded }: { parents?:{id:string;name:string}[]; initialCategory?: string; storeId: string; people: ProductionPerson[]; open: boolean; initialFile: File | null; initialFiles?: File[]; onClose: () => void; initialPeople?: ProductionPerson[]; onUploaded?: () => void }) {
  const upload=useUploadSelection(initialFile,initialFiles),{pending}=upload;
  const router=useRouter();
  const [error, setError] = useState("");
  const toast = useToast();
  const close = () => { if (!pending) { setError(""); onClose(); } };
  const submit = async (form: FormData) => {
    if (!upload.items.length) { setError("请选择图片"); return; }
    setError("");form.set("store_id",storeId);
    try { const results=await upload.save(form,"store");if(!results)return;const saved=results.filter(item=>item.status==="success").length;if(saved===results.length){onClose();toast({message:`已保存 ${saved} 张素材`});}else setError(`已保存 ${saved} 张，失败 ${results.length-saved} 张；可重试失败项。`);if(saved){watchUploadRefresh(results);if(onUploaded)onUploaded();else router.refresh();} }
    catch (reason) { const message = userError(reason,"上传失败，请重试。"); setError(message); toast({ message, error: true }); }
  };

  return <UploadDialog title="上传素材" open={open}><form onSubmit={event=>{event.preventDefault();void submit(new FormData(event.currentTarget));}} className="mt-4 space-y-4"><UploadSelection upload={upload}/><fieldset disabled={pending||upload.started} className="space-y-4"><select aria-label="分类" name="category" defaultValue={initialCategory} required className="w-full rounded-xl border p-3"><option value="">请选择分类</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ParentSelector storeId={storeId} options={parents}/><ProductionPersonSelector people={people} selected={initialPeople}/></fieldset>{error && <p className="text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={close} disabled={pending} className="round-button">取消</button><button disabled={pending} className="round-button border-orange-brand bg-orange-brand text-white hover:bg-orange-deep disabled:opacity-60">{pending ? "上传中…" : upload.started?"重试失败项":"上传素材"}</button></div></form></UploadDialog>;
}

export function StoreAssetUploadProvider({ storeId, people, tags, children, stores = [], parents }: { parents?:{id:string;name:string}[]; stores?: StoreOption[]; storeId: string; people: ProductionPerson[]; tags: Tag[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialFile, setInitialFile] = useState<File | null>(null);
  const [initialFiles,setInitialFiles]=useState<File[]>([]);
  const [category,setCategory]=useState("all");
  const openWith = useCallback((file?: File,files?:File[]) => { setInitialFile(file ?? null);setInitialFiles(files??(file?[file]:[]));setOpen(true); }, []);
  return <StoreUploadContext.Provider value={{ openWith, isModalOpen: open, category, setCategory }}>{open&&(category === "shared" ? <SharedAssetModal stores={stores} people={people} initialStores={stores.filter(s=>s.id===storeId)} open initialFile={initialFile} initialFiles={initialFiles} onClose={()=>{setOpen(false);setInitialFile(null)}}/> : <StoreAssetModal parents={parents} key={category} initialCategory={category === "all" ? "" : category} storeId={storeId} people={people} open initialFile={initialFile} initialFiles={initialFiles} onClose={() => { setOpen(false); setInitialFile(null); }} />)}{children}</StoreUploadContext.Provider>;
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
  const openImages=useCallback((files:File[])=>context.openWith(files[0],files),[context]);
  const { isDragging } = usePageImageDrop(openImage, () => alert("暂不支持直接拖入此网络图片，请复制图片后使用 Ctrl+V。"), !context.isModalOpen,false,openImages);
  useClipboardImage(openImage);
  return <div className="relative">{children}{isDragging && <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-ink/15 backdrop-blur-[1px]"><div className="rounded-2xl border border-orange-brand/40 bg-white/95 px-10 py-8 text-center shadow-float"><p className="text-lg font-bold text-ink">松开即可添加素材</p><p className="mt-2 text-sm text-zinc-500">图片将添加到当前店铺</p></div></div>}</div>;
}

export function SharedAssetModal({ stores, people, open, initialFile, initialFiles, onClose, initialStores = [], initialPeople = [], onUploaded }: { initialStores?:StoreOption[]; stores: StoreOption[]; people: ProductionPerson[]; open: boolean; initialFile: File | null; initialFiles?:File[]; onClose: () => void; initialPeople?: ProductionPerson[]; onUploaded?: () => void }) {
  const upload=useUploadSelection(initialFile,initialFiles),{pending}=upload;
  const router=useRouter();
  const [error, setError] = useState("");
  const toast = useToast();
  const close = () => { if (!pending) { setError(""); onClose(); } };
  const submit = async (form: FormData) => {
    if (!upload.items.length) { setError("请选择图片"); return; }
    setError("");
    try { const results=await upload.save(form,"shared");if(!results)return;const saved=results.filter(item=>item.status==="success").length;if(saved===results.length){onClose();toast({message:`已保存 ${saved} 张共享素材`});}else setError(`已保存 ${saved} 张，失败 ${results.length-saved} 张；可重试失败项。`);if(saved){watchUploadRefresh(results);if(onUploaded)onUploaded();else router.refresh();} }
    catch (reason) { const message = userError(reason,"上传失败，请重试。"); setError(message); toast({ message, error: true }); }
  };
  return <UploadDialog title="新增共享素材" open={open}><form onSubmit={event=>{event.preventDefault();void submit(new FormData(event.currentTarget));}} className="mt-4 space-y-4"><UploadSelection upload={upload}/><fieldset disabled={pending||upload.started} className="space-y-4"><StoreSelector stores={stores} selected={initialStores} /><ProductionPersonSelector people={people} selected={initialPeople}/><label className="block text-sm font-medium">备注（可选）<textarea name="description" placeholder="添加团队内部备注…" rows={3} className="mt-2 w-full rounded-xl border p-3 text-sm" /></label></fieldset>{error && <p className="text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={close} disabled={pending} className="round-button">取消</button><button disabled={pending} className="round-button border-orange-brand bg-orange-brand text-white hover:bg-orange-deep disabled:opacity-60">{pending ? "上传中…" : upload.started?"重试失败项":"保存共享素材"}</button></div></form></UploadDialog>;
}
export function SharedAssetUpload({ stores, people }: { stores: StoreOption[]; people: ProductionPerson[] }) {
  const [open, setOpen] = useState(false);
  const [initialFile, setInitialFile] = useState<File | null>(null);
  const [initialFiles,setInitialFiles]=useState<File[]>([]);
  const openWith = useCallback((file?: File) => { setInitialFile(file ?? null);setInitialFiles(file?[file]:[]); setOpen(true); }, []);
  const openImages=useCallback((files:File[])=>{setInitialFile(files[0]??null);setInitialFiles(files);setOpen(true);},[]);
  const { isDragging } = usePageImageDrop(openWith, undefined, !open,false,openImages);
  useClipboardImage(openWith, !open);
  return <>{open && <SharedAssetModal stores={stores} people={people} open initialFile={initialFile} initialFiles={initialFiles} onClose={() => { setOpen(false); setInitialFile(null); }} />}{isDragging && <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-ink/15"><div className="rounded-2xl bg-white px-10 py-8 shadow-float"><b>松开即可添加共享素材</b></div></div>}<button onClick={() => openWith()} className="round-button border-orange-brand bg-orange-brand text-white hover:bg-orange-deep">新增共享素材</button></>;
}
