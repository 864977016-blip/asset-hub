export const homeCategoryLabels: Record<string, string> = { main: "主图", scene: "副图", a_plus: "A+", other: "其他" };
export function storeMonogram(name?: string | null) {
  const text = typeof name === "string" ? name : "";
  return (text.match(/[a-zA-Z]/g) || []).slice(0, 2).join("").toUpperCase() || text.trim().slice(0, 2) || "店";
}
export function homeDate(value?: string | null) {
  return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeZone: "Asia/Shanghai" }).format(new Date(value)) : "未记录";
}
export function relativeTime(value: string | null | undefined, now: number) {
  if (!value || !Number.isFinite(Date.parse(value))) return "未记录";
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60000));
  return minutes < 1 ? "刚刚" : minutes < 60 ? `${minutes}分钟前` : minutes < 1440 ? `${Math.floor(minutes / 60)}小时前` : `${Math.floor(minutes / 1440)}天前`;
}
