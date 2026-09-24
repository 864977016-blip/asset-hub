"use server";
import { searchAssets } from "@/lib/data";
import { session } from "@/lib/action-utils";

export async function searchAll(query: string) {
  await session();
  return searchAssets(query);
}
