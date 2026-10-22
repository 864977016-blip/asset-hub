import { createClient } from "@supabase/supabase-js";
import { revalidatePath as invalidatePath } from "next/cache";
import { uploadCollectedImage, removeObject } from "@/lib/r2";
import { createClient as cookieClient } from "@/lib/supabase/server";
import { after } from "next/server";

export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (status:number,message:string) => Response.json({error:message},{status,headers:{"Cache-Control":"private, no-store"}});
function revalidatePath(path:string,type?:"page"|"layout"){try{invalidatePath(path,type);}catch{console.error("[image upload] cache invalidation failed; saved asset retained");}}

export async function POST(request:Request) {
 const started=performance.now();let previous=started;
 const headerId=request.headers.get("x-upload-id")||"";
 let requestId=uuid.test(headerId)?headerId.slice(0,8):"pending",stage="auth";
 const mark=(name:string)=>{const now=performance.now();if(process.env.NODE_ENV==="development")console.info(`[image-upload:${requestId}]`,{stage:name,stageMs:Math.round(now-previous),totalMs:Math.round(now-started)});previous=now;};
 mark("request-start");
 const token=request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
 // Cookie uploads must come from the website; extension requests still require a verified bearer token.
 const website=!token;
 if(website&&request.headers.get("origin")!==new URL(request.url).origin)return json(401,"请登录火麦账号。");
 const s=website?await cookieClient():createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{
  global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}
 });
 const [{data:{user},error:authError},active]=await Promise.all([s.auth.getUser(token),s.rpc("is_active_member")]);
 if(authError||!user||active.error||active.data!==true)return json(403,"账号不可用或无上传权限。");
 const {data:profile,error:profileError}=await s.from("profiles").select("is_disabled").eq("id",user.id).single();
 if(profileError||profile?.is_disabled!==false)return json(403,"账号不可用或无上传权限。");
 mark("auth");
 const contentLength=Number(request.headers.get("content-length")||0);
 if(contentLength>22*1024*1024)return json(413,"图片不能超过 20MB。");
 let form:FormData;
 try{form=await request.formData();}catch{return json(400,"上传内容无效。");}
 const id=String(form.get("id")||""),target=String(form.get("target")||""),file=form.get("image");
 if(!uuid.test(id)||!((website?["store","shared","inspiration"]:["store","inspiration"]).includes(target))||!(file instanceof File))return json(400,"上传参数无效。");
 requestId=id.slice(0,8);mark("request-body");
 if(file.size>20*1024*1024||!file.size)return json(400,"图片不能超过 20MB。");
 const ids=(key:string)=>form.getAll(key).map(String);
 const tagIds=ids("tag_ids"),personIds=ids("production_person_ids");
 if([...tagIds,...personIds].some(value=>!uuid.test(value))||new Set(tagIds).size!==tagIds.length||new Set(personIds).size!==personIds.length)return json(400,"关联选项无效。");
 const storeId=String(form.get("store_id")||""),parentId=String(form.get("parent_product_id")||"")||null;
 const category=String(form.get("category")||"");
 const storeIds=ids("store_ids"),table=target==="store"?"store_assets":target==="shared"?"shared_assets":"inspirations";
 if(storeIds.some(value=>!uuid.test(value))||new Set(storeIds).size!==storeIds.length)return json(400,"关联店铺无效。");
 if(target==="store"&&(!uuid.test(storeId)||!(["main","scene","a_plus","other"].includes(category))||(parentId&&!uuid.test(parentId))))return json(400,"店铺归类无效。");
 const existing=target==="store"
  ?await s.from("store_assets").select("id,created_by,store_id").eq("id",id).maybeSingle()
  :await s.from(table).select("id,created_by").eq("id",id).maybeSingle();
 if(existing.error)return json(500,"无法确认图片保存状态，请稍后重试。");
 if(existing.data){
  if(existing.data.created_by!==user.id||(target==="store"&&"store_id" in existing.data&&existing.data.store_id!==storeId))return json(409,"图片保存标识已被使用。");
  const complete=target!=="inspiration"
   ?await s.from("asset_files").select("id").eq(target==="store"?"store_asset_id":"shared_asset_id",id).eq("kind","image").maybeSingle()
   :await s.from("inspirations").select("image_url").eq("id",id).single();
  if(complete.error)return json(500,"无法确认图片保存状态，请稍后重试。");
  if(target!=="inspiration"?!complete.data:!complete.data||!("image_url" in complete.data)||!complete.data.image_url)return json(409,"图片仍在保存中，请稍后重试。");
  if(target==="shared"){const ready=await s.from("shared_assets").select("preview_file_id").eq("id",id).single();if(ready.error||!ready.data?.preview_file_id)return json(409,"图片仍在保存中，请稍后重试。");}
  return Response.json({id,alreadySaved:true},{headers:{"Cache-Control":"private, no-store"}});
 }
 const check=async(table:string,values:string[],extra?:{store?:string;active?:boolean})=>{
  if(!values.length)return true;
  let query=s.from(table).select("id").in("id",values);
  if(extra?.store)query=query.eq("store_id",extra.store);
  if(extra?.active)query=query.is("disabled_at",null);
  const result=await query;
  return !result.error&&result.data?.length===values.length;
 };
 if(target==="store"){
  const [store,parent,people]=await Promise.all([
   s.from("stores").select("id").eq("id",storeId).is("archived_at",null).maybeSingle(),
   parentId?s.from("parent_products").select("id,parent_product_tags(product_tag_id)").eq("id",parentId).eq("store_id",storeId).maybeSingle():Promise.resolve({data:true,error:null}),
   check("production_people",personIds,{active:true})
  ]);
  if(store.error||!store.data||parent.error||!parent.data||!people)return json(400,"店铺、父体或制作人员已失效。");
  if(website){if(!(await check("store_tags",tagIds)))return json(400,"标签已失效。");}
  else {if(!parentId&&tagIds.length)return json(400,"产品标签必须关联父体。");
   if(parentId){const actual=((parent.data as {parent_product_tags?:{product_tag_id:string}[]}).parent_product_tags??[]).map(item=>item.product_tag_id).sort();if(actual.join(",")!==[...tagIds].sort().join(","))return json(400,"父体标签已变化，请刷新后重试。");}}
 }else if(target==="shared"){
  const [activeStores,people]=await Promise.all([storeIds.length?s.from("stores").select("id").in("id",storeIds).is("archived_at",null):Promise.resolve({data:[],error:null}),check("production_people",personIds,{active:true})]);
  if(!people||activeStores.error||activeStores.data?.length!==storeIds.length)return json(400,"店铺或制作人员已失效。");
 }else if(!(await check("tags",tagIds)))return json(400,"标签已失效。");
 mark("validate-db");
 let sourceUrl:string|null=null,sourceDomain:string|null=null;
 if(target==="inspiration"){
  const raw=String(form.get("source_url")||"").trim();
  if(raw){try{const source=new URL(raw);if(!["http:","https:"].includes(source.protocol))throw Error();sourceUrl=source.href;sourceDomain=source.hostname;}catch{return json(400,"来源网址无效。");}}
 }
 let uploadedKey:string|null=null,created=false;
 try{
  stage="image";
  // The stable client image ID makes a retry after an uncertain response idempotent.
  const image=await uploadCollectedImage(file,target==="store"?`stores/${storeId}/assets`:target==="shared"?"shared":"inspirations",id,async pending=>{
   stage="database";
   uploadedKey=pending.key;
   if(target==="store"){
    const result=await s.from("store_assets").insert({id,store_id:storeId,parent_product_id:parentId,title:file.name.replace(/\.[^.]+$/,"")||"采集素材",asset_category:category,created_by:user.id}).select("id").single();
    if(result.error||!result.data)throw result.error||Error("无法创建素材");
   }else if(target==="shared"){
    const result=await s.from("shared_assets").insert({id,title:file.name.replace(/\.[^.]+$/,"")||"未命名共享素材",description:String(form.get("description")||"")||null,asset_type:"other",created_by:user.id}).select("id").single();
    if(result.error||!result.data)throw result.error||Error("无法创建素材");
   }else{
    const result=await s.from("inspirations").insert({id,title:file.name.replace(/\.[^.]+$/,"")||null,image_key:pending.key,image_url:"",source_url:sourceUrl,source_domain:sourceDomain,source_name:sourceDomain,created_by:user.id}).select("id").single();
    if(result.error||!result.data)throw result.error||Error("无法创建灵感");
   }
   created=true;
   mark("asset-db");stage="r2";
  },name=>{mark(name);if(name==="sharp")stage="database";if(name==="r2-start")stage="r2";});
  stage="database";
  if(target==="store"){
   const relations=[];
   if(personIds.length)relations.push(s.from("store_asset_production_people").insert(personIds.map(production_person_id=>({store_asset_id:id,production_person_id}))));
   if(website&&tagIds.length)relations.push(s.from("store_asset_tags").insert(tagIds.map(tag_id=>({store_asset_id:id,tag_id}))));
   for(const rel of await Promise.all(relations))if(rel.error)throw rel.error;
   const row=await s.from("asset_files").insert({store_asset_id:id,original_name:image.originalName,storage_key:image.key,mime_type:image.mimeType,size_bytes:image.sizeBytes,width:image.width,height:image.height,kind:"image",created_by:user.id});
   if(row.error)throw row.error;
   mark("relations-db");
   revalidatePath(`/stores/${storeId}`);revalidatePath("/stores");revalidatePath("/workstations/people/[id]","page");
  }else if(target==="shared"){
   const relations=[];
   if(personIds.length)relations.push(s.from("shared_asset_production_people").insert(personIds.map(production_person_id=>({shared_asset_id:id,production_person_id}))));
   if(storeIds.length)relations.push(s.from("shared_asset_stores").insert(storeIds.map(store_id=>({shared_asset_id:id,store_id}))));
   for(const rel of await Promise.all(relations))if(rel.error)throw rel.error;
   const row=await s.from("asset_files").insert({id,shared_asset_id:id,original_name:image.originalName,storage_key:image.key,mime_type:image.mimeType,size_bytes:image.sizeBytes,width:image.width,height:image.height,kind:"image",created_by:user.id});
   if(row.error)throw row.error;
   const preview=await s.from("shared_assets").update({preview_file_id:id}).eq("id",id);if(preview.error)throw preview.error;
   mark("relations-db");
   revalidatePath("/shared");revalidatePath("/stores");for(const store of storeIds)revalidatePath(`/stores/${store}`);revalidatePath("/workstations/people/[id]","page");
  }else{
   if(tagIds.length){const rel=await s.from("inspiration_tags").insert(tagIds.map(tag_id=>({inspiration_id:id,tag_id})));if(rel.error)throw rel.error;}
   const asset=await s.from("inspirations").update({image_url:`/api/inspirations/${id}/image`}).eq("id",id).select("id").single();
   if(asset.error||!asset.data)throw asset.error||Error("无法创建灵感");
   mark("relations-db");
   revalidatePath("/library");
  }
  revalidatePath("/");
  mark("revalidate");
  if(website)try{after(async()=>{try{const target_type=target==="inspiration"?target:target+"_asset";const result=await s.from("activities").insert({actor_id:user.id,target_type,target_id:id,action:target_type+"_created"});if(result.error)throw result.error;}catch{console.error("[upload activity] audit write failed");}});}catch{console.error("[upload activity] scheduling failed");}
  const headers:Record<string,string>={"Cache-Control":"private, no-store"};if(process.env.NODE_ENV==="development")headers["Server-Timing"]=`upload;dur=${Math.round(performance.now()-started)}`;
  return Response.json({id},{headers});
 }catch(error){
  console.error("[image upload] save failed",{requestId,stage});
  if(created){const deleted=await s.from(table).delete().eq("id",id).eq("created_by",user.id);if(!deleted.error&&uploadedKey)await removeObject(uploadedKey).catch(()=>console.error("[image upload] R2 cleanup pending"));}
  if(error instanceof Error&&["无法识别图片文件","不支持此图片格式","图片不能超过 20MB"].includes(error.message))return json(400,error.message);
  return json(500,stage==="image"?"图片处理失败，请检查图片后重试。":stage==="r2"?"图片存储服务上传失败，请重试。":"数据库保存失败，请重试。");
 }
}
