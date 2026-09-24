import { NextResponse } from "next/server";
import { readObject } from "@/lib/r2";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const status = await supabase.rpc("is_active_member");
  if (status.error || status.data !== true) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  const { data: inspiration } = await supabase.from("inspirations").select("image_key").eq("id", id).maybeSingle();
  if (!inspiration) return new NextResponse("Not found", { status: 404 });
  try {
    const object = await readObject(inspiration.image_key);
    return new NextResponse(object.bytes.buffer as ArrayBuffer, { headers: { "Content-Type": object.contentType, "Cache-Control": "private, no-store" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
