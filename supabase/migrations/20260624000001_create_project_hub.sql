-- Project Hub: Developer Distribution Network
-- Tables for B2B real estate project intelligence and distribution platform.

-- 1. Developer Projects — core project information
create table if not exists developer_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references profiles(id) on delete cascade,
  slug text not null,
  name text not null,
  developer_name text not null,
  description text,
  locality text not null,
  city text not null default 'Mumbai',
  latitude numeric(10,7),
  longitude numeric(10,7),
  status text not null default 'upcoming'
    check (status in ('upcoming', 'ongoing', 'ready-possession', 'completed')),
  possession_date date,
  rera_number text,
  configurations jsonb default '[]'::jsonb,
  total_towers int default 1,
  total_floors int,
  total_units int,
  amenities jsonb default '[]'::jsonb,
  gallery jsonb default '[]'::jsonb,
  floor_plans jsonb default '[]'::jsonb,
  logo_url text,
  cover_image_url text,
  is_verified boolean default false,
  is_published boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_projects_slug on developer_projects(slug);
create index if not exists idx_projects_tenant on developer_projects(tenant_id);
create index if not exists idx_projects_locality on developer_projects(locality);
create index if not exists idx_projects_developer on developer_projects(developer_name);
create index if not exists idx_projects_published on developer_projects(is_published) where is_published = true;

-- 2. Project Inventory — available units
create table if not exists project_inventory (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references developer_projects(id) on delete cascade,
  bhk text not null,
  unit_number text,
  floor int,
  total_floors int,
  carpet_area numeric(10,2),
  built_up_area numeric(10,2),
  price_numeric numeric(12,2) not null,
  furnishing text default 'Unfurnished'
    check (furnishing in ('Unfurnished', 'Semi Furnished', 'Full Furnished')),
  status text not null default 'available'
    check (status in ('available', 'sold', 'blocked')),
  listing_ref text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_inventory_project on project_inventory(project_id);
create index if not exists idx_project_inventory_bhk on project_inventory(project_id, bhk);

-- 3. Project Contacts — sales team directory
create table if not exists project_contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references developer_projects(id) on delete cascade,
  name text not null,
  role text not null,
  phone text,
  email text,
  whatsapp_phone text,
  is_primary boolean default false,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_contacts_project on project_contacts(project_id);

-- 4. Project Resources — brochures, sheets, plans
create table if not exists project_resources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references developer_projects(id) on delete cascade,
  title text not null,
  file_type text not null
    check (file_type in ('brochure', 'inventory_sheet', 'cost_sheet', 'floor_plan', 'payment_plan', 'presentation', 'other')),
  file_url text not null,
  file_size bigint,
  mime_type text,
  is_broker_only boolean default false,
  download_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_resources_project on project_resources(project_id);

-- 5. Project Updates — timeline events from developers
create table if not exists project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references developer_projects(id) on delete cascade,
  title text not null,
  description text,
  update_type text not null
    check (update_type in ('price_revision', 'new_tower', 'inventory_release', 'scheme', 'broker_incentive', 'possession', 'general')),
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_updates_project on project_updates(project_id);
create index if not exists idx_project_updates_created on project_updates(project_id, created_at desc);

-- 6. Project Broker Resources — CP-specific (access controlled)
create table if not exists project_broker_resources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references developer_projects(id) on delete cascade,
  title text not null,
  file_url text not null,
  file_size bigint,
  mime_type text,
  download_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_broker_resources_project on project_broker_resources(project_id);

-- RLS: all tables
alter table developer_projects enable row level security;
alter table project_inventory enable row level security;
alter table project_contacts enable row level security;
alter table project_resources enable row level security;
alter table project_updates enable row level security;
alter table project_broker_resources enable row level security;

-- RLS policies: authenticated users can read published projects
create policy "Anyone can read published projects"
  on developer_projects for select
  using (is_published = true);

-- Tenant (creator) can read/write their own projects
create policy "Tenant can read own projects"
  on developer_projects for select
  using (tenant_id = auth.uid());

create policy "Tenant can insert own projects"
  on developer_projects for insert
  with check (tenant_id = auth.uid());

create policy "Tenant can update own projects"
  on developer_projects for update
  using (tenant_id = auth.uid());

-- Inventory visible to all authenticated users for published projects
create policy "Authenticated users can view inventory"
  on project_inventory for select
  using (
    exists (
      select 1 from developer_projects
      where id = project_id and is_published = true
    )
  );

-- Contacts visible to all authenticated users for published projects
create policy "Authenticated users can view contacts"
  on project_contacts for select
  using (
    exists (
      select 1 from developer_projects
      where id = project_id and is_published = true
    )
  );

-- Resources visible to all authenticated users for published projects
create policy "Authenticated users can view resources"
  on project_resources for select
  using (
    exists (
      select 1 from developer_projects
      where id = project_id and is_published = true
    )
  );

-- Updates visible to all authenticated users for published projects
create policy "Authenticated users can view updates"
  on project_updates for select
  using (
    exists (
      select 1 from developer_projects
      where id = project_id and is_published = true
    )
  );

-- Broker resources visible to all authenticated users for published projects
create policy "Authenticated users can view broker resources"
  on project_broker_resources for select
  using (
    exists (
      select 1 from developer_projects
      where id = project_id and is_published = true
    )
  );

-- Updated_at trigger
create extension if not exists moddatetime schema extensions;

create trigger handle_developer_projects_updated_at
  before update on developer_projects
  for each row
  execute function moddatetime(updated_at);

create trigger handle_project_inventory_updated_at
  before update on project_inventory
  for each row
  execute function moddatetime(updated_at);
