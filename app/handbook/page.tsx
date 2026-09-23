import {AppShell} from "@/components/app-shell";
import {HandbookTabs} from "@/components/handbook-tabs";
import {HandbookBrowser} from "@/components/handbook-browser";
import {getHandbook} from "@/lib/handbook-data";
export default async function HandbookPage({searchParams}:{searchParams:Promise<{product?:string;note?:string;q?:string}>}){const [data,params]=await Promise.all([getHandbook(),searchParams]);return <AppShell active="创作手册"><HandbookTabs active="rules"/>{data.ready?<HandbookBrowser products={data.products} initialProduct={params.product} initialNote={params.note} initialQuery={params.q}/>:<p className="py-16 text-center text-zinc-500">创作手册尚未启用，请联系管理员。</p>}</AppShell>}
