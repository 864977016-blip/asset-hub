import { AppShell } from "@/components/app-shell";
import { WorkstationCards } from "@/components/workstation-cards";
import { getWorkstationOverview, canEditWorkstations } from "@/lib/data";
export default async function WorkstationsPage() {
  const [workstations, canEdit] = await Promise.all([getWorkstationOverview(), canEditWorkstations()]);
  return <AppShell active="工作站"><h1 className="text-4xl font-bold">工作站</h1><p className="mt-2 text-zinc-500">源文件位置索引，查看每台电脑的使用人与关联素材。</p><WorkstationCards workstations={workstations} canEdit={canEdit} /></AppShell>;
}
