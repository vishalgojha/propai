-- Commercial inventory needs a first-class schema even when parsers do not
-- yet populate every field. Keep parsed_payload for unusual facts, but make
-- standard brokerage filters, verification, and matching queryable columns.

alter table public.stream_items_commercial
    add column if not exists sub_type text,
    add column if not exists transaction_mode text,
    add column if not exists building_grade text,
    add column if not exists building_class text,
    add column if not exists business_park_name text,
    add column if not exists unit_number text,
    add column if not exists wing text,
    add column if not exists zone_name text,
    add column if not exists permitted_uses text[],

    add column if not exists carpet_area_sqft numeric,
    add column if not exists builtup_area_sqft numeric,
    add column if not exists chargeable_area_sqft numeric,
    add column if not exists usable_area_sqft numeric,
    add column if not exists mezzanine_area_sqft numeric,
    add column if not exists terrace_area_sqft numeric,
    add column if not exists plot_area_sqft numeric,
    add column if not exists floor_plate_sqft numeric,
    add column if not exists frontage_ft numeric,
    add column if not exists ceiling_height_ft numeric,
    add column if not exists clear_height_ft numeric,
    add column if not exists floor_load_kg_per_sqft numeric,

    add column if not exists monthly_rent numeric,
    add column if not exists monthly_maintenance numeric,
    add column if not exists cam_per_sqft numeric,
    add column if not exists security_deposit numeric,
    add column if not exists sale_price numeric,
    add column if not exists price_per_sqft numeric,
    add column if not exists fitout_cost numeric,
    add column if not exists parking_charge numeric,
    add column if not exists gst_applicable boolean,
    add column if not exists gst_rate numeric,
    add column if not exists brokerage_terms text,
    add column if not exists lease_term_months integer,
    add column if not exists lock_in_months integer,
    add column if not exists notice_period_days integer,
    add column if not exists rent_escalation_percent numeric,
    add column if not exists rent_escalation_frequency_months integer,

    add column if not exists availability_status text,
    add column if not exists availability_verified_at timestamptz,
    add column if not exists availability_verified_via text,
    add column if not exists available_from date,
    add column if not exists possession_date date,
    add column if not exists possession_status text,
    add column if not exists exclusive_listing boolean,
    add column if not exists direct_owner boolean,

    add column if not exists plug_and_play boolean,
    add column if not exists furnished_workstations_count integer,
    add column if not exists meeting_rooms_count integer,
    add column if not exists conference_rooms_count integer,
    add column if not exists reception_count integer,
    add column if not exists pantry_type text,
    add column if not exists server_room boolean,
    add column if not exists washrooms_count integer,
    add column if not exists private_terrace boolean,
    add column if not exists air_conditioning_type text,
    add column if not exists power_backup boolean,
    add column if not exists power_load_kva numeric,
    add column if not exists internet_ready boolean,

    add column if not exists car_parking_count integer,
    add column if not exists bike_parking_count integer,
    add column if not exists passenger_lifts_count integer,
    add column if not exists service_lifts_count integer,
    add column if not exists loading_dock_count integer,
    add column if not exists truck_access boolean,
    add column if not exists container_access boolean,

    add column if not exists signage_allowed boolean,
    add column if not exists high_street boolean,
    add column if not exists corner_unit boolean,
    add column if not exists road_facing boolean,
    add column if not exists fire_noc boolean,
    add column if not exists occupancy_certificate boolean,
    add column if not exists commercial_features jsonb not null default '{}'::jsonb;

create index if not exists idx_stream_commercial_tenant_type_locality
    on public.stream_items_commercial (tenant_id, commercial_type, locality);

create index if not exists idx_stream_commercial_tenant_availability
    on public.stream_items_commercial (tenant_id, availability_status, availability_verified_at desc);

create index if not exists idx_stream_commercial_permitted_uses
    on public.stream_items_commercial using gin (permitted_uses);
