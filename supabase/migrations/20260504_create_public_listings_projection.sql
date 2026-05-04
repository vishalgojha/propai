create extension if not exists pg_trgm;

create or replace function public.normalize_whatsapp_number(raw text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  if raw is null then
    return null;
  end if;

  digits := regexp_replace(raw, '\D', '', 'g');

  if digits = '' then
    return null;
  elsif length(digits) = 10 then
    return '91' || digits;
  elsif length(digits) = 12 and left(digits, 2) = '91' then
    return digits;
  elsif length(digits) >= 11 then
    return digits;
  end if;

  return null;
end;
$$;

create table if not exists public.public_listings (
  source_message_id text primary key,
  source_group_id text,
  source_group_name text,
  listing_type text not null,
  area text,
  sub_area text,
  location text not null default 'Mumbai',
  price numeric,
  price_type text,
  size_sqft numeric,
  furnishing text,
  bhk integer,
  property_type text,
  title text not null,
  description text not null,
  raw_message text,
  cleaned_message text,
  sender_number text,
  primary_contact_name text,
  primary_contact_number text,
  primary_contact_wa text,
  contacts jsonb not null default '[]'::jsonb,
  confidence numeric,
  message_timestamp timestamptz,
  search_text text not null default '',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists public_listings_timestamp_idx
  on public.public_listings (message_timestamp desc nulls last);

create index if not exists public_listings_listing_type_idx
  on public.public_listings (listing_type);

create index if not exists public_listings_area_idx
  on public.public_listings (area);

create index if not exists public_listings_sub_area_idx
  on public.public_listings (sub_area);

create index if not exists public_listings_search_text_trgm_idx
  on public.public_listings using gin (search_text gin_trgm_ops);

alter table public.public_listings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'public_listings'
      and policyname = 'Public listings are readable'
  ) then
    create policy "Public listings are readable"
      on public.public_listings
      for select
      using (true);
  end if;
end
$$;

create or replace function public.sync_public_listing()
returns trigger
language plpgsql
as $$
declare
  first_entry jsonb;
  listing_type_value text;
  area_value text;
  sub_area_value text;
  location_value text;
  price_value numeric;
  size_sqft_value numeric;
  bhk_value integer;
  property_type_value text;
  furnishing_value text;
  primary_contact jsonb;
  primary_contact_name_value text;
  primary_contact_number_value text;
  primary_contact_wa_value text;
  title_value text;
  description_value text;
  search_text_value text;
begin
  if TG_OP = 'DELETE' then
    delete from public.public_listings
    where source_message_id = old.id::text;
    return old;
  end if;

  if coalesce(new.status, '') <> 'processed'
     or new.entries is null
     or jsonb_typeof(new.entries) <> 'array'
     or jsonb_array_length(new.entries) = 0 then
    delete from public.public_listings
    where source_message_id = new.id::text;
    return new;
  end if;

  first_entry := new.entries->0;
  listing_type_value := coalesce(first_entry->>'type', new.type, 'requirement');
  area_value := nullif(first_entry->>'area', '');
  sub_area_value := nullif(first_entry->>'sub_area', '');
  location_value := coalesce(sub_area_value, area_value, 'Mumbai');
  price_value := nullif(first_entry->>'price', '')::numeric;
  size_sqft_value := nullif(first_entry->>'size_sqft', '')::numeric;
  bhk_value := nullif(first_entry->>'bhk', '')::integer;
  property_type_value := nullif(first_entry->>'property_type', '');
  furnishing_value := nullif(first_entry->>'furnishing', '');

  primary_contact := (
    select contact
    from jsonb_array_elements(coalesce(new.contacts, '[]'::jsonb)) contact
    where public.normalize_whatsapp_number(contact->>'number') is not null
    limit 1
  );

  primary_contact_name_value := nullif(primary_contact->>'name', '');
  primary_contact_number_value := coalesce(
    public.normalize_whatsapp_number(primary_contact->>'number'),
    public.normalize_whatsapp_number(new.sender_number)
  );
  primary_contact_wa_value := case
    when primary_contact_number_value is not null then 'https://wa.me/' || primary_contact_number_value
    else null
  end;

  title_value := trim(
    concat_ws(
      ' in ',
      nullif(trim(concat_ws(' ', nullif(first_entry->>'bhk', '') || case when nullif(first_entry->>'bhk', '') is not null then ' BHK' else '' end, property_type_value)), ''),
      location_value
    )
  );

  if title_value = '' then
    title_value := location_value;
  end if;

  description_value := trim(
    concat_ws(
      ', ',
      nullif(trim(concat_ws(' ', nullif(first_entry->>'bhk', '') || case when nullif(first_entry->>'bhk', '') is not null then ' BHK' else '' end, property_type_value)), ''),
      case when location_value is not null then 'in ' || location_value else null end,
      case when size_sqft_value is not null then round(size_sqft_value)::text || ' sq ft' else null end,
      furnishing_value,
      case
        when price_value is not null and nullif(first_entry->>'price_type', '') = 'monthly' then 'priced monthly'
        when price_value is not null then 'priced for sale'
        else null
      end
    )
  );

  if description_value = '' then
    description_value := coalesce(nullif(new.cleaned_message, ''), nullif(new.message, ''), title_value);
  end if;

  search_text_value := lower(
    concat_ws(
      ' ',
      coalesce(sub_area_value, ''),
      coalesce(area_value, ''),
      coalesce(property_type_value, ''),
      coalesce(furnishing_value, ''),
      coalesce(new.cleaned_message, ''),
      coalesce(new.message, '')
    )
  );

  insert into public.public_listings (
    source_message_id,
    source_group_id,
    source_group_name,
    listing_type,
    area,
    sub_area,
    location,
    price,
    price_type,
    size_sqft,
    furnishing,
    bhk,
    property_type,
    title,
    description,
    raw_message,
    cleaned_message,
    sender_number,
    primary_contact_name,
    primary_contact_number,
    primary_contact_wa,
    contacts,
    confidence,
    message_timestamp,
    search_text,
    updated_at
  )
  values (
    new.id::text,
    new.group_id,
    new.group_name,
    listing_type_value,
    area_value,
    sub_area_value,
    location_value,
    price_value,
    nullif(first_entry->>'price_type', ''),
    size_sqft_value,
    furnishing_value,
    bhk_value,
    property_type_value,
    title_value,
    description_value,
    new.message,
    new.cleaned_message,
    new.sender_number,
    primary_contact_name_value,
    primary_contact_number_value,
    primary_contact_wa_value,
    coalesce(new.contacts, '[]'::jsonb),
    new.confidence,
    new.timestamp,
    search_text_value,
    timezone('utc'::text, now())
  )
  on conflict (source_message_id) do update
  set
    source_group_id = excluded.source_group_id,
    source_group_name = excluded.source_group_name,
    listing_type = excluded.listing_type,
    area = excluded.area,
    sub_area = excluded.sub_area,
    location = excluded.location,
    price = excluded.price,
    price_type = excluded.price_type,
    size_sqft = excluded.size_sqft,
    furnishing = excluded.furnishing,
    bhk = excluded.bhk,
    property_type = excluded.property_type,
    title = excluded.title,
    description = excluded.description,
    raw_message = excluded.raw_message,
    cleaned_message = excluded.cleaned_message,
    sender_number = excluded.sender_number,
    primary_contact_name = excluded.primary_contact_name,
    primary_contact_number = excluded.primary_contact_number,
    primary_contact_wa = excluded.primary_contact_wa,
    contacts = excluded.contacts,
    confidence = excluded.confidence,
    message_timestamp = excluded.message_timestamp,
    search_text = excluded.search_text,
    updated_at = timezone('utc'::text, now());

  return new;
end;
$$;

drop trigger if exists sync_public_listing_on_whatsapp_messages on public.whatsapp_messages;

create trigger sync_public_listing_on_whatsapp_messages
after insert or update or delete on public.whatsapp_messages
for each row
execute function public.sync_public_listing();

insert into public.public_listings (
  source_message_id,
  source_group_id,
  source_group_name,
  listing_type,
  area,
  sub_area,
  location,
  price,
  price_type,
  size_sqft,
  furnishing,
  bhk,
  property_type,
  title,
  description,
  raw_message,
  cleaned_message,
  sender_number,
  primary_contact_name,
  primary_contact_number,
  primary_contact_wa,
  contacts,
  confidence,
  message_timestamp,
  search_text,
  updated_at
)
select
  wm.id::text,
  wm.group_id,
  wm.group_name,
  coalesce(wm.entries->0->>'type', wm.type, 'requirement'),
  nullif(wm.entries->0->>'area', ''),
  nullif(wm.entries->0->>'sub_area', ''),
  coalesce(nullif(wm.entries->0->>'sub_area', ''), nullif(wm.entries->0->>'area', ''), 'Mumbai'),
  nullif(wm.entries->0->>'price', '')::numeric,
  nullif(wm.entries->0->>'price_type', ''),
  nullif(wm.entries->0->>'size_sqft', '')::numeric,
  nullif(wm.entries->0->>'furnishing', ''),
  nullif(wm.entries->0->>'bhk', '')::integer,
  nullif(wm.entries->0->>'property_type', ''),
  coalesce(
    nullif(
      trim(
        concat_ws(
          ' in ',
          nullif(trim(concat_ws(' ', nullif(wm.entries->0->>'bhk', '') || case when nullif(wm.entries->0->>'bhk', '') is not null then ' BHK' else '' end, nullif(wm.entries->0->>'property_type', ''))), ''),
          coalesce(nullif(wm.entries->0->>'sub_area', ''), nullif(wm.entries->0->>'area', ''), 'Mumbai')
        )
      ),
      ''
    ),
    coalesce(nullif(wm.entries->0->>'sub_area', ''), nullif(wm.entries->0->>'area', ''), 'Mumbai')
  ),
  coalesce(
    nullif(
      trim(
        concat_ws(
          ', ',
          nullif(trim(concat_ws(' ', nullif(wm.entries->0->>'bhk', '') || case when nullif(wm.entries->0->>'bhk', '') is not null then ' BHK' else '' end, nullif(wm.entries->0->>'property_type', ''))), ''),
          'in ' || coalesce(nullif(wm.entries->0->>'sub_area', ''), nullif(wm.entries->0->>'area', ''), 'Mumbai'),
          case when nullif(wm.entries->0->>'size_sqft', '') is not null then round((nullif(wm.entries->0->>'size_sqft', '')::numeric))::text || ' sq ft' else null end,
          nullif(wm.entries->0->>'furnishing', '')
        )
      ),
      ''
    ),
    coalesce(nullif(wm.cleaned_message, ''), nullif(wm.message, ''), 'Property listing')
  ),
  wm.message,
  wm.cleaned_message,
  wm.sender_number,
  (
    select nullif(contact->>'name', '')
    from jsonb_array_elements(coalesce(wm.contacts, '[]'::jsonb)) contact
    where public.normalize_whatsapp_number(contact->>'number') is not null
    limit 1
  ),
  coalesce(
    (
      select public.normalize_whatsapp_number(contact->>'number')
      from jsonb_array_elements(coalesce(wm.contacts, '[]'::jsonb)) contact
      where public.normalize_whatsapp_number(contact->>'number') is not null
      limit 1
    ),
    public.normalize_whatsapp_number(wm.sender_number)
  ),
  case
    when coalesce(
      (
        select public.normalize_whatsapp_number(contact->>'number')
        from jsonb_array_elements(coalesce(wm.contacts, '[]'::jsonb)) contact
        where public.normalize_whatsapp_number(contact->>'number') is not null
        limit 1
      ),
      public.normalize_whatsapp_number(wm.sender_number)
    ) is not null
      then 'https://wa.me/' || coalesce(
        (
          select public.normalize_whatsapp_number(contact->>'number')
          from jsonb_array_elements(coalesce(wm.contacts, '[]'::jsonb)) contact
          where public.normalize_whatsapp_number(contact->>'number') is not null
          limit 1
        ),
        public.normalize_whatsapp_number(wm.sender_number)
      )
    else null
  end,
  coalesce(wm.contacts, '[]'::jsonb),
  wm.confidence,
  wm.timestamp,
  lower(
    concat_ws(
      ' ',
      coalesce(nullif(wm.entries->0->>'sub_area', ''), ''),
      coalesce(nullif(wm.entries->0->>'area', ''), ''),
      coalesce(nullif(wm.entries->0->>'property_type', ''), ''),
      coalesce(nullif(wm.entries->0->>'furnishing', ''), ''),
      coalesce(wm.cleaned_message, ''),
      coalesce(wm.message, '')
    )
  ),
  timezone('utc'::text, now())
from public.whatsapp_messages wm
where coalesce(wm.status, '') = 'processed'
  and wm.entries is not null
  and jsonb_typeof(wm.entries) = 'array'
  and jsonb_array_length(wm.entries) > 0
on conflict (source_message_id) do update
set
  source_group_id = excluded.source_group_id,
  source_group_name = excluded.source_group_name,
  listing_type = excluded.listing_type,
  area = excluded.area,
  sub_area = excluded.sub_area,
  location = excluded.location,
  price = excluded.price,
  price_type = excluded.price_type,
  size_sqft = excluded.size_sqft,
  furnishing = excluded.furnishing,
  bhk = excluded.bhk,
  property_type = excluded.property_type,
  title = excluded.title,
  description = excluded.description,
  raw_message = excluded.raw_message,
  cleaned_message = excluded.cleaned_message,
  sender_number = excluded.sender_number,
  primary_contact_name = excluded.primary_contact_name,
  primary_contact_number = excluded.primary_contact_number,
  primary_contact_wa = excluded.primary_contact_wa,
  contacts = excluded.contacts,
  confidence = excluded.confidence,
  message_timestamp = excluded.message_timestamp,
  search_text = excluded.search_text,
  updated_at = timezone('utc'::text, now());
