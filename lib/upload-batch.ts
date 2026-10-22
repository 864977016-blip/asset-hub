export type UploadItem = { id: string; file: File; status: "waiting" | "uploading" | "success" | "error"; error?: string };

// Each item keeps its ID across uncertain responses and retries; successful items are never resent.
export async function uploadBatch(items: UploadItem[], send: (item: UploadItem) => Promise<void>, report: (item: UploadItem) => void, concurrency = 2) {
  const pending = items.filter(item => item.status !== "success");
  let next = 0;
  const results = new Map(items.map(item => [item.id, item]));
  async function worker() {
    while (next < pending.length) {
      const item = pending[next++];
      report({ ...item, status: "uploading", error: undefined });
      let result: UploadItem;
      try { await send(item); result = { ...item, status: "success", error: undefined }; }
      catch (error) { result = { ...item, status: "error", error: error instanceof Error ? error.message : "上传失败，请重试。" }; }
      results.set(item.id, result); report(result);
    }
  }
  await Promise.all(Array.from({ length: Math.min(pending.length, Math.max(1, Math.min(3, concurrency))) }, worker));
  return items.map(item => results.get(item.id)!);
}

export async function postUpload(item: UploadItem, assignment: FormData, target: string) {
  if (!item.file.size || item.file.size > 20 * 1024 * 1024) throw new Error("图片为空或超过 20MB。");
  const started = performance.now(), form = new FormData();
  assignment.forEach((value, key) => { if (!(value instanceof File)) form.append(key, value); });
  form.set("id", item.id); form.set("target", target); form.set("image", item.file);
  let response: Response;
  try { response = await fetch("/api/extension/assets", { method: "POST", headers: { "X-Upload-Id": item.id }, body: form, signal: AbortSignal.timeout(120000) }); }
  catch { throw new Error("网络中断或请求超时，结果暂未确认；请重试，已保存图片不会重复创建。"); }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.id) throw new Error(result?.error || (response.status === 413 ? "服务器拒绝了图片大小，请检查上传限制。" : "无法确认保存结果，请重试。"));
  if (process.env.NODE_ENV === "development") {
    const totalMs = Math.round(performance.now() - started), serverMs = Number(response.headers.get("server-timing")?.match(/upload;dur=([\d.]+)/)?.[1]);
    console.info(`[image-upload:${item.id.slice(0,8)}] client-response`, { totalMs, serverMs: Number.isFinite(serverMs) ? serverMs : null, transportAndFrameworkMs: Number.isFinite(serverMs) ? Math.max(0,totalMs-serverMs) : null });
  }
}

export function watchUploadRefresh(items: UploadItem[]) {
  if (process.env.NODE_ENV !== "development") return;
  const saved=items.filter(item=>item.status==="success"),started=performance.now();
  const observer=new MutationObserver(check),timeout=window.setTimeout(()=>{observer.disconnect();console.info("[image-upload] list-refresh",{visible:false,waitMs:Math.round(performance.now()-started)});},30000);
  function check(){if(saved.every(item=>document.querySelector(`[data-asset-id="${item.id}"]`)||document.querySelector(`img[src="/api/inspirations/${item.id}/image"]`))){observer.disconnect();clearTimeout(timeout);console.info("[image-upload] list-refresh",{visible:true,waitMs:Math.round(performance.now()-started)});}}
  observer.observe(document.body,{childList:true,subtree:true});requestAnimationFrame(check);
}
