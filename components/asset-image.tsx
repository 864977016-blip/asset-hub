"use client";
import { useState } from "react";

const mediaLoads=new Map<string,number>();
async function measureMediaLoad(image:HTMLImageElement,src:string){
 if(typeof process==="undefined"||process.env.NODE_ENV!=="development"||!src.startsWith("/api/media/"))return;
 const entry=performance.getEntriesByName(image.currentSrc).at(-1) as PerformanceResourceTiming|undefined,decodeStarted=performance.now();await image.decode().catch(()=>{});const request=entry?.serverTiming.find(value=>value.name==="request"),occurrence=(mediaLoads.get(src)||0)+1;mediaLoads.set(src,occurrence);
 console.info(`[media:${request?.description||"unknown"}] Browser image complete`,{occurrence,ttfbMs:entry?Math.round(entry.responseStart-entry.startTime):null,downloadMs:entry?Math.round(entry.responseEnd-entry.responseStart):null,decodeMs:Math.round(performance.now()-decodeStarted),totalMs:entry?Math.round(entry.duration):null,transferBytes:entry?.transferSize??null,server:Object.fromEntries(entry?.serverTiming.filter(value=>value.name!=="request").map(value=>[value.name,Math.round(value.duration)])||[])});
}

export function AssetImage({ src, alt, className = "h-48 w-full object-cover", placeholderClassName = "h-48 w-full", loading = "lazy" }: { src?: string | null; alt: string; className?: string; placeholderClassName?: string; loading?: "lazy" | "eager" }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return <div role="img" aria-label={`${alt}：${src ? "图片加载失败" : "暂无预览"}`} className={`grid place-items-center rounded bg-zinc-100 text-xs text-zinc-400 ${placeholderClassName}`}>{src ? "图片加载失败" : "暂无预览"}</div>;
  return <img src={src} alt={alt} loading={loading} onLoad={event=>void measureMediaLoad(event.currentTarget,src)} onError={() => setFailedSrc(src)} className={className} />;
}
