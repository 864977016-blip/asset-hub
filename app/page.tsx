import { AppShell } from "@/components/app-shell";
import { HomeContent } from "@/components/home-content";
import { getHomeData } from "@/lib/data";
export default async function HomePage() {
  const data = await getHomeData();
  return <AppShell homeUploads={{ stores: data.stores, tags: data.tags, workstations: data.workstations }}><HomeContent {...data} /></AppShell>;
}
