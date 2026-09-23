"use client";
import { AssetCommands } from "./asset-commands";
import { useCanManage } from "./team-context";
import { arrayOrEmpty } from "@/lib/relation-values";

import { TagFilter } from "@/components/tag-filter";
import { matchesTags } from "@/lib/asset-filters";
import { useState } from "react";
import { updateInspiration } from "@/app/actions";
import { InspirationCard } from "@/components/inspiration-card";
import { AssetDetailModal, DetailField, TagEditor, TagList, savedTime } from "@/components/asset-detail-modal";
import type { Inspiration, Tag } from "@/lib/types";

export function InspirationDetail({ item, tags, onClose }: { item: Inspiration; tags: Tag[]; onClose: () => void }) {
  let source: URL | null = null;
  try { const url = new URL(item.sourceUrl || ""); if (["http:", "https:"].includes(url.protocol)) source = url; } catch {}
  return <AssetDetailModal canEdit={useCanManage(item.createdBy)} actions={<AssetCommands kind="inspiration" item={{...item,createdAt:item.createdAt||"",workstations:[]}} onClose={onClose}/>} title="灵感详情" image={item.image} onClose={onClose} onSave={form => updateInspiration(item.id, form)} success="灵感已更新" editor={<><TagEditor tags={tags} selected={item.tags} /><label className="block text-sm font-medium">来源网址（可选）<input name="source_url" defaultValue={item.sourceUrl ?? ""} type="url" placeholder="https://" className="mt-2 w-full rounded-xl border p-3 text-sm" /></label></>}><DetailField label="标签"><TagList tags={item.tags} /></DetailField><DetailField label="来源"><p>{source ? item.sourceDomain || source.hostname : "未记录"}</p>{source && <a href={source.href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-medium text-orange-brand hover:underline">查看原网页 ↗</a>}</DetailField><DetailField label="保存时间">{savedTime(item.createdAt)}</DetailField></AssetDetailModal>;
}
export function InspirationBrowser({ inspirations, tags, initialTag = "" }: { inspirations: Inspiration[]; tags: Tag[]; initialTag?: string }) {
  inspirations = arrayOrEmpty(inspirations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialTag ? [initialTag] : []);
  const visible = inspirations.filter(item => matchesTags(item, selectedTags));
  const selected = inspirations.find(item => item.id === selectedId);
  return <><TagFilter tags={tags} selected={selectedTags} onChange={setSelectedTags} />{!visible.length && <p className="py-16 text-center text-zinc-500">没有符合所选标签的灵感</p>}<section className="inspiration-masonry">{visible.map(item => <div key={item.id} className="mb-6 break-inside-avoid [&_button]:cursor-pointer"><InspirationCard item={item} onOpen={() => setSelectedId(item.id)} /></div>)}</section>{selected && <InspirationDetail key={selected.id} item={selected} tags={tags} onClose={() => setSelectedId(null)} />}</>;
}
