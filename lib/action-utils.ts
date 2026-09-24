import "server-only";
import { createClient } from "@/lib/supabase/server";
import { removeObject } from "@/lib/r2";
import { userError } from "./user-error";
import { revalidatePath } from "next/cache";
export async function session(adminOnly = false) {
  const s = await createClient(); const { data: { user } } = await s.auth.getUser();
  if (!user) throw new Error("你目前没有权限执行此操作。");
  const { data: profile, error } = await s.from("profiles").select("role,is_disabled").eq("id",user.id).single();
  if (error || !profile || profile.is_disabled !== false) throw new Error("账号不可用，请联系管理员。");
  if (adminOnly && profile?.role !== "admin") throw new Error("你目前没有权限执行此操作。");
  return { s, user, isAdmin: profile?.role === "admin" };
}
export function fail(error: unknown): never { console.error("[V1 operation]",error); throw new Error(userError(error)); }
export function refreshAssets() { revalidatePath("/", "layout"); }
export async function drainCleanup() {
  try {
    const {s}=await session();
    const {data,error}=await s.from("r2_cleanup_queue").select("storage_key").is("completed_at",null).limit(50);
    if(error){console.error("[R2 cleanup] queue unavailable",error);return;}
    for(const row of data??[]) { try { await removeObject(row.storage_key); const result=await s.from("r2_cleanup_queue").update({completed_at:new Date().toISOString()}).eq("storage_key",row.storage_key); if(result.error) console.error("[R2 cleanup] mark pending",result.error); } catch(error){console.error("[R2 cleanup] retry pending",{key:row.storage_key,error});} }
  } catch(error){console.error("[R2 cleanup] deferred",error);}
}
