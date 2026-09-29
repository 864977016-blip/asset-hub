import Link from "next/link";
import { AssetBrowser } from "@/components/asset-browser";
import { AppShell } from "@/components/app-shell";
import { ParentProductBrowser } from "@/components/parent-product-browser";
import { StoreIdentity } from "@/components/store-identity";
import { StoreAssetPageDropZone, StoreAssetUploadProvider, StoreAssetUploadTrigger } from "@/components/image-upload-forms";
import { getStoreAssetCount,getActiveStoreOptions,getStoreAssets,getStoreById,getTags,getWorkstations,getParentProducts,getProductTags } from "@/lib/data";
import { notFound } from "next/navigation";

export default async function StoreDetailPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{tag?:string;mode?:string;parent?:string}>}){
 const {id}=await params,{tag,mode,parent}=await searchParams;
 const [store,assets,workstations,tags,stores,count,productTags]=await Promise.all([getStoreById(id),getStoreAssets(id),getWorkstations(),getTags("store"),getActiveStoreOptions(),getStoreAssetCount(id),getProductTags()]);
 if(!store)notFound();const parents=await getParentProducts(id,assets),parentMode=mode==="parents";
 return <AppShell active="店铺" activeStoreId={id}><StoreAssetUploadProvider key={id+":"+(tag||"all")} storeId={id} stores={stores} workstations={workstations} tags={tags} parents={parents}><StoreAssetPageDropZone>
  <section className="mb-7 flex flex-wrap items-end justify-between gap-4"><div className="flex min-w-0 items-center gap-4"><StoreIdentity name={store.name} logo={store.logo} className="h-16 w-16 shrink-0"/><div className="min-w-0"><p className="text-xs font-medium text-zinc-500">店铺资产</p><h1 className="mt-1 break-words text-4xl font-bold tracking-tight">{store.name}</h1><p className="mt-2 break-words text-zinc-600">{store.description||"店铺视觉资产与源文件统一管理。"}</p></div></div>{!parentMode&&<StoreAssetUploadTrigger/>}</section>
  <nav className="mb-7 flex gap-2"><Link className={!parentMode?"round-button border-orange-brand bg-orange-brand text-white":"round-button"} href={`/stores/${id}`}>素材</Link><Link className={parentMode?"round-button border-orange-brand bg-orange-brand text-white":"round-button"} href={`/stores/${id}?mode=parents`}>父体</Link></nav>
  {parentMode?<ParentProductBrowser initialParent={parent} store={{id:store.id,name:store.name}} parents={parents} productTags={productTags} assetTags={tags} workstations={workstations} stores={stores}/>:<><p className="mb-5 text-sm text-zinc-500">共 {count} 项可用素材</p><AssetBrowser key={tag||"all"} initialTag={tag} currentStore={{id:store.id,name:store.name}} stores={stores} assets={assets} tags={tags} productTags={productTags} workstations={workstations} kind="store" parents={parents}/></>}
 </StoreAssetPageDropZone></StoreAssetUploadProvider></AppShell>;
}
