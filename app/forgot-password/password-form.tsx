"use client";
import Link from "next/link";
import {useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {authError,emailError,recoveryUrl} from "@/lib/auth-flow";
export function ForgotPasswordForm(){
 const [pending,setPending]=useState(false),[error,setError]=useState(""),[sent,setSent]=useState(false);
 return <><form noValidate className="mt-8 space-y-4" onSubmit={async event=>{event.preventDefault();if(pending||sent)return;const email=String(new FormData(event.currentTarget).get("email")||"").trim(),invalid=emailError(email);setError(invalid);if(invalid)return;setPending(true);try{const {error}=await createClient().auth.resetPasswordForEmail(email,{redirectTo:recoveryUrl(window.location.origin)});if(error)throw error;setSent(true)}catch(e){setError(authError(e,"邮件发送失败，请稍后重试或联系管理员。"))}finally{setPending(false)}}}><label className="block text-sm">账号邮箱<input name="email" type="email" autoComplete="email" required disabled={pending||sent} className="mt-2 w-full rounded-xl border px-4 py-3"/></label>{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}{sent?<p role="status" className="text-sm leading-6 text-zinc-600">如果该邮箱对应已开通账号，你将收到重置邮件。请检查收件箱和垃圾邮件，并在当前浏览器打开邮件链接。</p>:<button disabled={pending} className="w-full rounded-full bg-orange-brand py-3 text-white disabled:opacity-60">{pending?"发送中…":"发送重置邮件"}</button>}</form><Link href="/login" className="mt-6 inline-block text-sm text-orange-brand">返回登录</Link></>;
}
