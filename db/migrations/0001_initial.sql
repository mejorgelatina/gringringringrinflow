-- GrinFlow initial relational schema (PostgreSQL / Supabase-compatible).
-- DESIGN ARTIFACT ONLY: not applied to any database in this release.
-- Before production: add reviewed RLS policies, auth mapping, retention policy,
-- migration runner, backup/restore plan, and security review.

create extension if not exists pgcrypto;

do $$ begin
  create type public.member_role as enum ('owner','admin','coordinator','reviewer','viewer','driver');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.food_condition as enum ('unknown','edible','past_prime','inedible');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.operation_status as enum ('draft','needs_review','ready_to_match','proposed','approved','assigned','picked_up','delivered','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.proposal_status as enum ('candidate','blocked','proposed','accepted','rejected','expired');
exception when duplicate_object then null; end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 180),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  organization_type text not null check (organization_type in ('donor','recipient','carrier','network_operator','mixed')),
  timezone text not null default 'America/Mexico_City',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  auth_user_id uuid not null,
  role public.member_role not null default 'viewer',
  status text not null default 'active' check (status in ('invited','active','suspended','removed')),
  created_at timestamptz not null default now(),
  unique (organization_id, auth_user_id)
);
create index if not exists memberships_user_idx on public.organization_memberships(auth_user_id, status);

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  site_type text not null check (site_type in ('donor','recipient','warehouse','hub','carrier_base','other')),
  address_text text,
  neighborhood text,
  city text not null default 'Ciudad de México',
  country_code char(2) not null default 'MX',
  latitude numeric(9,6),
  longitude numeric(9,6),
  location_verified_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180))
);
create index if not exists sites_org_type_idx on public.sites(organization_id, site_type, is_active);

create table if not exists public.organization_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  consent_scope text not null check (consent_scope in ('data_processing','share_offer','share_location','share_contact','dispatch','impact_reporting')),
  status text not null check (status in ('granted','withdrawn','expired','pending')),
  granted_by uuid,
  evidence_reference text,
  granted_at timestamptz,
  expires_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'granted' or granted_at is not null)
);
create index if not exists consent_org_scope_idx on public.organization_consents(organization_id, consent_scope, status);

create table if not exists public.supply_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  source_site_id uuid references public.sites(id) on delete restrict,
  external_reference text,
  item_name text not null check (length(trim(item_name)) between 1 and 200),
  category text not null check (category in ('panificados','verduras','frutas','lacteos','abarrotes','proteina','organico','otro')),
  quantity numeric(12,3) check (quantity is null or quantity > 0),
  unit text not null check (unit in ('kg','g','caja','pieza','tarima','bolsa','litro','unidad','otro')),
  quantity_basis text not null default 'unknown' check (quantity_basis in ('stated','estimated','confirmed','unknown')),
  condition public.food_condition not null default 'unknown',
  condition_verified_by uuid,
  condition_verified_at timestamptz,
  pickup_location_text text,
  pickup_location_verified_at timestamptz,
  available_from timestamptz,
  pickup_deadline timestamptz,
  source_channel text not null default 'manual' check (source_channel in ('manual','web','email','whatsapp','api','import','other')),
  source_message text,
  extraction_payload jsonb not null default '{}'::jsonb,
  extraction_model text,
  extraction_confidence numeric(5,4) check (extraction_confidence is null or extraction_confidence between 0 and 1),
  status text not null default 'draft' check (status in ('draft','needs_review','ready','matched','closed','cancelled')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  check (pickup_deadline is null or available_from is null or pickup_deadline >= available_from)
);
create index if not exists supply_offers_org_status_idx on public.supply_offers(organization_id, status, created_at desc);
create index if not exists supply_offers_deadline_idx on public.supply_offers(pickup_deadline) where status not in ('closed','cancelled');

create table if not exists public.recipient_capacities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  site_id uuid not null references public.sites(id) on delete restrict,
  category text not null check (category in ('panificados','verduras','frutas','lacteos','abarrotes','proteina','organico','otro')),
  capacity numeric(12,3) not null check (capacity >= 0),
  unit text not null,
  available_from timestamptz not null,
  available_until timestamptz not null,
  intended_use text not null check (intended_use in ('human_consumption','animal_feed','compost','valorization','other')),
  condition_policy jsonb not null default '["edible"]'::jsonb,
  verified_by uuid,
  verified_at timestamptz,
  status text not null default 'unconfirmed' check (status in ('unconfirmed','confirmed','full','expired','withdrawn')),
  created_at timestamptz not null default now(),
  check (available_until > available_from)
);
create index if not exists recipient_capacity_window_idx on public.recipient_capacities(organization_id, category, status, available_from, available_until);

create table if not exists public.transport_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  base_site_id uuid references public.sites(id) on delete restrict,
  display_name text not null,
  capacity numeric(12,3) not null check (capacity > 0),
  unit text not null,
  vehicle_type text,
  temperature_control text not null default 'unknown' check (temperature_control in ('none','ambient','refrigerated','frozen','unknown')),
  status text not null default 'unconfirmed' check (status in ('unconfirmed','available','busy','offline','retired')),
  operator_membership_id uuid references public.organization_memberships(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists transport_assets_status_idx on public.transport_assets(organization_id, status);

create table if not exists public.transport_availability (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.transport_assets(id) on delete restrict,
  available_from timestamptz not null,
  available_until timestamptz not null,
  start_site_id uuid references public.sites(id) on delete restrict,
  end_site_id uuid references public.sites(id) on delete restrict,
  status text not null default 'unconfirmed' check (status in ('unconfirmed','confirmed','reserved','in_progress','completed','cancelled','expired')),
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  check (available_until > available_from)
);
create index if not exists transport_availability_window_idx on public.transport_availability(asset_id, status, available_from, available_until);

create table if not exists public.rescue_operations (
  id uuid primary key default gen_random_uuid(),
  operation_code text not null unique,
  owner_organization_id uuid not null references public.organizations(id) on delete restrict,
  supply_offer_id uuid not null references public.supply_offers(id) on delete restrict,
  recipient_capacity_id uuid references public.recipient_capacities(id) on delete restrict,
  transport_availability_id uuid references public.transport_availability(id) on delete restrict,
  status public.operation_status not null default 'draft',
  proposed_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  route_provider text,
  route_distance_m numeric(12,2),
  route_duration_s integer,
  route_verified_at timestamptz,
  idempotency_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  check (route_distance_m is null or route_distance_m >= 0),
  check (route_duration_s is null or route_duration_s >= 0),
  check (status <> 'delivered' or delivered_at is not null),
  check (status <> 'cancelled' or cancelled_at is not null)
);
create index if not exists rescue_ops_org_status_idx on public.rescue_operations(owner_organization_id, status, created_at desc);
create unique index if not exists rescue_ops_idempotency_idx on public.rescue_operations(owner_organization_id, idempotency_key) where idempotency_key is not null;

create table if not exists public.match_proposals (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.rescue_operations(id) on delete restrict,
  recipient_capacity_id uuid references public.recipient_capacities(id) on delete restrict,
  transport_availability_id uuid references public.transport_availability(id) on delete restrict,
  status public.proposal_status not null default 'candidate',
  feasibility_result jsonb not null default '{}'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  route_estimate jsonb not null default '{}'::jsonb,
  score numeric(8,5),
  scoring_version text,
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text
);
create index if not exists match_proposals_operation_idx on public.match_proposals(operation_id, generated_at desc);

create table if not exists public.operation_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.rescue_operations(id) on delete restrict,
  event_type text not null,
  previous_status public.operation_status,
  next_status public.operation_status,
  actor_user_id uuid,
  actor_role public.member_role,
  source text not null default 'application' check (source in ('application','model','integration','system','import')),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text,
  occurred_at timestamptz not null default now(),
  unique (operation_id, idempotency_key)
);
create index if not exists operation_events_timeline_idx on public.operation_events(operation_id, occurred_at desc);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid,
  action text not null,
  resource_type text not null,
  resource_id text not null,
  request_id text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists audit_org_timeline_idx on public.audit_events(organization_id, occurred_at desc);
create index if not exists audit_resource_idx on public.audit_events(resource_type, resource_id, occurred_at desc);

-- Security note: deny client access until reviewed RLS policies and server-side
-- service access are implemented. Do not enable broad anon/authenticated access.
