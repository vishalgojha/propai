alter table if exists public.workspace_files
  add column if not exists extraction_status text not null default 'pending';

alter table if exists public.workspace_files
  add column if not exists extraction_error text;

update public.workspace_files
set extraction_status = case
  when extracted_text is not null and length(extracted_text) > 0 then 'extracted'
  else 'not_supported'
end
where extraction_status is null or extraction_status = 'pending';

