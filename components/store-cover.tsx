import type { Store } from "@/lib/types";

export function StoreCover({ store, className = "" }: { store: Store; className?: string }) {
  if (store.cover) return <img src={store.cover} alt="" className={`object-cover ${className}`} />;
  const initial = store.name.trim().slice(0, 1) || "店";
  return <div aria-label={`${store.name} 默认封面`} className={`relative grid overflow-hidden bg-[#1b1b1b] text-white ${className}`}><div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-orange-brand/25 blur-2xl"/><div className="absolute bottom-0 left-0 h-1 w-12 bg-orange-brand"/><span className="relative grid h-10 w-10 place-self-center rounded-full border border-white/15 bg-white/10 text-sm font-semibold">{initial}</span></div>;
}
