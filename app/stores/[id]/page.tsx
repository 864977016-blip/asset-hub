import { AssetBrowser } from "@/components/asset-browser";
import { AppShell } from "@/components/app-shell";
import { StoreAssetPageDropZone, StoreAssetUploadProvider, StoreAssetUploadTrigger } from "@/components/image-upload-forms";
import { getStoreAssetCount, getActiveStoreOptions, getStoreAssets, getStoreById, getTags, getWorkstations } from "@/lib/data";
import { notFound } from "next/navigation";


export default async function StoreDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{tag?:string}> }) {
  const { id } = await params; const {tag} = await searchParams;
  const [store, assets, workstations, tags, stores, count] = await Promise.all([getStoreById(id), getStoreAssets(id), getWorkstations(), getTags("store"), getActiveStoreOptions(),getStoreAssetCount(id)]);
  if (!store) notFound();

  return <AppShell active="店铺" activeStoreId={id}>
    <StoreAssetUploadProvider key={id+":"+(tag||"all")} storeId={id} stores={stores} workstations={workstations} tags={tags}>
      <StoreAssetPageDropZone>
        <section className="mb-9 flex items-end justify-between">
          <div><p className="text-xs font-medium text-zinc-500">店铺资产</p><h1 className="mt-2 text-4xl font-bold tracking-tight">{store.name}</h1><p className="mt-2 text-zinc-600">{store.description || "店铺视觉资产与源文件统一管理。"}</p></div>
          <StoreAssetUploadTrigger />
        </section>

        <p className="mb-5 text-sm text-zinc-500">共 {count} 项可用素材</p>
        <AssetBrowser key={tag||"all"} initialTag={tag} currentStore={{id:store.id,name:store.name}} stores={stores} assets={assets} tags={tags} workstations={workstations} kind="store" />
      </StoreAssetPageDropZone>
    </StoreAssetUploadProvider>
  </AppShell>;
}
