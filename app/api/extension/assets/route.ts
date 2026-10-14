import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { uploadCollectedImage, removeObject } from "@/lib/r2";

export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (status:number,message:string) => Response.json({error:message},{status,headers:{"Cache-Control":"private, no-store"}});

export async function POST(request:Request) {
 const token=request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
 if (!token) return json(401,"请登录火麦账号。");
 const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{
  global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}
 });
 const [{data:{user},error:authError},active]=await Promise.all([s.auth.getUser(token),s.rpc("is_active_member")]);
 if(authError||!user||active.error||active.data!==true)return json(403,"账号不可用或无上传权限。");
 const {data:profile,error:profileError}=await s.from("profiles").select("is_disabled").eq("id",user.id).single();
 if(profileError||profile?.is_disabled!==false)return json(403,"账号不可用或无上传权限。");
 const contentLength=Number(request.headers.get("content-length")||0);
 if(contentLength>22*1024*1024)return json(413,"图片不能超过 20MB。");
 let form:FormData;
 try{form=await request.formData();}catch{return json(400,"上传内容无效。");}
 const id=String(form.get("id")||""),target=String(form.get("target")||""),file=form.get("image");
 if(!uuid.test(id)||!(["store","inspiration"].includes(target))||!(file instanceof File))return json(400,"上传参数无效。");
 if(file.size>20*1024*1024||!file.size)return json(400,"图片不能超过 20MB。");
 const ids=(key:string)=>form.getAll(key).map(String);
 const tagIds=ids("tag_ids"),personIds=ids("production_person_ids");
 if([...tagIds,...personIds].some(value=>!uuid.test(value))||new Set(tagIds).size!==tagIds.length||new Set(personIds).size!==personIds.length)return json(400,"关联选项无效。");
 const storeId=String(form.get("store_id")||""),parentId=String(form.get("parent_product_id")||"")||null;
 const category=String(form.get("category")||"");
 if(target==="store"&&(!uuid.test(storeId)||!(["main","scene","a_plus","other"].includes(category))||(parentId&&!uuid.test(parentId))))return json(400,"店铺归类无效。");
 const existing=target==="store"
  ?await s.from("store_assets").select("id,created_by,store_id").eq("id",id).maybeSingle()
  :await s.from("inspirations").select("id,created_by").eq("id",id).maybeSingle();
 if(existing.error)return json(500,"无法确认图片保存状态，请稍后重试。");
 if(existing.data){
  if(existing.data.created_by!==user.id||(target==="store"&&"store_id" in existing.data&&existing.data.store_id!==storeId))return json(409,"图片保存标识已被使用。");
  const complete=target==="store"
   ?await s.from("asset_files").select("id").eq("store_asset_id",id).eq("kind","image").maybeSingle()
   :await s.from("inspirations").select("image_url").eq("id",id).single();
  if(complete.error)return json(500,"无法确认图片保存状态，请稍后重试。");
  if(target==="store"?!complete.data:!complete.data||!("image_url" in complete.data)||!complete.data.image_url)return json(409,"图片仍在保存中，请稍后重试。");
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
  if(!parentId&&tagIds.length)return json(400,"产品标签必须关联父体。");
  if(parentId){const actual=((parent.data as {parent_product_tags?:{product_tag_id:string}[]}).parent_product_tags??[]).map(item=>item.product_tag_id).sort();if(actual.join(",")!==[...tagIds].sort().join(","))return json(400,"父体标签已变化，请刷新后重试。");}
 }else if(!(await check("tags",tagIds)))return json(400,"标签已失效。");
 let sourceUrl:string|null=null,sourceDomain:string|null=null;
 if(target==="inspiration"){
  const raw=String(form.get("source_url")||"").trim();
  if(raw){try{const source=new URL(raw);if(!["http:","https:"].includes(source.protocol))throw Error();sourceUrl=source.href;sourceDomain=source.hostname;}catch{return json(400,"来源网址无效。");}}
 }
 let uploadedKey:string|null=null,created=false;
 try{
  // The stable client image ID makes a retry after an uncertain response idempotent.
  const image=await uploadCollectedImage(file,target==="store"?`stores/${storeId}/assets`:`inspirations`,id,async pending=>{
   uploadedKey=pending.key;
   if(target==="store"){
    const result=await s.from("store_assets").insert({id,store_id:storeId,parent_product_id:parentId,title:file.name.replace(/\.[^.]+$/,"")||"采集素材",asset_category:category,created_by:user.id}).select("id").single();
    if(result.error||!result.data)throw result.error||Error("无法创建素材");
   }else{
    const result=await s.from("inspirations").insert({id,title:file.name.replace(/\.[^.]+$/,"")||null,image_key:pending.key,image_url:"",source_url:sourceUrl,source_domain:sourceDomain,source_name:sourceDomain,created_by:user.id}).select("id").single();
    if(result.error||!result.data)throw result.error||Error("无法创建灵感");
   }
   created=true;
  });
  if(target==="store"){
   if(personIds.length){const rel=await s.from("store_asset_production_people").insert(personIds.map(production_person_id=>({store_asset_id:id,production_person_id})));if(rel.error)throw rel.error;}
   const row=await s.from("asset_files").insert({store_asset_id:id,original_name:image.originalName,storage_key:image.key,mime_type:image.mimeType,size_bytes:image.sizeBytes,width:image.width,height:image.height,kind:"image",created_by:user.id});
   if(row.error)throw row.error;
   revalidatePath(`/stores/${storeId}`);revalidatePath("/stores");revalidatePath("/workstations/people/[id]","page");
  }else{
   if(tagIds.length){const rel=await s.from("inspiration_tags").insert(tagIds.map(tag_id=>({inspiration_id:id,tag_id})));if(rel.error)throw rel.error;}
   const asset=await s.from("inspirations").update({image_url:`/api/inspirations/${id}/image`}).eq("id",id).select("id").single();
   if(asset.error||!asset.data)throw asset.error||Error("无法创建灵感");
   revalidatePath("/library");
  }
  revalidatePath("/");
  return Response.json({id},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){
  console.error("[extension upload] save failed",{id,target,error});
  if(created){const deleted=await s.from(target==="store"?"store_assets":"inspirations").delete().eq("id",id).eq("created_by",user.id);if(!deleted.error&&uploadedKey)await removeObject(uploadedKey).catch(e=>console.error("[extension upload] R2 cleanup pending",e));}
  if(error instanceof Error&&["无法识别图片文件","不支持此图片格式","图片不能超过 20MB"].includes(error.message))return json(400,error.message);
  return json(500,"图片保存失败，请重试。");
 }
}
