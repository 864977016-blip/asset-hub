"use server";
import { session, fail, refreshAssets, drainCleanup } from "@/lib/action-utils";
import type { TagScope } from "@/lib/types";
export async function createScopedTag(scope: TagScope, name: string) { const {s}=await session(); const {data,error}=await s.rpc("v1_create_tag",{p_scope:scope,p_name:name}); if(error) fail(error); refreshAssets(); return data; }
export async function tagUsage(scope: TagScope,id: string) { const {s}=await session(true); const {data,error}=await s.rpc("v1_tag_usage",{p_scope:scope,p_id:id}); if(error) fail(error); return Number(data||0); }
export async function manageTags(scope: TagScope,changes: {id?:string;name:string}[],deletes:{id:string;count:number}[]) { const {s}=await session(true); const {error}=await s.rpc("v1_manage_tags",{p_scope:scope,p_changes:changes,p_deletes:deletes}); if(error) fail(error); refreshAssets(); }
export async function moveAsset(kind: "store"|"shared",id: string,form: FormData) {
 const {s}=await session(); const {error}=await s.rpc("v1_move_asset",{p_kind:kind,p_id:id,p_store_ids:form.getAll("store_ids").map(String),p_category:String(form.get("category")||"other"),p_tag_ids:form.getAll("tag_ids").map(String),p_workstation_ids:form.getAll("workstation_ids").map(Number),p_note:String(form.get("description")||"")});
 if(error){
  console.error("[moveAsset] RPC failed",error);
  // A lost response can occur after commit. Stable business IDs let us reconcile.
  const source=await s.from(kind==="store"?"store_assets":"shared_assets").select("id").eq("id",id).maybeSingle();
  if(!source.error&&source.data)throw new Error("移动失败，原素材未改变。");
  const target=await s.from(kind==="store"?"shared_assets":"store_assets").select("id").eq("id",id).maybeSingle();
  if(target.error||!target.data)throw new Error("移动结果暂时无法确认，请刷新后检查。");
 } refreshAssets();
}
export async function deleteAsset(kind: "store"|"shared"|"inspiration",id: string,storeId?: string) { const {s}=await session(); const {error}=await s.rpc("v1_delete_asset",{p_kind:kind,p_id:id,p_store_id:storeId||null}); if(error) fail(error); refreshAssets(); await drainCleanup(); }
