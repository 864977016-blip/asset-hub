import {AppShell} from "@/components/app-shell";
import {HandbookTabs} from "@/components/handbook-tabs";
import {PromptBrowser} from "@/components/prompt-browser";
import {getPrompts} from "@/lib/handbook-data";
import {getTags} from "@/lib/data";
export default async function PromptsPage({searchParams}:{searchParams:Promise<{tag?:string;q?:string;id?:string}>}){const [data,tags,params]=await Promise.all([getPrompts(),getTags("prompt"),searchParams]);return <AppShell active="创作手册"><HandbookTabs active="prompts"/>{data.ready?<PromptBrowser items={data.items} tags={tags} initialTag={params.tag} initialQuery={params.q} initialId={params.id}/>:<p className="py-16 text-center text-zinc-500">提示词库尚未启用，请联系管理员。</p>}</AppShell>}
