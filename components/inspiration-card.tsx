import type { Inspiration } from "@/lib/types";
import { AssetImage } from "@/components/asset-image";
export function InspirationCard({ item, onOpen }: { item: Inspiration; onOpen?: () => void }) {
  return <button type="button" onClick={onOpen} aria-label={`查看${item.title}详情`} className="block w-full cursor-pointer overflow-hidden rounded-xl border border-zinc-200/70 bg-white text-left shadow-card transition hover:border-orange-brand/40 hover:shadow-float focus-visible:outline-orange-brand"><AssetImage src={item.image} alt={item.title} className="block h-auto w-full" /></button>;
}
