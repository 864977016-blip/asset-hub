"use client";
import { userError } from "@/lib/user-error";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TagEditor } from "@/components/asset-detail-modal";
import { createInspiration } from "@/app/actions";
import { ImageDropZone, useClipboardImage, useLocalImage, usePageImageDrop } from "@/components/image-drop-zone";
import { useToast } from "@/components/toast";
import type { Tag } from "@/lib/types";

export function InspirationModal({ open, initialFile, initialSourceUrl, onClose, tags }: { open: boolean; initialFile: File | null; initialSourceUrl: string; onClose: () => void; tags: Tag[] }) {
  const { file, previewUrl, setFile } = useLocalImage(initialFile);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const toast = useToast();
  const router = useRouter();
  if (!open) return null;
  const close = () => { if (!pending) { setError(""); setFile(null); onClose(); } };
  const submit = (form: FormData) => startTransition(async () => {
    if (!file) { setError("请选择图片"); return; }
    setError(""); form.set("image", file);
    try { await createInspiration(form); router.refresh(); toast({ message: "灵感已保存" }); setFile(null); onClose(); }
    catch (reason) { const message = userError(reason); setError(message); toast({ message, error: true }); }
  });
  return <div data-upload-modal onDragOver={event => event.preventDefault()} onDrop={event => event.preventDefault()} className="fixed inset-0 z-[60] grid place-items-center bg-black/35 p-5 backdrop-blur-sm"><form onSubmit={event=>{event.preventDefault();submit(new FormData(event.currentTarget));}} className="max-h-[90vh] w-full max-w-lg overflow-auto space-y-4 rounded-2xl bg-white p-6 shadow-float"><h2 className="text-xl font-bold">保存灵感</h2><ImageDropZone file={file} previewUrl={previewUrl} onFileChange={setFile} /><input name="source_url" defaultValue={initialSourceUrl} type="url" placeholder="来源网址（可选）" className="w-full rounded-xl border p-3" /><TagEditor tags={tags} />{error && <p className="text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={close} disabled={pending} className="round-button">取消</button><button disabled={pending} className="round-button border-orange-brand bg-orange-brand text-white hover:bg-orange-deep disabled:opacity-60">{pending ? "保存中…" : "保存灵感"}</button></div></form></div>;
}

export function InspirationPageDropZone({ children, tags }: { children: React.ReactNode; tags: Tag[] }) {
  const [open, setOpen] = useState(false);
  const [initialFile, setInitialFile] = useState<File | null>(null);
  const [initialSourceUrl, setInitialSourceUrl] = useState("");
  const { toast } = { toast: useToast() };
  const openWith = useCallback((file?: File, sourceUrl?: string) => { setInitialFile(file ?? null); setInitialSourceUrl(sourceUrl ?? ""); setOpen(true); }, []);
  const onUnsupported = useCallback(() => toast({ message: "暂不支持直接拖入此网络图片，请复制图片后使用 Ctrl+V。", error: true }), [toast]);
  const { isDragging } = usePageImageDrop((file, sourceUrl) => openWith(file, sourceUrl), onUnsupported, !open);
  useClipboardImage((file, sourceUrl) => openWith(file, sourceUrl));
  return <div className="relative"><InspirationModal tags={tags} open={open} initialFile={initialFile} initialSourceUrl={initialSourceUrl} onClose={() => { setOpen(false); setInitialFile(null); setInitialSourceUrl(""); }} />{children}{isDragging && <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-ink/15 backdrop-blur-[1px]"><div className="rounded-2xl border border-orange-brand/40 bg-white/95 px-10 py-8 text-center shadow-float"><p className="text-lg font-bold text-ink">松开即可保存灵感</p><p className="mt-2 text-sm text-zinc-500">图片将添加到素材库</p></div></div>}<button onClick={() => openWith()} className="fixed bottom-6 right-6 z-40 round-button border-orange-brand bg-orange-brand text-white shadow-float hover:bg-orange-deep">+ 添加素材</button></div>;
}
