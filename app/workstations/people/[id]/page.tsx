import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AssetBrowser } from "@/components/asset-browser";
import { getProductionPerson, getProductionPersonAssets, getTags, getWorkstations, getActiveStoreOptions, getProductionPeople } from "@/lib/data";

export default async function ProductionPersonPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))notFound();
  const person=await getProductionPerson(id);
  if(!person)notFound();
  const [assets,tags,workstations,stores,people]=await Promise.all([getProductionPersonAssets(id),getTags("store"),getWorkstations(),getActiveStoreOptions(),getProductionPeople()]);
  return <AppShell active="制作人员" uploadPersonId={person.disabled_at?undefined:person.id}><Link href="/workstations" className="text-sm text-zinc-500 hover:text-orange-brand">← 返回制作人员</Link><h1 className="mb-6 mt-6 text-4xl font-bold">{person.name}</h1>{person.disabled_at&&<p className="mb-5 text-sm text-zinc-500">已停用 · 历史作品</p>}<AssetBrowser assets={assets} tags={tags} workstations={workstations} people={people} stores={stores} kind="workstation" emptyMessage="该制作人员暂时没有关联素材。" /></AppShell>;
}
