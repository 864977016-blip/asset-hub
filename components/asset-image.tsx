"use client";
import { useState } from "react";

export function AssetImage({ src, alt, className = "h-48 w-full object-cover", placeholderClassName = "h-48 w-full", loading = "lazy" }: { src?: string | null; alt: string; className?: string; placeholderClassName?: string; loading?: "lazy" | "eager" }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return <div role="img" aria-label={`${alt}：${src ? "图片加载失败" : "暂无预览"}`} className={`grid place-items-center rounded bg-zinc-100 text-xs text-zinc-400 ${placeholderClassName}`}>{src ? "图片加载失败" : "暂无预览"}</div>;
  return <img src={src} alt={alt} loading={loading} onError={() => setFailedSrc(src)} className={className} />;
}
