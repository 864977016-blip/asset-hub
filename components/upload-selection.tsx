"use client";
import { useEffect, useRef, useState } from "react";
import { ImageDropZone, useLocalImage } from "./image-drop-zone";
import { postUpload, uploadBatch, type UploadItem } from "@/lib/upload-batch";

export function useUploadSelection(initialFile: File | null, initialFiles?: File[]) {
  const [items,setItems] = useState<UploadItem[]>(() => (initialFiles ?? (initialFile ? [initialFile] : [])).map(file => ({id:crypto.randomUUID(),file,status:"waiting"})));
  const [pending,setPending] = useState(false);
  const running = useRef(false), assignment = useRef<FormData | null>(null);
  const updates=useRef(new Map<string,number>());
  useEffect(()=>{if(process.env.NODE_ENV!=="development")return;for(const item of items){const at=updates.current.get(item.id);if(at!==undefined){console.info(`[image-upload:${item.id.slice(0,8)}] state-applied`,{status:item.status,updateMs:Math.round(performance.now()-at)});updates.current.delete(item.id);}}},[items]);
  const setFiles = (files: File[]) => { if (running.current || assignment.current) return; setItems(files.filter(file=>file.type.startsWith("image/")).map(file=>({id:crypto.randomUUID(),file,status:"waiting"}))); };
  async function save(form: FormData, target: string) {
    if (running.current || !items.length) return null;
    running.current=true;setPending(true);assignment.current??=form;
    try { return await uploadBatch(items,item=>postUpload(item,assignment.current!,target),result=>{updates.current.set(result.id,performance.now());setItems(current=>current.map(item=>item.id===result.id?result:item));}); }
    finally { running.current=false;setPending(false); }
  }
  return {items,pending,setFiles,save,started:Boolean(assignment.current)};
}
export function UploadSelection({upload}:{upload:ReturnType<typeof useUploadSelection>}) {
  const {file,previewUrl}=useLocalImage(upload.items[0]?.file??null);
  const success=upload.items.filter(item=>item.status==="success").length;
  const finished=upload.items.filter(item=>item.status==="success"||item.status==="error").length;
  return <div className="space-y-3"><fieldset disabled={upload.pending||upload.started}><ImageDropZone file={file} previewUrl={previewUrl} onFileChange={file=>upload.setFiles(file?[file]:[])} onFilesChange={upload.setFiles}/></fieldset>
    {!!upload.items.length&&<div aria-live="polite" className="text-sm text-zinc-500">已选 {upload.items.length} 张 · 已保存 {success} 张{upload.started?` · 已完成 ${finished}/${upload.items.length}`:""}</div>}
    <ul className="max-h-40 space-y-2 overflow-y-auto text-xs">{upload.items.map(item=><li key={item.id} className="flex items-start justify-between gap-3"><span className="min-w-0 truncate">{item.file.name}</span><span className={`shrink-0 ${item.status==="error"?"max-w-[65%] text-red-600":"text-zinc-500"}`}>{item.status==="waiting"?"待上传":item.status==="uploading"?"传输 / 压缩 / 保存中…":item.status==="success"?"已保存":item.error}</span></li>)}</ul>
  </div>;
}
