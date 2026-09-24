import {NextResponse,type NextRequest} from "next/server";
import {createClient} from "@/lib/supabase/server";
export async function GET(request:NextRequest){
 const code=request.nextUrl.searchParams.get("code");let valid=false;
 if(code&&!request.nextUrl.searchParams.has("error")){
  try{const supabase=await createClient();const {error}=await supabase.auth.exchangeCodeForSession(code);valid=!error}catch{ /* Never log reset tokens or provider responses. */ }
 }
 // Fixed relative destinations prevent open redirects and proxy-host mismatches.
 return new NextResponse(null,{status:303,headers:{Location:valid?"/reset-password":"/reset-password?error=invalid","Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
}
