"use server";
import {session} from "@/lib/action-utils";
import {revalidatePath} from "next/cache";
import type {GeneratedInvitation} from "@/lib/team-members";
export async function generateInvitation():Promise<GeneratedInvitation>{
 const {s}=await session(true);const {data,error}=await s.rpc("v2_create_invitation");
 if(error)throw new Error("邀请码生成失败，请重试或确认账号功能已启用。");
 revalidatePath("/members");return data;
}
export async function changeMemberRole(id:string,role:"admin"|"member"){
 const {s}=await session(true);
 if(!["admin","member"].includes(role))throw new Error("请选择有效角色。");
 const {error}=await s.rpc("v2_set_member_role",{p_id:id,p_role:role});
 if(error){
  if(error.message?.includes("LAST_ADMIN_REQUIRED"))throw new Error("至少需要保留一名管理员，不能降级最后一名管理员。");
  if(error.code==="42501")throw new Error("你目前没有权限执行此操作。");
  throw new Error("角色修改失败，请刷新后重试。");
 }
 revalidatePath("/","layout");
}
export async function changeMemberStatus(id:string,disabled:boolean){
 const {s}=await session(true);
 if(typeof disabled!=="boolean")throw new Error("请选择有效状态。");
 const {error}=await s.rpc("v3_set_member_status",{p_id:id,p_disabled:disabled});
 if(error){
  if(error.message?.includes("LAST_ADMIN_REQUIRED"))throw new Error("至少需要保留一名正常状态的管理员。");
  console.error("[member status] Failed",{id,disabled,error});
  throw new Error("状态修改失败，请刷新后重试。请保留至少一名正常状态的管理员。");
 }
 revalidatePath("/","layout");
}
export async function handoverPrivatePrompts(source:string,recipient:string):Promise<number>{
 const {s}=await session(true);
 const {data,error}=await s.rpc("v3_handover_private_prompts",{p_source:source,p_recipient:recipient});
 if(error){
  console.error("[private prompt handover] Failed",{source,recipient,error});
  throw new Error("交接未完成，请刷新列表，确认原成员已停用、接收人仍为正常状态后重试。");
 }
 revalidatePath("/","layout");return Number(data);
}
