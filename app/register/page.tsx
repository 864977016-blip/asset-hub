import {AuthShell} from "@/components/auth-shell";
import {RegisterForm} from "./register-form";
import {createClient} from "@/lib/supabase/server";
export default async function Page({searchParams}:{searchParams:Promise<{error?:string}>}){
 const params=await searchParams;
 let ready=false;try{const {data,error}=await (await createClient()).rpc("v2_registration_ready");ready=!error&&data===true}catch{}
 return <AuthShell title="注册账号" description="使用管理员提供的邀请码加入团队。">{ready?<RegisterForm confirmationError={!!params.error}/>:<p className="mt-8 text-sm text-zinc-500">邀请码注册尚未启用，请联系管理员。</p>}</AuthShell>;
}
