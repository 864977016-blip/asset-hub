"use server";
import { relationOne } from "@/lib/relation-values";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { optimizeAndUploadImage, removeObject } from "@/lib/r2";
import { session, fail, drainCleanup } from "@/lib/action-utils";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { env } from "node:process";
async function admin() { return (await session(true)).s; }
export async function createProductionPerson(form:FormData){const s=await admin();const name=String(form.get("name")||"").trim();if(!name)throw new Error("请输入姓名");const {error}=await s.from("production_people").insert({name});if(error)throw new Error("新增制作人员失败，请重试。");revalidatePath("/workstations");}
export async function renameProductionPerson(id:string,form:FormData){const s=await admin();const name=String(form.get("name")||"").trim();if(!name)throw new Error("请输入姓名");const {data,error}=await s.from("production_people").update({name}).eq("id",id).select("id").single();if(error||!data)throw new Error("修改姓名失败，请重试。");revalidatePath("/workstations");revalidatePath(`/workstations/people/${id}`);}
export async function disableProductionPerson(id:string){const s=await admin();const {data,error}=await s.from("production_people").update({disabled_at:new Date().toISOString()}).eq("id",id).is("disabled_at",null).select("id").single();if(error||!data)throw new Error("停用失败，请重试。");revalidatePath("/workstations");revalidatePath(`/workstations/people/${id}`);}
const slug=(v:string)=>`${v.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g,"-").replace(/^-|-$/g,"")}-${Date.now().toString(36)}`;
const refreshStoreViews = () => { revalidatePath("/", "layout"); revalidatePath("/stores"); };
export async function createStore(form:FormData){const s=await admin();const name=String(form.get("name")||"").trim();if(!name)throw new Error("店铺名称不能为空");const {data:{user}}=await s.auth.getUser();const {error}=await s.from("stores").insert({name,slug:slug(name),description:String(form.get("description")||""),created_by:user!.id});if(error)throw new Error(error.message||"无法创建店铺");refreshStoreViews();}
export async function updateStore(id:string,form:FormData){const s=await admin();const name=String(form.get("name")||"").trim();if(!name)throw new Error("店铺名称不能为空");const {error}=await s.from("stores").update({name,description:String(form.get("description")||"")}).eq("id",id);if(error)throw new Error(error.message);refreshStoreViews();}
export async function archiveStore(id:string){const s=await admin();const { error }=await s.from("stores").update({archived_at:new Date().toISOString()}).eq("id",id);if(error)throw new Error(error.message);refreshStoreViews();}
export async function setStoreLogo(id:string,form:FormData){
 const s=await admin();const file=form.get("logo");if(!(file instanceof File)||!file.size)throw new Error("请选择 Logo 图片");
 const image=await optimizeAndUploadImage(file,`stores/${id}/logo`);
 const {error}=await s.rpc("v4_set_store_logo",{p_store_id:id,p_file:image});
 if(error){
  console.error("[store logo] save failed",error);
  // Only a confirmed database rollback permits compensation. Unknown outcomes retain the object.
  if(/^(22|23|42|P000)/.test(error.code||""))await removeObject(image.key).catch(e=>console.error("[store logo] compensation pending",{key:image.key,error:e}));
  throw new Error("保存失败，请稍后重试。");
 }
 refreshStoreViews();await drainCleanup();
}
export async function removeStoreLogo(id:string){const s=await admin();const {error}=await s.rpc("v4_set_store_logo",{p_store_id:id,p_file:null});if(error)fail(error);refreshStoreViews();await drainCleanup();}
export async function readParentOptions(storeId:string){const {s}=await session();const {data,error}=await s.from("parent_products").select("id,name").eq("store_id",storeId).order("name");if(error)fail(error);return data??[];}
function refreshWorkstationViews(ids?: number[]) { revalidatePath("/workstations"); for (const id of ids ?? [1,2,3,4,5,6,7,8]) revalidatePath(`/workstations/${id}`); }
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
function recordActivityAfter(s:Awaited<ReturnType<typeof createClient>>,actorId:string,targetType:string,targetId:string,action:string){
 try{after(()=>recordActivity(s,actorId,targetType,targetId,action))}catch(error){console.error("[recordActivity] Could not schedule audit write; asset operation remains successful",{actorId,targetType,targetId,action,error})}
}
export async function uploadStoreAsset(storeId:string, form:FormData) {
 const {s,user}=await userClient(),parentProductId=String(form.get("parent_product_id")||"")||null,category=String(form.get("category")||"other"),file=form.get("image");
 if(!["main","scene","a_plus","other"].includes(category))throw new Error("请选择有效分类");if(!(file instanceof File))throw new Error("请选择图片");
 const [store,parent,relations,personIds]=await Promise.all([
  s.from("stores").select("id").eq("id",storeId).is("archived_at",null).single(),
  parentProductId?s.from("parent_products").select("id").eq("id",parentProductId).eq("store_id",storeId).maybeSingle():Promise.resolve({data:null,error:null}),
  relationSelection(s,form,false),productionPersonSelection(s,form)
 ]);
 if(store.error||!store.data)throw new Error("店铺不存在或已归档");if(parentProductId&&(parent.error||!parent.data))throw new Error("所选父体不属于当前店铺");
 const fallbackTitle=file.name.replace(/\.[^.]+$/, "")||"未命名素材",{tagIds}=relations;
 const {data:asset,error}=await s.from("store_assets").insert({store_id:storeId,parent_product_id:parentProductId,title:fallbackTitle,description:String(form.get("description")||""),asset_category:category,created_by:user.id}).select("id").single();if(error||!asset)throw new Error(error?.message||"无法创建素材");
 let uploadedKey:string|null=null;try{
  const image=await optimizeAndUploadImage(file,`stores/${storeId}/assets`);uploadedKey=image.key;
  const {error:fileError}=await s.from("asset_files").insert({store_asset_id:asset.id,original_name:image.originalName,storage_key:image.key,mime_type:image.mimeType,size_bytes:image.sizeBytes,width:image.width,height:image.height,kind:"image",created_by:user.id});if(fileError){await removeObject(image.key);throw new Error(fileError.message)}
  await Promise.all([insertRelations(s,"store_asset_production_people","store_asset_id",asset.id,"production_person_id",personIds),insertRelations(s,"store_asset_tags","store_asset_id",asset.id,"tag_id",tagIds)]);
  recordActivityAfter(s,user.id,"store_asset",asset.id,"store_asset_created");revalidatePath(`/stores/${storeId}`);revalidatePath("/stores");revalidatePath("/workstations/people/[id]","page");revalidatePath("/");
 }catch(e){const {error:cleanupError}=await s.from("store_assets").delete().eq("id",asset.id);if(!cleanupError&&uploadedKey)await removeObject(uploadedKey).catch(()=>{});throw e}
}
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
    await insertRelations(s, "inspiration_tags", "inspiration_id", data.id, "tag_id", tagIds);
    recordActivityAfter(s, user.id, "inspiration", data.id, "inspiration_created");
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
  const [tags,workstations]=await Promise.all([
    tagIds.length?(async()=>{let result=await s.from(tagScope==="store"?"store_tags":"tags").select("id").in("id",tagIds);if(tagScope==="store"&&["PGRST205","42P01"].includes(result.error?.code||""))result=await s.from("tags").select("id").in("id",tagIds);return result})():Promise.resolve({data:[],error:null}),
    workstationIds.length?s.from("workstations").select("id").in("id",workstationIds):Promise.resolve({data:[],error:null})
  ]);
  if(tags.error)throw new Error(tags.error.message);if(tags.data?.length!==tagIds.length)throw new Error("部分标签已失效，请刷新后重试");
  if(workstations.error)throw new Error(workstations.error.message);if(workstations.data?.length!==workstationIds.length)throw new Error("部分工作站已失效，请刷新后重试");
  return { tagIds, workstationIds };
}
async function productionPersonSelection(s: Awaited<ReturnType<typeof createClient>>, form: FormData) {
  const raw=form.getAll("production_person_ids").map(String);
  const ids=[...new Set(raw)];
  if(raw.length!==ids.length||ids.some(id=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))throw new Error("制作人员选择无效");
  if(!ids.length)return ids;
  const {data,error}=await s.from("production_people").select("id").in("id",ids).is("disabled_at",null);
  if(error||data?.length!==ids.length)throw new Error("部分制作人员已失效，请刷新后重试");
  return ids;
}
async function insertRelations(s:Awaited<ReturnType<typeof createClient>>,table:string,parentKey:string,id:string,targetKey:string,ids:(string|number)[]){
 if(!ids.length)return;const {data,error}=await s.from(table).insert(ids.map(value=>({[parentKey]:id,[targetKey]:value}))).select(targetKey);if(error)throw new Error(error.message);if(data?.length!==ids.length)throw new Error("关联保存失败，请刷新后重试");
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
  const personIds=form.has("production_people_present")?[...new Set(form.getAll("production_person_ids").map(String))]:null;
  const {error}=await s.rpc("v5_update_shared_asset",{p_id:id,p_description:description,p_store_ids:storeIds,p_workstation_ids:workstationIds,p_person_ids:personIds});
  if(error)fail(error);
  revalidatePath("/shared"); revalidatePath("/stores"); revalidatePath("/stores/[id]", "page"); refreshWorkstationViews(); revalidatePath("/workstations/people/[id]","page"); revalidatePath("/");
}
export async function updateStoreAsset(id: string, form: FormData) {
  const { s } = await userClient();
  const category = String(form.get("category") || "");
  if (!["main", "scene", "a_plus", "other"].includes(category)) throw new Error("请选择有效分类");
  const includesTags=form.has("tag_ids");
  const { tagIds, workstationIds } = await relationSelection(s, form, true, includesTags);
  const parentProductId=String(form.get("parent_product_id")||"")||null;
  const personIds=form.has("production_people_present")?[...new Set(form.getAll("production_person_ids").map(String))]:null;
  const {data:storeId,error}=await s.rpc("v5_update_store_asset",{p_id:id,p_category:category,p_change_parent:form.has("parent_product_id"),p_parent_id:parentProductId,p_tag_ids:includesTags?tagIds:null,p_workstation_ids:workstationIds,p_person_ids:personIds});
  if(error||!storeId)fail(error||new Error("素材不存在或没有编辑权限"));
  revalidatePath('/stores/' + storeId); revalidatePath("/stores"); refreshWorkstationViews(); revalidatePath("/workstations/people/[id]","page"); revalidatePath("/");
}

export async function saveParentProduct(storeId:string,id:string|null,form:FormData){const {s}=await session();const {error}=await s.rpc("v4_save_parent",{p_id:id,p_store_id:storeId,p_name:String(form.get("name")||""),p_tag_ids:form.getAll("product_tag_ids").map(String).filter(Boolean)});if(error)fail(error);refreshStoreViews();}
export async function deleteParentProduct(id:string){const {s}=await session();const {error}=await s.rpc("v4_delete_parent",{p_id:id});if(error)fail(error);refreshStoreViews();}
export async function setParentCover(id:string,assetId:string|null){const {s}=await session();const {error}=await s.rpc("v4_set_parent_cover",{p_id:id,p_asset_id:assetId});if(error)fail(error);refreshStoreViews();}
export async function createProductTag(name:string){const {s}=await session();const {data,error}=await s.rpc("v4_create_product_tag",{p_name:name});if(error)fail(error);refreshStoreViews();return data;}
export async function manageProductTag(id:string,name?:string,remove=false){const {s}=await session(true);const {error}=await s.rpc("v4_manage_product_tag",{p_id:id,p_name:name??null,p_delete:remove});if(error)fail(error);refreshStoreViews();}
export async function batchStoreAssets(storeId:string,assetIds:string[],operation:string,value?:string,tagIds:string[]=[]){const {s}=await session();const args={p_store_id:storeId,p_asset_ids:assetIds,p_operation:operation,p_parent_id:operation==="set_parent"?value:null,p_category:operation==="category"?value:null,p_tag_ids:tagIds};const {data,error}=await s.rpc("v4_batch_store_assets",args);if(error){console.error("[batch assets]",error);throw new Error(error.code==="42501"?"你目前没有权限执行此操作。":error.code&&/^(22|23|42|P000)/.test(error.code)?"批量操作失败，未对素材进行部分修改。":"批量操作结果暂时无法确认，请刷新后检查。");}refreshStoreViews();if(operation==="delete")await drainCleanup();return Number(data||0);}
export async function createSharedAsset(form:FormData) {
 const measuring=env.NODE_ENV==="development",requestedId=String(form.get("_upload_perf_id")||""),requestId=measuring?(/^[a-f\d-]{8,36}$/i.test(requestedId)?requestedId:randomUUID().slice(0,8)):"",started=measuring?performance.now():0;let previous=started;
 const mark=(stage:string)=>{if(!measuring)return;const now=performance.now();console.info(`[shared-upload:${requestId}] ${stage}`,{stageMs:Math.round(now-previous),totalMs:Math.round(now-started)});previous=now};
 mark("1. Server Action entered");
 const {s,user}=await userClient(),file=form.get("image");mark("2. Authentication complete");if(!(file instanceof File))throw new Error("请选择图片");
 const [storeIds,personIds]=await Promise.all([sharedStoreSelection(s,form),productionPersonSelection(s,form)]),fallbackTitle=file.name.replace(/\.[^.]+$/, "")||"未命名共享素材";mark("3. Associations validated");
 const {data:asset,error}=await s.from("shared_assets").insert({title:fallbackTitle,description:String(form.get("description")||""),asset_type:"other",created_by:user.id}).select("id").single();if(error||!asset)throw new Error(error?.message||"无法创建共享素材");
 mark("4. Asset row created");
 let uploadedKey:string|null=null;try{
  const image=await optimizeAndUploadImage(file,"shared",stage=>mark(stage==="file-read"?"5. File read complete":stage==="sharp"?"6. Sharp complete":"7. R2 upload complete"));uploadedKey=image.key;
  const {data:fileRow,error:fileError}=await s.from("asset_files").insert({shared_asset_id:asset.id,original_name:image.originalName,storage_key:image.key,mime_type:image.mimeType,size_bytes:image.sizeBytes,width:image.width,height:image.height,kind:"image",created_by:user.id}).select("id").single();if(fileError||!fileRow){await removeObject(image.key);throw new Error(fileError?.message||"无法保存图片")}
  mark("8. asset_files row created");
  const {error:previewError}=await s.from("shared_assets").update({preview_file_id:fileRow.id}).eq("id",asset.id);if(previewError)throw new Error(previewError.message);
  await Promise.all([insertRelations(s,"shared_asset_stores","shared_asset_id",asset.id,"store_id",storeIds),insertRelations(s,"shared_asset_production_people","shared_asset_id",asset.id,"production_person_id",personIds)]);
  mark("9. Asset associations created");
  recordActivityAfter(s,user.id,"shared_asset",asset.id,"shared_asset_created");revalidatePath("/shared");revalidatePath("/stores");for(const id of storeIds)revalidatePath(`/stores/${id}`);revalidatePath("/workstations/people/[id]","page");revalidatePath("/");mark("10. Revalidation scheduled");
  mark("11. Before Server Action return");return {id:asset.id,requestId};
 }catch(e){const {error:cleanupError}=await s.from("shared_assets").delete().eq("id",asset.id);if(!cleanupError&&uploadedKey)await removeObject(uploadedKey).catch(()=>{});throw e}
}
