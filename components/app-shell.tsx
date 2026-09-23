import { HomeAddButton, HomeUploadProvider, type HomeUploadOptions } from "./home-upload";
import { SearchBar } from "./search-bar";
import { SidebarNav } from "./sidebar-nav";
import { getV1Ready, getSidebarData, getActiveStoreOptions, getTags, getWorkstations } from "@/lib/data";
import { TeamProvider } from "./team-context";
import { ToastProvider } from "./toast";
import { ShellFrame } from "./shell-frame";

export async function AppShell({ children, active = "首页", activeStoreId, homeUploads }: { children: React.ReactNode; active?: string; activeStoreId?: string; homeUploads?: HomeUploadOptions }) {
  const [sidebar, options, storeTags, promptTags, ready] = await Promise.all([
    getSidebarData(true),
    homeUploads ? Promise.resolve(homeUploads) : Promise.all([getActiveStoreOptions(), getTags(), getWorkstations()]).then(([stores, tags, workstations]) => ({ stores, tags, workstations })),
    getTags("store"), getTags("prompt"), getV1Ready(),
  ]);
  return <ToastProvider><TeamProvider ready={ready} profile={sidebar.profile} tags={options.tags} storeTags={storeTags} promptTags={promptTags}><HomeUploadProvider {...options} storeTags={storeTags} captureImages={active === "首页"}>
    <ShellFrame sidebar={<SidebarNav active={active} activeStoreId={activeStoreId} profile={sidebar.profile} stores={sidebar.stores} />} header={<><SearchBar {...options} />{active !== "创作手册" && <div className="shrink-0"><HomeAddButton /></div>}</>}>
      {children}
    </ShellFrame>
  </HomeUploadProvider></TeamProvider></ToastProvider>;
}
