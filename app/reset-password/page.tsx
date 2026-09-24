import {AuthShell} from "@/components/auth-shell";
import {ResetPasswordForm} from "./password-form";
import {createClient} from "@/lib/supabase/server";
export default async function Page({searchParams}:{searchParams:Promise<{error?:string}>}){
 const params=await searchParams;let valid=false;
 if(!params.error){try{const {data,error}=await (await createClient()).auth.getUser();valid=!error&&!!data.user}catch{}}
 return <AuthShell title="设置新密码" description="请输入新密码，完成账号恢复。"><ResetPasswordForm valid={valid}/></AuthShell>;
}
