import { AssetBrowser } from "@/components/asset-browser";
import { AppShell } from "@/components/app-shell";
import { getSharedAssets, getActiveStoreOptions, getWorkstations } from "@/lib/data";
import { SharedAssetUpload } from "@/components/image-upload-forms";

export default async function SharedPage() {
  const [assets, stores, workstations] = await Promise.all([getSharedAssets(), getActiveStoreOptions(), getWorkstations()]);
  return <AppShell active="店铺"><section className="mb-9 flex items-end justify-between gap-4"><div><p className="text-xs font-medium text-zinc-500">团队通用资产</p><h1 className="mt-2 text-4xl font-bold tracking-tight">共享素材</h1><p className="mt-2 text-zinc-600">团队制作完成、可在不同 Amazon 店铺间复用的通用视觉素材。</p></div><SharedAssetUpload stores={stores} workstations={workstations} /></section><AssetBrowser assets={assets} stores={stores} tags={[]} workstations={workstations} kind="shared" /></AppShell>;
}
