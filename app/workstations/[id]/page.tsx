import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AssetBrowser } from "@/components/asset-browser";
import { WorkstationEditButton } from "@/components/workstation-cards";
import { getWorkstationById, getWorkstationAssets, getTags, getWorkstations, getActiveStoreOptions, canEditWorkstations } from "@/lib/data";
export default async function WorkstationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-8]$/.test(id)) notFound();
  const workstation = await getWorkstationById(Number(id));
  if (!workstation) notFound();
  const [assets, tags, workstations, stores, canEdit] = await Promise.all([getWorkstationAssets(workstation.id), getTags("store"), getWorkstations(), getActiveStoreOptions(), canEditWorkstations()]);
  return <AppShell active="工作站"><Link href="/workstations" className="text-sm text-zinc-500 hover:text-orange-brand">← 返回工作站</Link><section className="mb-5 mt-6 flex items-center justify-between gap-4"><div><h1 className="text-4xl font-bold">{workstation.id}号工作站</h1><p className="mt-3 text-zinc-600">当前使用人：{workstation.current_user_name?.trim() || "未分配使用人"}</p></div>{canEdit && <WorkstationEditButton workstation={workstation} />}</section><AssetBrowser assets={assets} tags={tags} workstations={workstations} stores={stores} kind="workstation" /></AppShell>;
}
