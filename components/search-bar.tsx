"use client";
import {PromptDetail} from "./prompt-browser";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { searchAll } from "@/app/search-actions";
import { InspirationDetail } from "./inspiration-browser";
import { SharedAssetDetail, StoreAssetDetail } from "./asset-browser";
import { AssetImage } from "./asset-image";
import type { HomeUploadOptions } from "./home-upload";
import type { AssetDetail, Inspiration, SearchResults } from "@/lib/types";

type Selection = { kind: "inspiration"; item: Inspiration } | { kind: "asset"; item: AssetDetail };
function Group({ title, children }: { title: string; children: ReactNode }) {
  return <section className="border-b border-zinc-100 py-2 last:border-0"><h3 className="px-3 py-1 text-xs font-medium text-zinc-400">{title}</h3>{children}</section>;
}
const rowClass = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-orange-brand/5 focus-visible:outline-orange-brand";
export function SearchBar({ tags, stores, workstations }: HomeUploadOptions) {
  const [promptId,setPromptId]=useState<string|null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ query: string; data?: SearchResults; error?: string } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const keyword = query.trim();
  useEffect(() => { setOpen(false); setSelection(null); setQuery(""); }, [pathname]);
  useEffect(() => {
    if (!keyword || !open) return;
    let stale = false;
    const timer = window.setTimeout(() => {
      searchAll(keyword).then(data => { if (!stale) setResult({ query: keyword, data }); }).catch(error => { if (!stale) setResult({ query: keyword, error: error instanceof Error ? error.message : "搜索失败，请稍后重试" }); });
    }, 300);
    return () => { stale = true; window.clearTimeout(timer); };
  }, [keyword, open]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !document.querySelector("dialog[open], [data-upload-modal]")) { event.preventDefault(); input.current?.focus(); setOpen(true); }
      if (event.key === "Escape") setOpen(false);
    };
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", key); document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", outside); };
  }, []);
  const current = result?.query === keyword ? result : null;
  const data = current?.data;
  const choose = (value: Selection) => { setSelection(value); setOpen(false); };
  return <><div ref={container} className="relative min-w-0 w-full max-w-96" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <div className="flex h-9 items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 shadow-card focus-within:border-orange-brand">
      <Search size={17} className="shrink-0 text-zinc-400" />
      <input ref={input} value={query} maxLength={100} onChange={event => { setQuery(event.target.value); setResult(null); setOpen(true); }} onFocus={() => setOpen(true)} aria-label="搜索灵感、资产、标签" aria-expanded={open && !!keyword} aria-controls="global-search-results" placeholder="搜索灵感、资产、标签…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      {query && <button type="button" aria-label="清空搜索" onClick={() => { setQuery(""); setResult(null); input.current?.focus(); }}><X size={15} /></button>}
    </div>
    {open && keyword && <div id="global-search-results" aria-label="搜索结果" className="global-search-results absolute left-0 top-11 max-h-[70vh] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2 shadow-float">
      {!current && <p role="status" className="p-4 text-sm text-zinc-500">搜索中…</p>}
      {current?.error && <p role="alert" className="p-4 text-sm text-red-600">{current.error}</p>}
      {data && !Object.values(data).some(items => items?.length) && <p role="status" className="p-4 text-sm text-zinc-500">没有找到相关结果。</p>}
      {!!data?.inspirations.length && <Group title="灵感">{data.inspirations.map(item => <button type="button" key={item.id} className={rowClass} onClick={() => choose({ kind: "inspiration", item })}><AssetImage src={item.image} alt="" className="h-10 w-10 shrink-0 rounded object-contain" placeholderClassName="h-10 w-10 shrink-0" /><span className="truncate">{item.title}</span></button>)}</Group>}
      {data && ([['共享素材', data.shared], ['店铺素材', data.assets]] as const).map(([title, items]) => !!items.length && <Group key={title} title={title}>{items.map(item => <button type="button" key={item.id} className={rowClass} onClick={() => choose({ kind: "asset", item })}><AssetImage src={item.image} alt="" className="h-10 w-10 shrink-0 rounded object-contain" placeholderClassName="h-10 w-10 shrink-0" /><span className="truncate">{item.note || item.store?.name || title}</span></button>)}</Group>)}
      {!!data?.stores.length && <Group title="店铺">{data.stores.map(item => <Link key={item.id} href={'/stores/' + item.id} onClick={() => setOpen(false)} className={rowClass}>{item.name} →</Link>)}</Group>}
      {!!data?.tags.length && <Group title="素材库标签">{data.tags.map(item => <Link key={item.id} href={'/library?tag=' + encodeURIComponent(item.id)} onClick={() => setOpen(false)} className={rowClass}>#{item.name} →</Link>)}</Group>}
      {!!data?.storeTags?.length && <Group title="店铺素材标签">{data.storeTags.map(item=><Link key={item.id} href={'/stores?tag='+encodeURIComponent(item.id)} onClick={()=>setOpen(false)} className={rowClass}>#{item.name} →</Link>)}</Group>}
      {!!data?.promptTags?.length && <Group title="提示词标签">{data.promptTags.map(item=><Link key={item.id} href={'/handbook/prompts?tag='+encodeURIComponent(item.id)} onClick={()=>setOpen(false)} className={rowClass}>#{item.name} →</Link>)}</Group>}
      {!!data?.handbook?.length && <Group title="作图规范">{data.handbook.map(item=><Link key={item.id} href={'/handbook?product='+item.id+'&q='+encodeURIComponent(keyword)} onClick={()=>setOpen(false)} className={rowClass}>{item.name} →</Link>)}</Group>}
      {!!data?.prompts?.length && <Group title="提示词">{data.prompts.map(item=><button type="button" key={item.id} onClick={()=>{setPromptId(item.id);setOpen(false)}} className={rowClass}><span className="line-clamp-2 break-words">{item.content}</span></button>)}</Group>}
      {data && Object.values(data).some(items => (items?.length || 0) >= 6) && <p className="px-3 py-2 text-xs text-zinc-400">每类最多显示 6 项，可输入更具体的关键词。</p>}
    </div>}
  </div>
  {promptId && <PromptDetail id={promptId} onClose={()=>setPromptId(null)}/> }
  {selection?.kind === "inspiration" && <InspirationDetail item={selection.item} tags={tags} onClose={() => setSelection(null)} />}
  {selection?.kind === "asset" && (selection.item.kind === "shared" ? <SharedAssetDetail item={selection.item} tags={[]} stores={stores} workstations={workstations} onClose={() => setSelection(null)} /> : <StoreAssetDetail stores={stores} item={selection.item} tags={tags} workstations={workstations} onClose={() => setSelection(null)} />)}
  </>;
}
