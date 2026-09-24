import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {isPublicAuthPath} from "@/lib/auth-flow";
export async function middleware(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => { items.forEach(({ name, value, options }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); } } });
  const { data: claims } = await supabase.auth.getClaims();
  const status = claims ? await supabase.rpc("is_active_member") : null;
  const active = !!claims && !status?.error && status?.data === true;
  if (!claims && !isPublicAuthPath(request.nextUrl.pathname)) { const url = request.nextUrl.clone(); url.pathname = "/login"; return NextResponse.redirect(url); }
  if (claims && !active && !isPublicAuthPath(request.nextUrl.pathname)) { const url = request.nextUrl.clone(); url.pathname = "/login"; url.search = "?error=account-unavailable"; return NextResponse.redirect(url); }
  if (active && request.nextUrl.pathname === "/login") { const url = request.nextUrl.clone(); url.pathname = "/"; url.search = ""; return NextResponse.redirect(url); }
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
