-- Existing role guard checks current_user against postgres. SECURITY DEFINER
-- makes that check see the function owner instead of the authenticated caller.
-- Preserve the existing guard, trigger, policies and data; fix its execution role.
begin;
alter function public.prevent_role_escalation() security invoker;
commit;
