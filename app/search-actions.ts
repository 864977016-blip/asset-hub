"use server";
import { searchAssets } from "@/lib/data";

export async function searchAll(query: string) {
  return searchAssets(query);
}
