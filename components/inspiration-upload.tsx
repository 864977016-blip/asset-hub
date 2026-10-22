"use client";
import { userError } from "@/lib/user-error";
import { watchUploadRefresh } from "@/lib/upload-batch";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { TagEditor } from "@/components/asset-detail-modal";
import { UploadSelection, useUploadSelection } from "./upload-selection";
import { useClipboardImage, usePageImageDrop } from "@/components/image-drop-zone";
import { useToast } from "@/components/toast";
import type { Tag } from "@/lib/types";

export function InspirationModal({ open, initialFile, initialFiles, initialSourceUrl, onClose, tags }: { open: boolean; initialFile: File | null; initialFiles?:File[]; initialSourceUrl: string; onClose: () => void; tags: Tag[] }) {
  const upload=useUploadSelection(initialFile,initialFiles),{pending}=upload;
  const [error, setError] = useState("");
  const toast = useToast();
  const router = useRouter();
  if (!open) return null;
  const close = () => { if (!pending) { setError(""); onClose(); } };
  const submit = async (form: FormData) => {
    if (!upload.items.length) { setError("请选择图片"); return; }
    setError("");
    try { const results=await upload.save(form,"inspiration");if(!results)return;const saved=results.filter(item=>item.status==="success").length;if(saved===results.length){onClose();toast({message:`已保存 ${saved} 张灵感`});}else setError(`已保存 ${saved} 张，失败 ${results.length-saved} 张；可重试失败项。`);if(saved){watchUploadRefresh(results);router.refresh();} }
    catch (reason) { const message = userError(reason); setError(message); toast({ message, error: true }); }
  };
  return <div data-upload-modal onDragOver={event => event.preventDefault()} onDrop={event => event.preventDefault()} className="fixed inset-0 z-[60] grid place-items-center bg-black/35 p-5 backdrop-blur-sm"><form onSubmit={event=>{event.preventDefault();void submit(new FormData(event.currentTarget));}} className="max-h-[90vh] w-full max-w-lg overflow-auto space-y-4 rounded-2xl bg-white p-6 shadow-float"><h2 className="text-xl font-bold">保存灵感</h2><UploadSelection upload={upload}/><fieldset disabled={pending||upload.started} className="space-y-4"><input name="source_url" defaultValue={initialSourceUrl} type="url" placeholder="来源网址（可选）" className="w-full rounded-xl border p-3" /><TagEditor tags={tags} /></fieldset>{error && <p className="text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={close} disabled={pending} className="round-button">取消</button><button disabled={pending} className="round-button border-orange-brand bg-orange-brand text-white hover:bg-orange-deep disabled:opacity-60">{pending ? "保存中…" : upload.started?"重试失败项":"保存灵感"}</button></div></form></div>;
}

export function InspirationPageDropZone({ children, tags }: { children: React.ReactNode; tags: Tag[] }) {
  const [open, setOpen] = useState(false);
  const [initialFile, setInitialFile] = useState<File | null>(null);
  const [initialFiles,setInitialFiles]=useState<File[]>([]);
  const [initialSourceUrl, setInitialSourceUrl] = useState("");
  const { toast } = { toast: useToast() };
  const openWith = useCallback((file?: File, sourceUrl?: string) => { setInitialFile(file ?? null);setInitialFiles(file?[file]:[]); setInitialSourceUrl(sourceUrl ?? ""); setOpen(true); }, []);
  const openImages=useCallback((files:File[],sourceUrl?:string)=>{setInitialFile(files[0]??null);setInitialFiles(files);setInitialSourceUrl(sourceUrl??"");setOpen(true);},[]);
  const onUnsupported = useCallback(() => toast({ message: "暂不支持直接拖入此网络图片，请复制图片后使用 Ctrl+V。", error: true }), [toast]);
  const { isDragging } = usePageImageDrop(openWith, onUnsupported, !open,false,openImages);
  useClipboardImage((file, sourceUrl) => openWith(file, sourceUrl));
  return <div className="relative">{open&&<InspirationModal tags={tags} open initialFile={initialFile} initialFiles={initialFiles} initialSourceUrl={initialSourceUrl} onClose={() => { setOpen(false); setInitialFile(null); setInitialSourceUrl(""); }} />}{children}{isDragging && <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-ink/15 backdrop-blur-[1px]"><div className="rounded-2xl border border-orange-brand/40 bg-white/95 px-10 py-8 text-center shadow-float"><p className="text-lg font-bold text-ink">松开即可保存灵感</p><p className="mt-2 text-sm text-zinc-500">图片将添加到素材库</p></div></div>}<button onClick={() => openWith()} className="fixed bottom-6 right-6 z-40 round-button border-orange-brand bg-orange-brand text-white shadow-float hover:bg-orange-deep">+ 添加素材</button></div>;
}
