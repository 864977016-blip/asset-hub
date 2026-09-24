import {NextResponse,type NextRequest} from "next/server";
import {createClient} from "@/lib/supabase/server";
export async function GET(request:NextRequest){
 const code=request.nextUrl.searchParams.get("code");let valid=false;
 if(code&&!request.nextUrl.searchParams.has("error")){
  try{const {error}=await (await createClient()).auth.exchangeCodeForSession(code);valid=!error}catch{}
 }
 return new NextResponse(null,{status:303,headers:{Location:valid?"/":"/register?error=confirmation","Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
}
