create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references auth.users(id),
  raw_text text,
  bhk text,
  property_type text,
  listing_type text,
  locality text,
  building_name text,
  price_cr numeric,
  rent_monthly numeric,
  flags text[],
  area_sqft numeric,
  floor text,
  possession text,
  broker_name text,
  broker_phone text,
  broker_agency text,
  source text default 'whatsapp_broadcast',
  created_at timestamptz default now()
);

alter table public.listings
  add column if not exists tenant_id uuid references auth.users(id),
  add column if not exists raw_text text,
  add column if not exists bhk text,
  add column if not exists property_type text,
  add column if not exists listing_type text,
  add column if not exists locality text,
  add column if not exists building_name text,
  add column if not exists price_cr numeric,
  add column if not exists rent_monthly numeric,
  add column if not exists flags text[],
  add column if not exists area_sqft numeric,
  add column if not exists floor text,
  add column if not exists possession text,
  add column if not exists broker_name text,
  add column if not exists broker_phone text,
  add column if not exists broker_agency text,
  add column if not exists source text default 'whatsapp_broadcast',
  add column if not exists created_at timestamptz default now();

create table if not exists requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references auth.users(id),
  raw_text text,
  bhk_preference text[],
  property_type text,
  listing_type text,
  preferred_localities text[],
  budget_min_cr numeric,
  budget_max_cr numeric,
  rent_budget_monthly numeric,
  urgency text,
  possession_timeline text,
  notes text,
  broker_name text,
  broker_phone text,
  broker_agency text,
  source text default 'whatsapp_broadcast',
  created_at timestamptz default now()
);

alter table public.requirements
  add column if not exists tenant_id uuid references auth.users(id),
  add column if not exists raw_text text,
  add column if not exists bhk_preference text[],
  add column if not exists property_type text,
  add column if not exists listing_type text,
  add column if not exists preferred_localities text[],
  add column if not exists budget_min_cr numeric,
  add column if not exists budget_max_cr numeric,
  add column if not exists rent_budget_monthly numeric,
  add column if not exists urgency text,
  add column if not exists possession_timeline text,
  add column if not exists notes text,
  add column if not exists broker_name text,
  add column if not exists broker_phone text,
  add column if not exists broker_agency text,
  add column if not exists source text default 'whatsapp_broadcast',
  add column if not exists created_at timestamptz default now();

create index if not exists idx_listings_tenant_locality on listings(tenant_id, locality);
create index if not exists idx_listings_tenant_building on listings(tenant_id, building_name);
create index if not exists idx_requirements_tenant on requirements(tenant_id);
