"use client";
import {AssetImage} from "./asset-image";

import { ChangeEvent, DragEvent as ReactDragEvent, useEffect, useRef, useState } from "react";

export function useLocalImage(initialFile?: File | null) {
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const started=performance.now(),url = URL.createObjectURL(file);
    if(process.env.NODE_ENV==="development")console.info("[image-upload] local-preview",{prepareMs:Math.round(performance.now()-started),bytes:file.size});
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => { setFile(initialFile ?? null); }, [initialFile]);

  return { file, previewUrl, setFile };
}

export function isImageFile(file: File | null | undefined) {
  return Boolean(file && file.type.startsWith("image/"));
}

export function imageFromTransfer(dataTransfer: DataTransfer) {
  return imagesFromTransfer(dataTransfer)[0] ?? null;
}
export function imagesFromTransfer(dataTransfer: DataTransfer) {
  const files=Array.from(dataTransfer.files??[]).filter(isImageFile);
  return files.length?files:Array.from(dataTransfer.items??[]).filter(item=>item.kind==="file"&&item.type.startsWith("image/")).map(item=>item.getAsFile()).filter((file):file is File=>Boolean(file));
}
function validUrl(value: string) { try { const url = new URL(value.trim()); return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined; } catch { return undefined; } }
export function sourceUrlFromTransfer(dataTransfer: DataTransfer) { const html=dataTransfer.getData("text/html"); const href=html.match(/<a[^>]+href=["']([^"']+)["']/i)?.[1]; const src=html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]; return validUrl(href||"") || validUrl(dataTransfer.getData("text/uri-list")) || validUrl(dataTransfer.getData("text/plain")) || validUrl(src||""); }

export function useImageDrop(onImage: (file: File) => void, onUnsupported?: () => void, onImages?: (files: File[]) => void) {
  const [isDragging, setIsDragging] = useState(false);
  const depth = useRef(0);
  const prevent = (event: ReactDragEvent) => { event.preventDefault(); event.stopPropagation(); };

  return {
    isDragging,
    onDragEnter(event: ReactDragEvent) { prevent(event); depth.current += 1; setIsDragging(true); },
    onDragOver(event: ReactDragEvent) { prevent(event); setIsDragging(true); },
    onDragLeave(event: ReactDragEvent) { prevent(event); depth.current -= 1; if (depth.current <= 0) { depth.current = 0; setIsDragging(false); } },
    onDrop(event: ReactDragEvent) {
      prevent(event);
      depth.current = 0;
      setIsDragging(false);
      const files = imagesFromTransfer(event.dataTransfer);
      if (files.length) { if(onImages)onImages(files);else onImage(files[0]); } else onUnsupported?.();
    },
  };
}

export function usePageImageDrop(onImage: (file: File, sourceUrl?: string) => void, onUnsupported?: () => void, enabled = true, imagesOnly = false, onImages?: (files: File[], sourceUrl?: string) => void) {
  const [isDragging, setIsDragging] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let depth = 0;
    const prevent = (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); };
    const hasImage = (event: DragEvent) => !imagesOnly || Array.from(event.dataTransfer?.items ?? []).some(item => item.kind === "file" && item.type.startsWith("image/"));
    const enter = (event: DragEvent) => { if (document.querySelector("dialog[data-asset-detail][open], [data-global-upload], [data-upload-modal]")) return; prevent(event); if (!hasImage(event)) return; depth += 1; setIsDragging(true); };
    const over = (event: DragEvent) => { if (document.querySelector("dialog[data-asset-detail][open], [data-global-upload], [data-upload-modal]")) return; prevent(event); if (!hasImage(event)) return; setIsDragging(true); };
    const leave = (event: DragEvent) => { prevent(event); depth -= 1; if (depth <= 0) { depth = 0; setIsDragging(false); } };
    const drop = (event: DragEvent) => { depth = 0; setIsDragging(false); if (document.querySelector("dialog[data-asset-detail][open], [data-global-upload], [data-upload-modal]")) return; prevent(event); const files = event.dataTransfer ? imagesFromTransfer(event.dataTransfer) : []; const source=event.dataTransfer?sourceUrlFromTransfer(event.dataTransfer):undefined;if(files.length){if(onImages)onImages(files,source);else onImage(files[0],source);}else onUnsupported?.(); };
    window.addEventListener("dragenter", enter, true);
    window.addEventListener("dragover", over, true);
    window.addEventListener("dragleave", leave, true);
    window.addEventListener("drop", drop, true);
    return () => { window.removeEventListener("dragenter", enter, true); window.removeEventListener("dragover", over, true); window.removeEventListener("dragleave", leave, true); window.removeEventListener("drop", drop, true); };
  }, [enabled, imagesOnly, onImage, onImages, onUnsupported]);
  return { isDragging };
}

export function useClipboardImage(onImage: (file: File, sourceUrl?: string) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: ClipboardEvent) => {
      if (document.querySelector("dialog[data-asset-detail][open], [data-global-upload], [data-upload-modal]")) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest?.("input, textarea, [contenteditable]:not([contenteditable='false'])")) return;
      const item = Array.from(event.clipboardData?.items ?? []).find(item => item.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (!file) return;
      event.preventDefault();
      const transfer=event.clipboardData!; const sourceUrl=sourceUrlFromTransfer(transfer);
      if (process.env.NODE_ENV === "development") console.debug("[火麦来源识别]", { types:Array.from(transfer.types), hasHtml:Boolean(transfer.getData("text/html")), hasSourceUrl:Boolean(sourceUrl) });
      onImage(file, sourceUrl);
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [onImage, enabled]);
}

export function ImageDropZone({ file, previewUrl, onFileChange, onFilesChange }: { file: File | null; previewUrl: string | null; onFileChange: (file: File | null) => void; onFilesChange?: (files: File[])=>void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { isDragging, ...dropEvents } = useImageDrop(onFileChange,undefined,onFilesChange);
  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {const files=Array.from(event.target.files??[]).filter(isImageFile);if(onFilesChange)onFilesChange(files);else onFileChange(files[0]??null);event.target.value="";};

  if (file && previewUrl) return <div {...dropEvents} className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50"><div className="grid max-h-64 min-h-44 place-items-center p-3"><AssetImage src={previewUrl} alt="待上传图片预览" className="max-h-56 w-full object-contain" /></div><div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-3 py-2"><button type="button" onClick={() => inputRef.current?.click()} className="text-sm text-zinc-600 hover:text-orange-brand">更换图片</button><button type="button" onClick={() => onFileChange(null)} className="text-sm text-zinc-500 hover:text-red-600">删除</button></div><input ref={inputRef} multiple={Boolean(onFilesChange)} onChange={selectFile} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="sr-only" /></div>;

  return <label {...dropEvents} className={`block cursor-pointer rounded-xl border border-dashed px-4 py-10 text-center text-sm transition ${isDragging ? "border-orange-brand bg-orange-brand/5 text-orange-brand" : "border-zinc-300 bg-zinc-50 text-zinc-500 hover:border-orange-brand"}`}><span className="block font-medium">{isDragging ? "松开即可添加图片" : "拖拽图片到这里"}</span><span className="mt-1 block text-xs">或点击选择图片</span><input multiple={Boolean(onFilesChange)} onChange={selectFile} name="image-picker" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="sr-only" /></label>;
}
