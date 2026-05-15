create table if not exists canonical_records (
    id uuid primary key default gen_random_uuid(),
    record_kind text not null check (record_kind in ('listing', 'requirement')),
    deal_type text not null default 'unknown',
    asset_class text not null default 'unknown',
    property_category text not null default 'residential' check (property_category in ('residential', 'commercial')),
    canonical_title text,
    locality text,
    city text,
    building_name text,
    micro_location text,
    bhk text,
    area_sqft numeric,
    price_numeric numeric,
    price_label text,
    furnishing text check (furnishing in ('unfurnished', 'semi-furnished', 'fully-furnished')),
    floor_number text,
    total_floors text,
    property_use text,
    confidence_score numeric not null default 0,
    freshness_score numeric not null default 0,
    source_count integer not null default 1,
    unique_broker_count integer not null default 1,
    unique_group_count integer not null default 1,
    contradiction_count integer not null default 0,
    status text not null default 'active' check (status in ('active', 'stale', 'withdrawn', 'conflicted')),
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    best_stream_item_id uuid,
    semantic_fingerprint_text text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_canonical_records_kind_seen
    on canonical_records (record_kind, last_seen_at desc);

create index if not exists idx_canonical_records_location
    on canonical_records (locality, city, deal_type, asset_class);

create table if not exists canonical_record_evidence (
    id uuid primary key default gen_random_uuid(),
    canonical_record_id uuid not null references canonical_records(id) on delete cascade,
    stream_item_id uuid not null references stream_items(id) on delete cascade,
    tenant_id uuid not null references profiles(id) on delete cascade,
    source_phone text,
    source_group_id text,
    source_group_name text,
    evidence_weight numeric not null default 1,
    match_confidence numeric not null default 0,
    merge_decision text not null check (merge_decision in ('matched', 'possible_match', 'conflict', 'rejected')),
    field_agreement jsonb not null default '{}'::jsonb,
    field_conflicts jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    unique (canonical_record_id, stream_item_id)
);

create index if not exists idx_canonical_record_evidence_canonical
    on canonical_record_evidence (canonical_record_id, created_at desc);

create index if not exists idx_canonical_record_evidence_tenant
    on canonical_record_evidence (tenant_id, created_at desc);

create table if not exists source_reliability (
    id uuid primary key default gen_random_uuid(),
    source_phone text,
    source_label text,
    tenant_id uuid references profiles(id) on delete cascade,
    sample_count integer not null default 0,
    correction_count integer not null default 0,
    duplicate_count integer not null default 0,
    accepted_match_count integer not null default 0,
    rejected_match_count integer not null default 0,
    average_confidence numeric not null default 0,
    reliability_score numeric not null default 0.5,
    last_seen_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists idx_source_reliability_tenant_phone
    on source_reliability (tenant_id, source_phone);

alter table stream_items
    add column if not exists parser_version text,
    add column if not exists semantic_fingerprint_text text,
    add column if not exists novelty_score numeric,
    add column if not exists duplicate_cluster_hint text,
    add column if not exists canonical_record_id uuid references canonical_records(id) on delete set null,
    add column if not exists canonical_match_confidence numeric,
    add column if not exists canonical_decision text check (canonical_decision in ('new', 'matched', 'conflicted', 'rejected'));

create index if not exists idx_stream_items_canonical_record
    on stream_items (canonical_record_id, created_at desc);

create index if not exists idx_stream_items_semantic_fingerprint
    on stream_items (semantic_fingerprint_text);

alter table canonical_records enable row level security;
alter table canonical_record_evidence enable row level security;
alter table source_reliability enable row level security;

drop policy if exists canonical_records_select_authenticated on canonical_records;
create policy canonical_records_select_authenticated
    on canonical_records
    for select
    to authenticated
    using (true);

drop policy if exists canonical_record_evidence_select_owner on canonical_record_evidence;
create policy canonical_record_evidence_select_owner
    on canonical_record_evidence
    for select
    to authenticated
    using (tenant_id = auth.uid());

drop policy if exists source_reliability_select_owner on source_reliability;
create policy source_reliability_select_owner
    on source_reliability
    for select
    to authenticated
    using (tenant_id = auth.uid());
