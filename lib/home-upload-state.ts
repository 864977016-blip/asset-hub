export type HomeUploadState = { step: "closed" | "target" | "store-picker" | "inspiration" | "shared" | "store"; file: File | null; sourceUrl: string; storeId: string | null };
export type HomeUploadEvent = { type: "open"; file?: File; sourceUrl?: string } | { type: "target"; target: "inspiration" | "shared" | "store" } | { type: "store"; id: string } | { type: "back" } | { type: "close" };
export const emptyHomeUpload: HomeUploadState = { step: "closed", file: null, sourceUrl: "", storeId: null };
export function homeUploadReducer(state: HomeUploadState, event: HomeUploadEvent): HomeUploadState {
  switch (event.type) {
    case "open": return { step: "target", file: event.file ?? null, sourceUrl: event.sourceUrl ?? "", storeId: null };
    case "target": return { ...state, step: event.target === "store" ? "store-picker" : event.target, storeId: null };
    case "store": return { ...state, step: "store", storeId: event.id };
    case "back": return { ...state, step: "target", storeId: null };
    case "close": return emptyHomeUpload;
  }
}
