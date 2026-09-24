"use server";
import { relationOne } from "@/lib/relation-values";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { optimizeAndUploadImage, removeObject } from "@/lib/r2";
import { session } from "@/lib/action-utils";
async function admin() { return (await session(true)).s; }
const slug=(v:string)=>`${v.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g,"-").replace(/^-|-$/g,"")}-${Date.now().toString(36)}`;
const refreshStoreViews = () => { revalidatePath("/", "layout"); revalidatePath("/stores"); };
export async function createStore(form:FormData){const s=await admin();const name=String(form.get("name")||"").trim();if(!name)throw new Error("店铺名称不能为空");const {data:{user}}=await s.auth.getUser();const {error}=await s.from("stores").insert({name,slug:slug(name),description:String(form.get("description")||""),created_by:user!.id});if(error)throw new Error(error.message||"无法创建店铺");refreshStoreViews();}
export async function updateStore(id:string,form:FormData){const s=await admin();const name=String(form.get("name")||"").trim();if(!name)throw new Error("店铺名称不能为空");const {error}=await s.from("stores").update({name,description:String(form.get("description")||"")}).eq("id",id);if(error)throw new Error(error.message);refreshStoreViews();}
export async function archiveStore(id:string){const s=await admin();const { error }=await s.from("stores").update({archived_at:new Date().toISOString()}).eq("id",id);if(error)throw new Error(error.message);refreshStoreViews();}
function refreshWorkstationViews() { revalidatePath("/workstations"); for (let id = 1; id <= 8; id++) revalidatePath(`/workstations/${id}`); }
export async function updateWorkstation(id:number,form:FormData) {
  if (!Number.isInteger(id) || id < 1 || id > 8) throw new Error("工作站编号无效");
  const s = await admin();
  const currentUser = String(form.get("current_user_name") || "").trim();
  const { error } = await s.from("workstations").update({ current_user_name: currentUser || null }).eq("id", id).select("id").single();
  if (error) throw new Error(error.message);
  refreshWorkstationViews(); revalidatePath("/shared"); revalidatePath("/stores/[id]", "page");
}



async function userClient() { return session(); }
async function recordActivity(s: Awaited<ReturnType<typeof createClient>>, actorId: string, targetType: string, targetId: string, action: string) {
  // Audit failures must never trigger cleanup of an already saved asset.
  try {
    const { error } = await s.from("activities").insert({ actor_id: actorId, target_type: targetType, target_id: targetId, action });
    if (error) throw error;
  } catch (error) {
    console.error("[recordActivity] Activity write failed; asset operation remains successful", { actorId, targetType, targetId, action, error });
  }
}
export async function uploadStoreAsset(storeId:string, form:FormData) { const {s,user}=await userClient(); const {data:store,error:storeError}=await s.from("stores").select("id").eq("id",storeId).is("archived_at",null).single(); if(storeError||!store) throw new Error("店铺不存在或已归档"); const {tagIds,workstationIds}=await relationSelection(s,form); const category=String(form.get("category")||"other"); if(!["main","scene","a_plus","other"].includes(category)) throw new Error("请选择有效分类"); const file=form.get("image"); if(!(file instanceof File)) throw new Error("请选择图片"); const fallbackTitle=file.name.replace(/\.[^.]+$/, "") || "未命名素材"; const {data:asset,error}=await s.from("store_assets").insert({store_id:storeId,title:fallbackTitle,description:String(form.get("description")||""),asset_category:category,created_by:user.id}).select("id").single(); if(error||!asset) throw new Error(error?.message||"无法创建素材"); let uploadedKey: string | null = null; try { const image=await optimizeAndUploadImage(file,`stores/${storeId}/assets`); uploadedKey=image.key; const {error:fileError}=await s.from("asset_files").insert({store_asset_id:asset.id,original_name:image.originalName,storage_key:image.key,mime_type:image.mimeType,size_bytes:image.sizeBytes,width:image.width,height:image.height,kind:"image",created_by:user.id}); if(fileError) { await removeObject(image.key); throw new Error(fileError.message); } await replaceRelations(s,"store_asset_workstations","store_asset_id",asset.id,"workstation_id",workstationIds); await replaceRelations(s,"store_asset_tags","store_asset_id",asset.id,"tag_id",tagIds); await recordActivity(s,user.id,"store_asset",asset.id,"store_asset_created"); revalidatePath(`/stores/${storeId}`); revalidatePath("/stores"); refreshWorkstationViews(); revalidatePath("/"); } catch(e) { const {error:cleanupError}=await s.from("store_assets").delete().eq("id",asset.id); if(!cleanupError && uploadedKey) await removeObject(uploadedKey).catch(()=>{}); throw e; } }
export async function createInspiration(form: FormData) {
  const { s, user } = await userClient();
  const file = form.get("image");
  if (!(file instanceof File)) throw new Error("请选择图片");
  const source = inspirationSource(form);
  const { tagIds } = await relationSelection(s, form, false, true, "inspiration");
  const image = await optimizeAndUploadImage(file, "inspirations");
  let inspirationId: string | null = null;
  try {
    const { data, error } = await s.from("inspirations").insert({ title: file.name.replace(/\.[^.]+$/, "") || null, image_key: image.key, image_url: "", ...source, created_by: user.id }).select("id").single();
    if (error || !data) throw new Error(error?.message || "无法保存灵感");
    inspirationId = data.id;
    const { error: imageError } = await s.from("inspirations").update({ image_url: '/api/inspirations/' + data.id + '/image' }).eq("id", data.id);
    if (imageError) throw new Error(imageError.message);
    await replaceRelations(s, "inspiration_tags", "inspiration_id", data.id, "tag_id", tagIds);
    await recordActivity(s, user.id, "inspiration", data.id, "inspiration_created");
  } catch (reason) {
    const cleanup = inspirationId ? await s.from("inspirations").delete().eq("id", inspirationId) : { error: null };
    if (!cleanup.error) await removeObject(image.key).catch(() => {});
    throw reason;
  }
  revalidatePath("/library"); revalidatePath("/");
}
// All requests use the signed-in user's client; RLS remains authoritative.
async function relationSelection(s: Awaited<ReturnType<typeof createClient>>, form: FormData, withWorkstations = true, withTags = true, tagScope: "inspiration" | "store" = "store") {
  const tagIds = withTags ? [...new Set(form.getAll("tag_ids").map(String).filter(Boolean))] : [];
  const workstationIds = withWorkstations ? [...new Set(form.getAll("workstation_ids").map(Number))] : [];
  if (workstationIds.some(id => !Number.isInteger(id) || id <= 0)) throw new Error("工作站选择无效");
  if (tagIds.length) {
    let result = await s.from(tagScope === "store" ? "store_tags" : "tags").select("id").in("id", tagIds);
    if(tagScope === "store" && ["PGRST205","42P01"].includes(result.error?.code || "")) result = await s.from("tags").select("id").in("id",tagIds);
    const {data,error}=result;
    if (error) throw new Error(error.message);
    if (data?.length !== tagIds.length) throw new Error("部分标签已失效，请刷新后重试");
  }
  if (workstationIds.length) {
    const { data, error } = await s.from("workstations").select("id").in("id", workstationIds);
    if (error) throw new Error(error.message);
    if (data?.length !== workstationIds.length) throw new Error("部分工作站已失效，请刷新后重试");
  }
  return { tagIds, workstationIds };
}
// Replace the selected set by adding missing rows before removing deselected rows.
// Existing rows are preserved, and an insertion failure never clears old selections.
async function replaceRelations(s: Awaited<ReturnType<typeof createClient>>, table: string, parentKey: string, id: string, targetKey: string, ids: (string | number)[]) {
  const { data, error } = await s.from(table).select(targetKey).eq(parentKey, id);
  if (error) throw new Error(error.message);
  const existing = (data ?? []).map((row: any) => row[targetKey] as string | number);
  const added = ids.filter(value => !existing.includes(value));
  const removed = existing.filter(value => !ids.includes(value));
  if (added.length) {
    const { data: inserted, error } = await s.from(table).insert(added.map(value => ({ [parentKey]: id, [targetKey]: value }))).select(targetKey);
    if (error) throw new Error(error.message);
    if (inserted?.length !== added.length) throw new Error("关联保存失败，请刷新后重试");
  }
  if (removed.length) {
    const { data: deleted, error } = await s.from(table).delete().eq(parentKey, id).in(targetKey, removed).select(targetKey);
    if (error) throw new Error(error.message);
    if (deleted?.length !== removed.length) throw new Error("关联未完整更新，请确认编辑权限后重试");
  }
}
function inspirationSource(form: FormData) {
  const value = String(form.get("source_url") || "").trim();
  if (!value) return { source_url: null, source_domain: null, source_name: null };
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    return { source_url: url.href, source_domain: url.hostname, source_name: url.hostname };
  } catch { throw new Error("请输入有效的 http 或 https 来源网址"); }
}
export async function updateInspiration(id: string, form: FormData) {
  const { s, user } = await userClient();
  const source = inspirationSource(form);
  const { tagIds } = await relationSelection(s, form, false, true, "inspiration");
  const { data, error } = await s.from("inspirations").update(source).eq("id", id).select("id").single();
  if (error || !data) throw new Error(error?.message || "灵感不存在或没有编辑权限");
  try {
    await replaceRelations(s, "inspiration_tags", "inspiration_id", id, "tag_id", tagIds);
    await recordActivity(s, user.id, "inspiration", id, "inspiration_updated").catch(() => {});
  } finally { revalidatePath("/library"); revalidatePath("/"); }
}
async function sharedStoreSelection(s: Awaited<ReturnType<typeof createClient>>, form: FormData, assetId?: string) {
  const selected = [...new Set(form.getAll("store_ids").map(String).filter(Boolean))];
  if (selected.length) {
    const { data, error } = await s.from("stores").select("id").in("id", selected).is("archived_at", null);
    if (error) throw new Error(error.message);
    if (data?.length !== selected.length) throw new Error("只能选择未归档店铺，请刷新后重试");
  }
  if (!assetId) return selected;
  const { data, error } = await s.from("shared_asset_stores").select("store_id,stores(archived_at)").eq("shared_asset_id", assetId);
  if (error) throw new Error(error.message);
  // Archived (or RLS-hidden) historical associations are never erased by this form.
  const historical = (data ?? []).filter((row: any) => {
    const store = relationOne<any>(row.stores);
    return !store || store.archived_at != null;
  }).map((row: any) => row.store_id as string);
  return [...new Set([...selected, ...historical])];
}
export async function updateSharedAsset(id: string, form: FormData) {
  const { s } = await userClient();
  const description = String(form.get("description") || "").trim() || null;
  const { workstationIds } = await relationSelection(s, form, true, false);
  const storeIds = await sharedStoreSelection(s, form, id);
  const { data, error } = await s.from("shared_assets").update({ description }).eq("id", id).select("id").single();
  if (error || !data) throw new Error(error?.message || "共享素材不存在或没有编辑权限");
  try {
    await replaceRelations(s, "shared_asset_stores", "shared_asset_id", id, "store_id", storeIds);
    await replaceRelations(s, "shared_asset_workstations", "shared_asset_id", id, "workstation_id", workstationIds);
  } finally { revalidatePath("/shared"); revalidatePath("/stores"); revalidatePath("/stores/[id]", "page"); refreshWorkstationViews(); revalidatePath("/"); }
}
export async function updateStoreAsset(id: string, form: FormData) {
  const { s } = await userClient();
  const category = String(form.get("category") || "");
  if (!["main", "scene", "a_plus", "other"].includes(category)) throw new Error("请选择有效分类");
  const { tagIds, workstationIds } = await relationSelection(s, form);
  const { data, error } = await s.from("store_assets").update({ asset_category: category }).eq("id", id).select("id,store_id").single();
  if (error || !data) throw new Error(error?.message || "素材不存在或没有编辑权限");
  try {
    await replaceRelations(s, "store_asset_tags", "store_asset_id", id, "tag_id", tagIds);
    await replaceRelations(s, "store_asset_workstations", "store_asset_id", id, "workstation_id", workstationIds);
  } finally { revalidatePath('/stores/' + data.store_id); revalidatePath("/stores"); refreshWorkstationViews(); revalidatePath("/"); }
}
export async function createSharedAsset(form:FormData) { const {s,user}=await userClient(); const storeIds=await sharedStoreSelection(s,form); const {workstationIds}=await relationSelection(s,form,true,false); const file=form.get("image"); if(!(file instanceof File)) throw new Error("请选择图片"); const fallbackTitle=file.name.replace(/\.[^.]+$/, "") || "未命名共享素材"; const {data:asset,error}=await s.from("shared_assets").insert({title:fallbackTitle,description:String(form.get("description")||""),asset_type:"other",created_by:user.id}).select("id").single(); if(error||!asset) throw new Error(error?.message||"无法创建共享素材"); let uploadedKey: string | null = null; try { const image=await optimizeAndUploadImage(file,"shared"); uploadedKey=image.key; const {data:fileRow,error:fileError}=await s.from("asset_files").insert({shared_asset_id:asset.id,original_name:image.originalName,storage_key:image.key,mime_type:image.mimeType,size_bytes:image.sizeBytes,width:image.width,height:image.height,kind:"image",created_by:user.id}).select("id").single(); if(fileError||!fileRow) { await removeObject(image.key); throw new Error(fileError?.message||"无法保存图片"); } const {error:previewError}=await s.from("shared_assets").update({preview_file_id:fileRow.id}).eq("id",asset.id); if(previewError) throw new Error(previewError.message); await replaceRelations(s,"shared_asset_stores","shared_asset_id",asset.id,"store_id",storeIds); await replaceRelations(s,"shared_asset_workstations","shared_asset_id",asset.id,"workstation_id",workstationIds); await recordActivity(s,user.id,"shared_asset",asset.id,"shared_asset_created"); revalidatePath("/shared"); revalidatePath("/stores"); revalidatePath("/stores/[id]", "page"); refreshWorkstationViews(); revalidatePath("/"); } catch(e) { const {error:cleanupError}=await s.from("shared_assets").delete().eq("id",asset.id); if(!cleanupError && uploadedKey) await removeObject(uploadedKey).catch(()=>{}); throw e; } }
