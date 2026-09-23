"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { AssetImage } from "@/components/asset-image";
import { InspirationDetail } from "@/components/inspiration-browser";
import { SharedAssetDetail, StoreAssetDetail } from "@/components/asset-browser";
import { arrayOrEmpty, relationMany } from "@/lib/relation-values";
import { homeCategoryLabels, homeDate, relativeTime, storeMonogram } from "@/lib/home-display";
import type { Activity, Inspiration, Store, Tag, Workstation } from "@/lib/types";

type Props = { inspirations: Inspiration[]; stores: Store[]; activities: Activity[]; tags: Tag[]; workstations: Workstation[]; now: number };
export function HomeContent({ inspirations, stores, activities, tags, workstations, now }: Props) {
  inspirations = relationMany(inspirations); stores = relationMany(stores); activities = relationMany(activities);
  const [selection, setSelection] = useState<{ kind: "inspiration" | "activity"; id: string } | null>(null);
  const [clock, setClock] = useState(now);
  useEffect(() => { setClock(now); const timer = window.setInterval(() => setClock(Date.now()), 60000); return () => window.clearInterval(timer); }, [now]);
  const activity = selection?.kind === "activity" ? activities.find(item => item.id === selection.id) : undefined;
  const inspiration = selection?.kind === "inspiration" ? inspirations.find(item => item.id === selection.id) : activity?.inspiration;
  const close = () => setSelection(null);
  return <>
    <section className="mb-12 pt-1"><p className="mb-2 text-xs font-medium tracking-wider text-zinc-500">资产中心工作台</p><h1 className="text-4xl font-bold tracking-tight text-ink">灵感与素材，从这里开始</h1><p className="mt-3 text-base text-zinc-600">粘贴或拖入图片，保存到素材库、共享素材或店铺。</p></section>
    <SectionHeading title="最近灵感" detail={`${inspirations.length} 项素材`} action="查看全部" href="/library" />
    {inspirations.length ? <section className="inspiration-masonry">{inspirations.map(item => <button key={item.id} type="button" onClick={() => setSelection({ kind: "inspiration", id: item.id })} aria-label={`查看${item.title}详情`} className="group mb-6 block w-full cursor-pointer break-inside-avoid overflow-hidden rounded-xl border border-zinc-200/70 bg-white shadow-card transition hover:shadow-float"><AssetImage src={item.image} alt={item.title} className="block h-auto w-full" placeholderClassName="h-72 w-full" /></button>)}</section> : <p className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-zinc-500">还没有灵感素材</p>}
    <section className="mt-12"><SectionHeading title="我的店铺" detail={`${stores.length} 家活跃`} action="管理店铺" href="/stores" />{stores.length ? <div className="content-grid grid-four gap-6">{stores.map(store => <Link key={store.id} href={`/stores/${store.id}`} className="flex flex-col rounded-xl border border-zinc-200/70 bg-white p-5 shadow-card transition hover:border-orange-brand/40 hover:shadow-float"><div className="flex items-start justify-between"><span className="grid h-14 w-14 place-items-center rounded-lg bg-ink text-lg font-semibold tracking-wide text-white">{storeMonogram(store.name)}</span><span aria-hidden="true" className="text-orange-brand">↗</span></div><h3 className="mt-6 truncate text-lg font-bold" title={store.name}>{store.name}</h3><p className="mt-2 text-sm text-zinc-500">{store.count} 项店铺资产</p><p className="mt-4 min-h-5 text-xs text-zinc-500">{arrayOrEmpty(store.categories).filter(value => homeCategoryLabels[value]).map(value => homeCategoryLabels[value]).join(" · ") || (store.count ? "共享素材" : "暂无素材")}</p><p className="mt-auto pt-5 text-xs text-zinc-400">最近更新 · {homeDate(store.updatedAt)}</p></Link>)}</div> : <p className="rounded-xl border border-dashed border-zinc-300 py-14 text-center text-zinc-500">还没有店铺</p>}</section>
    <section className="mt-14"><SectionHeading title="最近更新" detail="团队动态" /><div className="overflow-hidden rounded-xl border border-zinc-200/70 bg-white shadow-card">{activities.length ? activities.map(item => <button key={item.id} type="button" onClick={() => setSelection({ kind: "activity", id: item.id })} className="grid w-full cursor-pointer grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-4 border-b border-zinc-100 px-5 py-4 text-left transition last:border-0 hover:bg-zinc-50"><AssetImage src={item.image} alt={item.title} className="h-12 w-12 rounded-lg object-cover" placeholderClassName="h-12 w-12" /><span className="min-w-0 break-words"><span className="block text-sm font-medium">{item.title}</span><span className="mt-1 block text-xs text-zinc-500">{item.location}</span></span><time dateTime={item.createdAt || undefined} className="text-xs text-zinc-400">{relativeTime(item.createdAt, clock)}</time></button>) : <p className="px-5 py-10 text-center text-sm text-zinc-400">还没有最近更新</p>}</div></section>
    {inspiration && <InspirationDetail key={inspiration.id} item={inspiration} tags={tags} onClose={close} />}
    {activity?.asset && (activity.type === "shared_asset" ? <SharedAssetDetail key={activity.asset.id} item={activity.asset} tags={[]} stores={stores} workstations={workstations} onClose={close} /> : <StoreAssetDetail stores={stores} key={activity.asset.id} item={activity.asset} tags={tags} workstations={workstations} onClose={close} />)}
  </>;
}
