"use client";
import {useState} from "react";
import {createClient} from "@/lib/supabase/client";
export function SignOutButton(){
 const [pending,setPending]=useState(false),[error,setError]=useState("");
 return <div className="mt-2"><button type="button" disabled={pending} className="text-xs text-zinc-400 hover:text-white disabled:opacity-50" onClick={async()=>{
  if(pending)return;setPending(true);setError("");
  try{const {error}=await createClient().auth.signOut();if(error)throw error;location.replace("/login")}
  catch{setError("退出失败，请重试。");setPending(false)}
 }}>{pending?"退出中…":"退出登录"}</button>{error&&<p role="alert" className="mt-1 text-xs text-red-400">{error}</p>}</div>;
}
