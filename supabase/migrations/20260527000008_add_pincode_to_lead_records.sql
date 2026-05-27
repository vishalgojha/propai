alter table public.lead_records
  add column if not exists pincode text;
