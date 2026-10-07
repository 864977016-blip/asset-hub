import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { env } from "node:process";
import { performance } from "node:perf_hooks";
import { ReadableStream } from "node:stream/web";
import { createClient } from "@/lib/supabase/server";
import { readObjectStream } from "@/lib/r2";

function mediaTimer(){
 const enabled=env.NODE_ENV==="development",requestId=enabled?randomUUID().slice(0,8):"",started=enabled?performance.now():0;let previous=started;const spans:{name:string;duration:number}[]=[];
 const mark=(name:string,label:string)=>{if(!enabled)return;const now=performance.now(),duration=now-previous;spans.push({name,duration});console.info(`[media:${requestId}] ${label}`,{stageMs:Math.round(duration),totalMs:Math.round(now-started)});previous=now};
 const finish=(response:NextResponse)=>{if(!enabled)return response;mark("response","9. NextResponse created");const total=performance.now()-started;response.headers.set("Server-Timing",[`request;desc=\"${requestId}\";dur=${total.toFixed(1)}`,...spans.map(span=>`${span.name};dur=${span.duration.toFixed(1)}`)].join(", "));console.info(`[media:${requestId}] Route Handler complete`,{totalMs:Math.round(total)});return response};
 const streamEnd=(status:string)=>{if(enabled)console.info(`[media:${requestId}] Stream ${status}`,{totalMs:Math.round(performance.now()-started)})};
 mark("enter","1. Route Handler entered");return{mark,finish,streamEnd};
}

function trackedStream(source:ReadableStream<Uint8Array>,done:(status:string)=>void){const reader=source.getReader();let finished=false;const finish=(status:string)=>{if(!finished){finished=true;done(status)}};return new ReadableStream<Uint8Array>({async pull(controller){try{const next=await reader.read();if(next.done){finish("complete");controller.close()}else controller.enqueue(next.value)}catch(error){finish("failed");controller.error(error)}},async cancel(reason){finish("cancelled");await reader.cancel(reason)}})}

export async function GET(_:Request,{params}:{params:Promise<{fileId:string}>}){
 const timer=mediaTimer(),s=await createClient();timer.mark("client","2. Supabase client initialized");
 const {data:{user}}=await s.auth.getUser();timer.mark("auth","3. auth.getUser complete");if(!user)return timer.finish(new NextResponse("Unauthorized",{status:401}));
 const status=await s.rpc("is_active_member");timer.mark("member","4. Active-member check complete");if(status.error||status.data!==true)return timer.finish(new NextResponse("Forbidden",{status:403}));
 const {fileId}=await params,{data:file}=await s.from("asset_files").select("storage_key,mime_type").eq("id",fileId).maybeSingle();timer.mark("file","5-6. asset_files RLS lookup complete");if(!file)return timer.finish(new NextResponse("Not found",{status:404}));
 try{
  const object=await readObjectStream(file.storage_key,()=>timer.mark("r2-get","7. R2 GetObject complete")),body=trackedStream(object.body,timer.streamEnd);
  return timer.finish(new NextResponse(body as unknown as BodyInit,{headers:{"Content-Type":object.contentType,"Cache-Control":"private, no-store"}}));
 }catch{return timer.finish(new NextResponse("Not found",{status:404}))}
}
