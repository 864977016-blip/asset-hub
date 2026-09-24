import {redirect} from "next/navigation";
import {session} from "@/lib/action-utils";
import {AppShell} from "@/components/app-shell";
import {MemberManagement} from "@/components/member-management";
export default async function Page(){
 const {s,isAdmin,user}=await session();if(!isAdmin)redirect("/");
 const [members,invitations]=await Promise.all([s.rpc("v3_list_members"),s.from("team_invitations").select("id,code_hint,created_at,expires_at").order("created_at",{ascending:false})]);
 return <AppShell active="成员管理"><h1 className="text-3xl font-bold">成员管理</h1>{members.error||invitations.error?<p className="mt-8 text-sm text-zinc-500">成员管理暂不可用，请确认账号 migration 已执行并刷新页面。</p>:<MemberManagement members={members.data||[]} invitations={invitations.data||[]} currentUserId={user.id}/>}</AppShell>;
}
