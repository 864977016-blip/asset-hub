import { AppShell } from "@/components/app-shell";
import { ProductionPeopleList } from "@/components/production-people-list";
import { getProductionPeople, canEditWorkstations } from "@/lib/data";
export default async function WorkstationsPage() {
  const [people, canEdit] = await Promise.all([getProductionPeople(), canEditWorkstations()]);
  return <AppShell active="制作人员"><ProductionPeopleList people={people} canEdit={canEdit} /></AppShell>;
}
