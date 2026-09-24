"use client";
import {useEffect,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {generateInvitation,changeMemberRole,changeMemberStatus,handoverPrivatePrompts} from "@/app/member-actions";
import type {TeamMember,ActiveInvitation,GeneratedInvitation} from "@/lib/team-members";
import {Modal} from "./modal";
export function MemberManagement({members,invitations,currentUserId}:{members:TeamMember[];invitations:ActiveInvitation[];currentUserId:string}){
 const [generated,setGenerated]=useState<GeneratedInvitation|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[pending,start]=useTransition(),[now,setNow]=useState(0);const router=useRouter();
 useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer)},[]);
 const [handover,setHandover]=useState<TeamMember|null>(null),[recipient,setRecipient]=useState("");
 const adminCount=members.filter(m=>m.role==="admin"&&!m.is_disabled).length;
 const time=(value:string)=>new Date(value).toLocaleString("zh-CN",{hour12:false,timeZone:"Asia/Shanghai"});
 const run=(task:()=>Promise<void>)=>start(async()=>{setError("");setNotice("");try{await task();router.refresh()}catch(e){setError(e instanceof Error?e.message:"操作失败，请重试。")}});
 return <div className="mt-8 space-y-10"><section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">邀请码</h2><button type="button" disabled={pending} className="round-button text-orange-brand" onClick={()=>run(async()=>setGenerated(await generateInvitation()))}>{pending?"处理中…":"生成邀请码"}</button></div><p className="text-sm text-zinc-500">每个邀请码有效 24 小时，有效期内不限注册人数。完整码仅生成时显示，请复制保存。以下时间为北京时间。</p>{generated&&<div className="space-y-3 rounded-xl border border-orange-brand/30 bg-white p-5"><div className="flex flex-wrap items-center gap-3"><code className="break-all text-lg">{generated.code}</code><button type="button" disabled={Date.parse(generated.expiresAt)<=now} className="round-button" onClick={async()=>{try{await navigator.clipboard.writeText(generated.code);setNotice("邀请码已复制")}catch{setError("复制失败，请选中邀请码手动复制。")}}}>复制</button></div><p className="text-xs text-zinc-500">生成：{time(generated.createdAt)}<br/>到期：{time(generated.expiresAt)}{Date.parse(generated.expiresAt)<=now&&"（已过期）"}</p></div>}<div className="divide-y divide-zinc-200">{invitations.filter(i=>Date.parse(i.expires_at)>now).map(i=><div key={i.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{i.code_hint}</span><span className="text-xs text-zinc-500">生成 {time(i.created_at)} · 到期 {time(i.expires_at)}</span></div>)}{!invitations.some(i=>Date.parse(i.expires_at)>now)&&<p className="py-4 text-sm text-zinc-500">暂无有效邀请码。</p>}</div></section>{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}{notice&&<p role="status" className="text-sm text-orange-brand">{notice}</p>}<section><h2 className="mb-4 text-lg font-semibold">团队成员</h2><div className="divide-y divide-zinc-200">{members.map(member=>{
 const lastAdmin=member.role==="admin"&&!member.is_disabled&&adminCount===1;
 return <div key={member.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
  <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{member.display_name}{member.id===currentUserId&&"（你）"}</p><p className="mt-1 break-all text-xs text-zinc-500">{member.email}</p>{member.is_disabled&&<p className="mt-2 text-xs text-zinc-500">待交接 Private Prompt：{member.pending_private_count} 条</p>}</div>
  <span className="text-sm text-zinc-500">{member.role==="admin"?"Admin":"Member"} · {member.is_disabled?"已停用":"正常"}</span>
  <div className="flex flex-wrap gap-2">{!member.is_disabled?<>
   <button type="button" disabled={pending||lastAdmin} title={lastAdmin?"至少保留一名正常状态的管理员":undefined} className="round-button disabled:opacity-40" onClick={()=>{const role=member.role==="admin"?"member":"admin";if(window.confirm("确定修改「"+member.display_name+"」的角色？"))run(async()=>{await changeMemberRole(member.id,role);setNotice("角色已更新")})}}>{member.role==="admin"?"设为普通成员":"设为管理员"}</button>
   <button type="button" disabled={pending||lastAdmin} className="round-button disabled:opacity-40" onClick={()=>{if(window.confirm("停用成员："+member.display_name+"。停用后该成员将无法继续访问火麦。团队素材和历史记录不会删除。Private Prompt 将保留，之后可由管理员交接。"))run(async()=>{await changeMemberStatus(member.id,true);setNotice("成员已停用。如需调整工作站使用人，请前往工作站编辑。")})}}>停用成员</button>
  </>:<>
   <button type="button" disabled={pending||Number(member.pending_private_count)===0} className="round-button disabled:opacity-40" onClick={()=>{setRecipient("");setError("");setHandover(member)}}>交接数据</button>
   <button type="button" disabled={pending} className="round-button" onClick={()=>run(async()=>{await changeMemberStatus(member.id,false);setNotice("成员已重新启用")})}>重新启用</button>
  </>}</div>
 </div>})}</div></section>
 {handover&&<Modal title={"交接数据："+handover.display_name} pending={pending} onClose={()=>setHandover(null)}><form className="space-y-5" onSubmit={event=>{event.preventDefault();if(!recipient||pending)return;run(async()=>{const count=await handoverPrivatePrompts(handover.id,recipient);setHandover(null);setNotice("已交接 "+count+" 条 Private Prompt")})}}>
  <p className="text-sm text-zinc-500">将该成员当前全部 Private Prompt 交给接收人。内容和标签保留，团队数据、收藏及工作站保持不变。</p>
  <label className="block text-sm">接收人<select required value={recipient} onChange={event=>setRecipient(event.target.value)} className="mt-2 w-full min-w-0 rounded-lg border border-zinc-200 bg-white p-3"><option value="">请选择正常状态的成员</option>{members.filter(m=>!m.is_disabled).map(m=><option key={m.id} value={m.id}>{m.display_name} · {m.email}</option>)}</select></label>
  {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
  <div className="flex justify-end gap-3"><button type="button" disabled={pending} className="round-button" onClick={()=>setHandover(null)}>取消</button><button disabled={pending||!recipient} className="round-button bg-orange-brand text-white disabled:opacity-40">{pending?"交接中…":"确认交接"}</button></div>
 </form></Modal>}
 </div>;
}
