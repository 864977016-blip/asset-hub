import type { Inspiration } from "@/lib/types";
import { AssetImage } from "@/components/asset-image";
export function InspirationCard({ item, onOpen }: { item: Inspiration; onOpen?: () => void }) {
  return <button type="button" onClick={onOpen} aria-label={`查看${item.title}详情`} className="asset-card group"><AssetImage src={item.image} alt={item.title} className="block h-auto w-full rounded-xl" /></button>;
}
