import { arrayOrEmpty, relationOne, relationMany } from "./relation-values";
import type { Activity, AssetDetail, StoreOption, WorkstationOverview, Inspiration, Store, SearchResults } from "./types";
import { createClient, isSupabaseConfigured } from "./supabase/server";

export async function getInspirations() { if (!isSupabaseConfigured()) return []; const s = await createClient(); const { data, error } = await s.from("inspirations").select("id,created_by,title,image_url,source_name,source_url,source_domain,created_at,inspiration_tags(tags(id,name,group_name,color))").order("created_at", { ascending: false }); if (error) throw new Error(error.message); return (data ?? []).map((x: any) => ({ id:x.id, createdBy:x.created_by, title:x.title || "未命名灵感", image:x.image_url, source:x.source_name || x.source_domain || "未记录", sourceUrl:x.source_url, sourceDomain:x.source_domain, createdAt:x.created_at, tags:arrayOrEmpty<any>(x.inspiration_tags).map(join => relationOne<any>(join.tags)).filter(Boolean), ratio:"medium" as const })); }
export async function getStores() { return getHomeStores(); }
export async function getTags(scope: "inspiration" | "store" | "prompt" = "inspiration") {
 if(!isSupabaseConfigured())return [];
 const s=await createClient();const {data,error}=await s.from(scope === "store" ? "store_tags" : scope === "prompt" ? "prompt_tags" : "tags").select("id,name,group_name,color").order("group_name").order("name");
 if(error && ["PGRST205","42P01"].includes(error.code)) {
  if(scope === "prompt")return [];
  if(scope === "store") { const legacy=await s.from("store_asset_tags").select("tags(id,name,group_name,color)");if(legacy.error)throw new Error("标签读取失败，请重试。");return [...new Map(relationMany<any>(legacy.data).map(r=>relationOne<any>(r.tags)).filter(Boolean).map(t=>[t.id,t])).values()]; }
 }
 if(error)throw new Error("标签读取失败，请重试。");return data??[];
}
export async function getWorkstations() { if (!isSupabaseConfigured()) return Array.from({length:8},(_,i)=>({id:i+1,current_user_name:null,note:null})); const s = await createClient(); const { data } = await s.from("workstations").select("*").order("id"); return data ?? []; }
export async function getSidebarData(realOnly = false) { if (!isSupabaseConfigured()) return { profile: { displayName: "用户", role: "member" as const }, stores: [] }; const s = await createClient(); const [{ data: { user } }, { data: stores }] = await Promise.all([s.auth.getUser(), s.from("stores").select("id,name,description,store_assets(count),shared_count:shared_asset_stores(count)").is("archived_at", null).order("updated_at", { ascending: false })]); const { data: profile } = user ? await s.from("profiles").select("display_name,role").eq("id", user.id).maybeSingle() : { data: null }; const fallbackName = user?.email?.split("@")[0] || "用户"; return { profile: { id: user?.id, displayName: profile?.display_name?.trim() || fallbackName, role: profile?.role === "admin" ? "admin" as const : "member" as const }, stores: (stores ?? []).map((x: any) => ({ id:x.id, name:x.name, count:Number(relationOne<any>(x.store_assets)?.count || 0) + Number(relationOne<any>(x.shared_count)?.count || 0), recent:x.description || "尚无资产", cover:"" })) }; }
export async function getStoreById(id: string) { if (!isSupabaseConfigured()) return null; const s = await createClient(); const { data } = await s.from("stores").select("id,name,description").eq("id", id).is("archived_at", null).maybeSingle(); return data; }
const storeAssetSelect = "id,created_by,store_id,asset_category,created_at,updated_at,store:stores!store_assets_store_id_fkey(id,name,archived_at),asset_files!asset_files_store_asset_id_fkey(id),store_asset_tags(tags:store_tags(id,name,group_name,color)),store_asset_workstations(workstations(id,current_user_name))";
const sharedAssetSelect = "id,created_by,description,created_at,updated_at,preview_file:asset_files!shared_assets_preview_file_fk(id),shared_asset_stores(store_id,stores(id,name,archived_at)),shared_asset_workstations(workstations(id,current_user_name))";
function normalizeStore(value: any, id?: string): StoreOption | null {
  const store = relationOne<any>(value);
  if (!store?.id && !id) return null;
  return { id: String(store?.id || id), name: typeof store?.name === "string" ? store.name : "历史店铺（信息不可见）", archivedAt: store?.archived_at ?? null };
}
function normalizeWorkstations(joins: any) {
  return relationMany<any>(joins).map(join => relationOne<any>(join.workstations)).filter(Boolean).map(item => ({ id: Number(item.id), current_user_name: typeof item.current_user_name === "string" ? item.current_user_name : null })).filter(item => Number.isInteger(item.id) && item.id >= 1 && item.id <= 8);
}
function storeAssetDetail(item: any): AssetDetail {
  const file = relationMany<any>(item.asset_files)[0];
  return { id: item.id, createdBy: item.created_by, kind: "store", assetCategory: item.asset_category, createdAt: item.created_at ?? "", updatedAt: item.updated_at ?? null, store: normalizeStore(item.store, item.store_id), image: file?.id ? '/api/media/' + file.id : null, tags: relationMany<any>(item.store_asset_tags).map(join => relationOne<any>(join.tags)).filter(Boolean), workstations: normalizeWorkstations(item.store_asset_workstations) };
}
function sharedAssetDetail(item: any): AssetDetail {
  const file = relationOne<any>(item.preview_file);
  return { id: item.id, createdBy: item.created_by, kind: "shared", note: typeof item.description === "string" ? item.description : null, createdAt: item.created_at ?? "", updatedAt: item.updated_at ?? null, image: file?.id ? '/api/media/' + file.id : null, tags: [], stores: relationMany<any>(item.shared_asset_stores).map(join => normalizeStore(join.stores, join.store_id)).filter((store): store is StoreOption => store !== null), workstations: normalizeWorkstations(item.shared_asset_workstations) };
}
export async function getStoreAssets(storeId: string): Promise<AssetDetail[]> {
  if (!isSupabaseConfigured()) return [];
  const s = await createClient();
  const [own, shared] = await Promise.all([
    readStoreQuery(select => s.from("store_assets").select(select).eq("store_id", storeId).order("updated_at", { ascending: false })),
    s.from("shared_asset_stores").select("asset:shared_assets(" + sharedAssetSelect + ")").eq("store_id", storeId),
  ]);
  for (const result of [own, shared]) if (result.error) throw new Error(result.error.message);
  const assets = [...relationMany<any>(own.data).map(storeAssetDetail), ...relationMany<any>(shared.data).map(row => relationOne<any>(row.asset)).filter(Boolean).map(sharedAssetDetail)];
  return [...new Map(assets.map(asset => [asset.kind + ":" + asset.id, asset])).values()].sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
}
export async function getSharedAssets(): Promise<AssetDetail[]> {
  if (!isSupabaseConfigured()) return [];
  const s = await createClient();
  const { data, error } = await s.from("shared_assets").select(sharedAssetSelect).order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return relationMany<any>(data).map(sharedAssetDetail);
}
export async function getActiveStoreOptions(): Promise<StoreOption[]> {
  if (!isSupabaseConfigured()) return [];
  const s = await createClient();
  const { data, error } = await s.from("stores").select("id,name").is("archived_at", null).order("name");
  if (error) throw new Error(error.message);
  return relationMany<any>(data).map(item => ({ id: item.id, name: item.name }));
}
export async function canEditWorkstations(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return false;
  const { data, error } = await s.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.role === "admin";
}
export async function getWorkstationOverview(): Promise<WorkstationOverview[]> {
  if (!isSupabaseConfigured()) return [];
  const s = await createClient();
  // Exact junction counts plus at most three previews per source per workstation.
  const { data, error } = await s.from("workstations").select(
    "id,current_user_name,store_count:store_asset_workstations(count),shared_count:shared_asset_workstations(count),store_previews:store_asset_workstations(asset:store_assets!inner(id,created_at,updated_at,asset_files!asset_files_store_asset_id_fkey(id))),shared_previews:shared_asset_workstations(asset:shared_assets!inner(id,created_at,updated_at,preview_file:asset_files!shared_assets_preview_file_fk(id)))"
  ).order("id", { ascending: false })
    .order("asset(updated_at)", { referencedTable: "store_previews", ascending: false })
    .limit(3, { referencedTable: "store_previews" })
    .order("asset(updated_at)", { referencedTable: "shared_previews", ascending: false })
    .limit(3, { referencedTable: "shared_previews" });
  if (error) throw new Error(error.message);
  return relationMany<any>(data).map(item => {
    const previews = [
      ...relationMany<any>(item.store_previews).map(join => relationOne<any>(join.asset)).filter(Boolean).map(asset => ({ id: 'store:' + asset.id, image: relationMany<any>(asset.asset_files)[0]?.id ? '/api/media/' + relationMany<any>(asset.asset_files)[0].id : null, time: asset.updated_at || asset.created_at || "" })),
      ...relationMany<any>(item.shared_previews).map(join => relationOne<any>(join.asset)).filter(Boolean).map(asset => ({ id: 'shared:' + asset.id, image: relationOne<any>(asset.preview_file)?.id ? '/api/media/' + relationOne<any>(asset.preview_file).id : null, time: asset.updated_at || asset.created_at || "" })),
    ].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 3).map(({ id, image }) => ({ id, image }));
    return { id: Number(item.id), current_user_name: item.current_user_name || null, count: Number(relationOne<any>(item.store_count)?.count || 0) + Number(relationOne<any>(item.shared_count)?.count || 0), previews };
  });
}
export async function getWorkstationById(id: number) {
  if (!isSupabaseConfigured()) return null;
  const s = await createClient();
  const { data, error } = await s.from("workstations").select("id,current_user_name").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { id: Number(data.id), current_user_name: data.current_user_name || null } : null;
}
export async function getWorkstationAssets(id: number): Promise<AssetDetail[]> {
  if (!isSupabaseConfigured()) return [];
  const s = await createClient();
  const [stores, shared] = await Promise.all([
    readStoreQuery(select => s.from("store_asset_workstations").select("asset:store_assets(" + select + ")").eq("workstation_id", id)),
    s.from("shared_asset_workstations").select("asset:shared_assets(" + sharedAssetSelect + ")").eq("workstation_id", id),
  ]);
  if (stores.error) throw new Error(stores.error.message);
  if (shared.error) throw new Error(shared.error.message);
  return [...relationMany<any>(stores.data).map(row => relationOne<any>(row.asset)).filter(Boolean).map(storeAssetDetail), ...relationMany<any>(shared.data).map(row => relationOne<any>(row.asset)).filter(Boolean).map(sharedAssetDetail)].sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
}
const inspirationSelect = "id,created_by,title,image_url,source_name,source_url,source_domain,created_at,inspiration_tags(tags(id,name,group_name,color))";
function inspirationDetail(item: any): Inspiration {
  return { id: item.id, createdBy: item.created_by, title: item.title || "未命名灵感", image: item.image_url || '/api/inspirations/' + item.id + '/image', source: item.source_domain || item.source_name || "未记录", sourceUrl: item.source_url ?? null, sourceDomain: item.source_domain ?? null, createdAt: item.created_at ?? "", tags: relationMany<any>(item.inspiration_tags).map(join => relationOne<any>(join.tags)).filter(Boolean), ratio: "medium" };
}
export async function getHomeInspirations(): Promise<Inspiration[]> {
  if (!isSupabaseConfigured()) return [];
  const s = await createClient();
  const { data, error } = await s.from("inspirations").select(inspirationSelect).order("created_at", { ascending: false }).limit(8);
  if (error) throw new Error(error.message);
  return relationMany<any>(data).map(inspirationDetail);
}
export const storeCountSelect = "asset_count:store_assets(count),shared_count:shared_asset_stores(count)";
export const storeAssetCount = (row: any) => Number(relationOne<any>(row.asset_count)?.count || 0) + Number(relationOne<any>(row.shared_count)?.count || 0);
export async function getStoreAssetCount(id: string) { if(!isSupabaseConfigured()) return 0; const s=await createClient(); const {data,error}=await s.from("stores").select(storeCountSelect).eq("id",id).maybeSingle(); if(error) throw new Error("素材数量读取失败，请重试。"); return storeAssetCount(data || {}); }
export async function getSharedAssetCount() { if(!isSupabaseConfigured()) return 0; const s=await createClient();const {count,error}=await s.from("shared_assets").select("id",{count:"exact",head:true});if(error)throw new Error("共享素材数量读取失败，请重试。");return count||0; }
export async function getHomeStores(): Promise<Store[]> {
  if (!isSupabaseConfigured()) return [];
  const s = await createClient();
  const { data, error } = await s.from("stores").select("id,name,description,updated_at," + storeCountSelect + ",asset_summary:store_assets(asset_category,updated_at)").is("archived_at", null).order("updated_at", { ascending: false }).order("updated_at", { referencedTable: "asset_summary", ascending: false });
  if (error) throw new Error(error.message);
  return relationMany<any>(data).map(item => {
    const assets = relationMany<any>(item.asset_summary);
    return { id: item.id, name: item.name || "未命名店铺", count: storeAssetCount(item), recent: item.description || "", cover: null, updatedAt: assets.reduce((latest, asset) => asset.updated_at > latest ? asset.updated_at : latest, item.updated_at || ""), categories: [...new Set(assets.map(asset => asset.asset_category).filter(value => ["main", "scene", "a_plus", "other"].includes(value)))] as string[] };
  });
}
export async function getRecentActivities(): Promise<Activity[]> {
  if (!isSupabaseConfigured()) return [];
  const s = await createClient();
  const { data, error } = await s.from("activities").select("id,target_type,target_id,action,created_at").order("created_at", { ascending: false }).limit(8);
  if (error) throw new Error(error.message);
  const records = relationMany<any>(data).filter(item => ["inspiration", "store_asset", "shared_asset"].includes(item.target_type));
  const ids = (type: string) => [...new Set(records.filter(item => item.target_type === type && item.target_id).map(item => item.target_id as string))];
  const inspirationIds = ids("inspiration"), storeIds = ids("store_asset"), sharedIds = ids("shared_asset");
  const [inspirations, stores, shared] = await Promise.all([
    inspirationIds.length ? s.from("inspirations").select(inspirationSelect).in("id", inspirationIds) : Promise.resolve({ data: [], error: null }),
    storeIds.length ? readStoreQuery(select => s.from("store_assets").select(select).in("id", storeIds)) : Promise.resolve({ data: [], error: null }),
    sharedIds.length ? s.from("shared_assets").select(sharedAssetSelect).in("id", sharedIds) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [inspirations, stores, shared]) if (result.error) throw new Error(result.error.message);
  const inspirationMap = new Map(relationMany<any>(inspirations.data).map(item => [item.id, inspirationDetail(item)]));
  const storeMap = new Map(relationMany<any>(stores.data).map(item => [item.id, storeAssetDetail(item)]));
  const sharedMap = new Map(relationMany<any>(shared.data).map(item => [item.id, sharedAssetDetail(item)]));
  return records.flatMap((item): Activity[] => {
    const base = { id: item.id, targetId: item.target_id, action: item.action, createdAt: item.created_at ?? "" };
    if (item.target_type === "inspiration") {
      const target = inspirationMap.get(item.target_id);
      return target ? [{ ...base, type: "inspiration", title: item.action === "inspiration_updated" ? "更新灵感" : "保存灵感", location: "素材库", image: target.image, href: "/library", inspiration: target }] : [];
    }
    if (item.target_type === "store_asset") {
      const target = storeMap.get(item.target_id);
      const labels: Record<string, string> = { main: "主图", scene: "副图", a_plus: "A+", other: "素材" };
      return target ? [{ ...base, type: "store_asset", title: item.action === "store_asset_updated" ? "更新素材" : "新增" + (labels[target.assetCategory || "other"] || "素材"), location: target.store?.name || "店铺", image: target.image, href: target.store ? '/stores/' + target.store.id : '/stores', asset: target }] : [];
    }
    const target = sharedMap.get(item.target_id);
    return target ? [{ ...base, type: "shared_asset", title: item.action === "shared_asset_updated" ? "更新共享素材" : "新增共享素材", location: "共享素材", image: target.image, href: "/shared", asset: target }] : [];
  });
}
export async function getHomeData() {
  if (!isSupabaseConfigured()) return { inspirations: [], stores: [], activities: [], tags: [], workstations: [], now: Date.now() };
  const [inspirations, stores, activities, tags, workstations] = await Promise.all([getHomeInspirations(), getHomeStores(), getRecentActivities(), getTags(), getWorkstations()]);
  return { inspirations, stores, activities, tags, workstations, now: Date.now() };
}

export async function searchAssets(input: string): Promise<SearchResults> {
  const empty: SearchResults = { inspirations: [], shared: [], assets: [], stores: [], tags: [] };
  const query = typeof input === "string" ? input.trim().slice(0, 100) : "";
  if (!query || !isSupabaseConfigured()) return empty;
  const s = await createClient();
  const { data: { user }, error: authError } = await s.auth.getUser();
  if (authError || !user) throw new Error("请先登录后搜索");
  // Quote PostgREST values and escape LIKE wildcards: user input stays literal.
  const pattern = "%" + query.replace(/[\\%_*]/g, value => "\\" + value) + "%";
  const match = (fields: string[]) => fields.map(field => field + ".ilike." + JSON.stringify(pattern)).join(",");
  const [inspirations, shared, assets, stores, tags, storeTags, promptTags] = await Promise.all([
    s.from("inspirations").select(inspirationSelect).or(match(["title", "note", "source_url", "source_domain"])).order("created_at", { ascending: false }).limit(6),
    s.from("shared_assets").select(sharedAssetSelect).or(match(["title", "description"])).order("updated_at", { ascending: false }).limit(6),
    readStoreQuery(select => s.from("store_assets").select(select).or(match(["title", "description"])).order("updated_at", { ascending: false }).limit(6)),
    s.from("stores").select("id,name").is("archived_at", null).or(match(["name", "description"])).order("name").limit(6),
    s.from("tags").select("id,name,group_name,color").ilike("name", pattern).order("name").limit(6),
    s.from("store_tags").select("id,name,group_name,color").ilike("name",pattern).order("name").limit(6),
    s.from("prompt_tags").select("id,name,group_name,color").ilike("name",pattern).order("name").limit(6),
  ]);
  for (const result of [inspirations, shared, assets, stores, tags]) if (result.error) {
    console.error("[searchAssets] Search failed", result.error);
    throw new Error("搜索暂时不可用，请稍后重试");
  }
  for(const result of [storeTags,promptTags]) if(result.error && !["PGRST205","42P01"].includes(result.error.code)) { console.error("[searchAssets] Tag search failed",result.error); throw new Error("搜索暂时不可用，请稍后重试"); }
  const {searchHandbookModules}=await import("./handbook-data");
  const modules=await searchHandbookModules(query);
  return { ...modules,storeTags:relationMany<any>(storeTags.data),promptTags:relationMany<any>(promptTags.data), inspirations: relationMany<any>(inspirations.data).map(inspirationDetail), shared: relationMany<any>(shared.data).map(sharedAssetDetail), assets: relationMany<any>(assets.data).map(storeAssetDetail), stores: relationMany<any>(stores.data).map(item => ({ id: item.id, name: item.name })), tags: relationMany<any>(tags.data) };
}

export async function getStoreIdsForTag(tag:string):Promise<string[]>{if(!isSupabaseConfigured())return [];const s=await createClient();const {data,error}=await s.from("store_assets").select("store_id,store_asset_tags!inner(tag_id)").eq("store_asset_tags.tag_id",tag);if(error)throw new Error("标签筛选读取失败，请重试。");return [...new Set(relationMany<any>(data).map(r=>String(r.store_id)))];}

// Transitional read compatibility while the reviewed V1 migration awaits deployment.
// No new mixed-scope tags are created: new tag/move controls remain gated until ready.
async function readStoreQuery(build:(select:string)=>PromiseLike<any>) {
 const result=await build(storeAssetSelect);
 if(result.error && ["PGRST200","PGRST205","42P01"].includes(result.error.code)) return build(storeAssetSelect.replace("tags:store_tags(","tags("));
 return result;
}
export async function getV1Ready(){if(!isSupabaseConfigured())return false;const s=await createClient();const {error}=await s.rpc("v1_search_handbook_ids",{p_query:""});if(error){if(!["PGRST202","42883"].includes(error.code))console.error("[V1 readiness]",error);return false;}return true;}
