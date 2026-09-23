import { AppShell } from "@/components/app-shell";
import { InspirationBrowser } from "@/components/inspiration-browser";
import { InspirationPageDropZone } from "@/components/inspiration-upload";
import { getInspirations, getTags } from "@/lib/data";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tag?: string }> }) { const { tag } = await searchParams; const [inspirations,tags] = await Promise.all([getInspirations(),getTags()]); return <AppShell active="素材库"><InspirationPageDropZone tags={tags}><section className="mb-9"><p className="text-xs font-medium text-zinc-500">灵感参考</p><h1 className="mt-2 text-4xl font-bold tracking-tight">素材库</h1><p className="mt-2 text-zinc-600">收集灵感，沉淀团队视觉素材。</p></section><InspirationBrowser key={tag || "all"} initialTag={tags.some(item => item.id === tag) ? tag : ""} inspirations={inspirations} tags={tags} /></InspirationPageDropZone></AppShell>; }
