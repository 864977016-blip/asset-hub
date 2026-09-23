export type TagScope = "inspiration" | "store" | "prompt";
export type Tag = { id: string; name: string; group_name: string; color?: string | null };
export type Workstation = { id: number; current_user_name?: string | null };
export type StoreOption = { id: string; name: string; archivedAt?: string | null };
export type WorkstationOverview = Workstation & { count: number; previews: { id: string; image: string | null }[] };
export type AssetDetail = { createdBy?: string; id: string; image: string | null; tags: Tag[]; workstations: Workstation[]; createdAt: string; updatedAt?: string | null; note?: string | null; kind?: "store" | "shared"; assetCategory?: string; store?: StoreOption | null; stores?: StoreOption[] };
export type Inspiration = { createdBy?: string; id: string; title: string; source: string; sourceUrl?: string | null; sourceDomain?: string | null; tags: Tag[]; image: string; createdAt?: string; ratio: "tall" | "medium" | "short" };
export type Activity = { id: string; type: "inspiration" | "store_asset" | "shared_asset"; targetId: string; action: string; createdAt: string; title: string; location: string; image?: string | null; href: string; inspiration?: Inspiration; asset?: AssetDetail };
export type Store = { id: string; name: string; count: number; recent: string; cover: string | null; categories?: string[]; updatedAt?: string };
export type RecentAsset = { id: string; name: string; store: string; workstation: string; type: string; cover: string };
export type SidebarProfile = { id?: string; displayName: string; role: "admin" | "member" };
export type SearchResults = { inspirations: Inspiration[]; shared: AssetDetail[]; assets: AssetDetail[]; stores: StoreOption[]; tags: Tag[]; storeTags?: Tag[]; promptTags?: Tag[]; prompts?: Prompt[]; handbook?: HandbookProduct[] };

export type Prompt = { id: string; content: string; visibility: "team" | "private"; createdBy: string; updatedAt: string; tags: Tag[]; favorite: boolean };
export type HandbookImage = { id: string; image: string };
export type HandbookNote = { id: string; productId: string; content: string; updatedAt: string; images: HandbookImage[] };
export type HandbookProduct = { id: string; name: string; general: boolean; updatedAt: string; notes: HandbookNote[] };
