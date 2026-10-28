-- GrinFlow tenant isolation baseline for Supabase/PostgreSQL.
-- REVIEW BEFORE APPLYING. Requires Supabase auth.uid(); do not run on plain Postgres unchanged.
-- This migration enables RLS but intentionally keeps organization creation, audit writes,
-- operation event writes, and cross-organization matching behind trusted server actions.

create or replace function public.is_active_org_member(p_org_id uuid)
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_org_id
      and m.auth_user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_active_org_role(p_org_id uuid, p_roles public.member_role[])
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_org_id
      and m.auth_user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(p_roles)
  );
$$;

revoke all on function public.is_active_org_member(uuid) from public;
revoke all on function public.has_active_org_role(uuid, public.member_role[]) from public;
grant execute on function public.is_active_org_member(uuid) to authenticated;
grant execute on function public.has_active_org_role(uuid, public.member_role[]) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.sites enable row level security;
alter table public.organization_consents enable row level security;
alter table public.supply_offers enable row level security;
alter table public.recipient_capacities enable row level security;
alter table public.transport_assets enable row level security;
alter table public.transport_availability enable row level security;
alter table public.rescue_operations enable row level security;
alter table public.match_proposals enable row level security;
alter table public.operation_events enable row level security;
alter table public.audit_events enable row level security;

-- Organizations: members can read; membership/creation is managed server-side.
create policy org_select_member on public.organizations for select to authenticated
using (public.is_active_org_member(id));
create policy org_update_admin on public.organizations for update to authenticated
using (public.has_active_org_role(id, array['owner','admin']::public.member_role[]))
with check (public.has_active_org_role(id, array['owner','admin']::public.member_role[]));

-- Memberships: users see their own memberships; admins can administer their organization.
create policy membership_select_self_or_admin on public.organization_memberships for select to authenticated
using (auth_user_id = auth.uid() or public.has_active_org_role(organization_id, array['owner','admin']::public.member_role[]));
create policy membership_insert_admin on public.organization_memberships for insert to authenticated
with check (public.has_active_org_role(organization_id, array['owner','admin']::public.member_role[]));
create policy membership_update_admin on public.organization_memberships for update to authenticated
using (public.has_active_org_role(organization_id, array['owner','admin']::public.member_role[]))
with check (public.has_active_org_role(organization_id, array['owner','admin']::public.member_role[]));

-- Direct tenant-owned tables.
create policy sites_select_member on public.sites for select to authenticated using (public.is_active_org_member(organization_id));
create policy sites_insert_ops on public.sites for insert to authenticated with check (public.has_active_org_role(organization_id, array['owner','admin','coordinator']::public.member_role[]));
create policy sites_update_ops on public.sites for update to authenticated using (public.has_active_org_role(organization_id, array['owner','admin','coordinator']::public.member_role[])) with check (public.has_active_org_role(organization_id, array['owner','admin','coordinator']::public.member_role[]));
create policy sites_delete_admin on public.sites for delete to authenticated using (public.has_active_org_role(organization_id, array['owner','admin']::public.member_role[]));

create policy consents_select_member on public.organization_consents for select to authenticated using (public.is_active_org_member(organization_id));
create policy consents_insert_admin on public.organization_consents for insert to authenticated with check (public.has_active_org_role(organization_id, array['owner','admin']::public.member_role[]));
create policy consents_update_admin on public.organization_consents for update to authenticated using (public.has_active_org_role(organization_id, array['owner','admin']::public.member_role[])) with check (public.has_active_org_role(organization_id, array['owner','admin']::public.member_role[]));

create policy offers_select_member on public.supply_offers for select to authenticated using (public.is_active_org_member(organization_id));
create policy offers_insert_ops on public.supply_offers for insert to authenticated with check (public.has_active_org_role(organization_id, array['owner','admin','coordinator','reviewer']::public.member_role[]));
create policy offers_update_ops on public.supply_offers for update to authenticated using (public.has_active_org_role(organization_id, array['owner','admin','coordinator','reviewer']::public.member_role[])) with check (public.has_active_org_role(organization_id, array['owner','admin','coordinator','reviewer']::public.member_role[]));
create policy offers_delete_admin on public.supply_offers for delete to authenticated using (public.has_active_org_role(organization_id, array['owner','admin']::public.member_role[]));

create policy capacities_select_member on public.recipient_capacities for select to authenticated using (public.is_active_org_member(organization_id));
create policy capacities_insert_ops on public.recipient_capacities for insert to authenticated with check (public.has_active_org_role(organization_id, array['owner','admin','coordinator','reviewer']::public.member_role[]));
create policy capacities_update_ops on public.recipient_capacities for update to authenticated using (public.has_active_org_role(organization_id, array['owner','admin','coordinator','reviewer']::public.member_role[])) with check (public.has_active_org_role(organization_id, array['owner','admin','coordinator','reviewer']::public.member_role[]));

create policy assets_select_member on public.transport_assets for select to authenticated using (public.is_active_org_member(organization_id));
create policy assets_insert_ops on public.transport_assets for insert to authenticated with check (public.has_active_org_role(organization_id, array['owner','admin','coordinator']::public.member_role[]));
create policy assets_update_ops on public.transport_assets for update to authenticated using (public.has_active_org_role(organization_id, array['owner','admin','coordinator','driver']::public.member_role[])) with check (public.has_active_org_role(organization_id, array['owner','admin','coordinator','driver']::public.member_role[]));

-- Indirectly tenant-owned tables: organization is derived through the parent row.
create policy availability_select_member on public.transport_availability for select to authenticated
using (exists (select 1 from public.transport_assets a where a.id = asset_id and public.is_active_org_member(a.organization_id)));
create policy availability_insert_ops on public.transport_availability for insert to authenticated
with check (exists (select 1 from public.transport_assets a where a.id = asset_id and public.has_active_org_role(a.organization_id, array['owner','admin','coordinator','driver']::public.member_role[])));
create policy availability_update_ops on public.transport_availability for update to authenticated
using (exists (select 1 from public.transport_assets a where a.id = asset_id and public.has_active_org_role(a.organization_id, array['owner','admin','coordinator','driver']::public.member_role[])))
with check (exists (select 1 from public.transport_assets a where a.id = asset_id and public.has_active_org_role(a.organization_id, array['owner','admin','coordinator','driver']::public.member_role[])));

create policy operations_select_member on public.rescue_operations for select to authenticated using (public.is_active_org_member(owner_organization_id));
create policy operations_insert_ops on public.rescue_operations for insert to authenticated with check (public.has_active_org_role(owner_organization_id, array['owner','admin','coordinator']::public.member_role[]));
create policy operations_update_ops on public.rescue_operations for update to authenticated using (public.has_active_org_role(owner_organization_id, array['owner','admin','coordinator']::public.member_role[])) with check (public.has_active_org_role(owner_organization_id, array['owner','admin','coordinator']::public.member_role[]));

create policy proposals_select_operation_member on public.match_proposals for select to authenticated
using (exists (select 1 from public.rescue_operations o where o.id = operation_id and public.is_active_org_member(o.owner_organization_id)));
create policy proposals_insert_ops on public.match_proposals for insert to authenticated
with check (exists (select 1 from public.rescue_operations o where o.id = operation_id and public.has_active_org_role(o.owner_organization_id, array['owner','admin','coordinator']::public.member_role[])));
create policy proposals_update_ops on public.match_proposals for update to authenticated
using (exists (select 1 from public.rescue_operations o where o.id = operation_id and public.has_active_org_role(o.owner_organization_id, array['owner','admin','coordinator','reviewer']::public.member_role[])))
with check (exists (select 1 from public.rescue_operations o where o.id = operation_id and public.has_active_org_role(o.owner_organization_id, array['owner','admin','coordinator','reviewer']::public.member_role[])));

-- Event/audit logs are append-only via trusted server actions. Clients may read only their own tenant.
create policy operation_events_select_member on public.operation_events for select to authenticated
using (exists (select 1 from public.rescue_operations o where o.id = operation_id and public.is_active_org_member(o.owner_organization_id)));
create policy audit_select_admin on public.audit_events for select to authenticated
using (public.has_active_org_role(organization_id, array['owner','admin']::public.member_role[]));
revoke insert, update, delete on public.operation_events from anon, authenticated;
revoke insert, update, delete on public.audit_events from anon, authenticated;

-- Important: no policy grants cross-organization matching or broad anonymous access.
-- Test with at least two tenants and each role before production deployment.
