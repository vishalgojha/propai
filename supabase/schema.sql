-- Profiles (Updated for Phone-First Identity)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  phone text unique not null,
  email text unique,
  full_name text,
  timezone text default 'UTC',
  phone_verified boolean default false,
  verification_token text,
  trial_started_at timestamp with time zone,
  trial_used boolean default false,
  is_admin boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- WhatsApp Sessions
create table whatsapp_sessions (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid references profiles(id) on delete cascade not null,
  label text not null default 'Owner',
  owner_name text,
  session_data jsonb not null,
  status text default 'disconnected',
  last_sync timestamp with time zone default timezone('utc'::text, now()) not null
);
create unique index whatsapp_sessions_tenant_label_uidx on whatsapp_sessions (tenant_id, label);

-- Contacts & Classification
create table contacts (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid references profiles(id) on delete cascade not null,
  remote_jid text not null,
  display_name text,
  classification text check (classification in ('Broker', 'Client', 'Unknown')) default 'Unknown',
  last_interacted_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(tenant_id, remote_jid)
);

-- Listings
create table listings (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid references profiles(id) on delete cascade not null,
  source_group_id text,
  structured_data jsonb not null,
  raw_text text,
  status text check (status in ('Active', 'Sold')) default 'Active',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Leads
create table leads (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid references profiles(id) on delete cascade not null,
  contact_id uuid references contacts(id) on delete cascade not null,
  budget text,
  location_pref text,
  timeline text,
  possession text,
  current_step text check (current_step in ('budget', 'location', 'timeline', 'possession', 'qualified')) default 'budget',
  status text check (status in ('New', 'Qualified', 'Site Visit', 'Closed')) default 'New',
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Lead Records
create table lead_records (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid references profiles(id) on delete cascade not null,
  lead_id text not null,
  phone text not null,
  name text not null,
  record_type text check (record_type in ('inventory_listing', 'buyer_requirement')) not null,
  dataset_mode text check (dataset_mode in ('broker_group', 'buyer_inquiry', 'mixed')),
  deal_type text,
  asset_class text,
  price_basis text,
  area_sqft numeric,
  area_basis text,
  budget numeric,
  location_hint text,
  city text,
  city_canonical text,
  locality_canonical text,
  micro_market text,
  matched_alias text,
  confidence numeric,
  unresolved_flag boolean default false,
  resolution_method text check (resolution_method in ('exact_alias', 'normalized_alias', 'fuzzy_alias', 'unresolved')),
  urgency text check (urgency in ('high', 'medium', 'low')),
  priority_bucket text check (priority_bucket in ('P1', 'P2', 'P3')),
  priority_score numeric,
  sentiment_score numeric,
  intent_score numeric,
  recency_score numeric,
  sentiment_risk numeric,
  raw_text text,
  source text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  payload jsonb not null default '{}'::jsonb,
  unique(tenant_id, lead_id)
);

-- Follow-up Tasks
create table follow_up_tasks (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid references profiles(id) on delete cascade not null,
  lead_id text,
  lead_name text not null,
  lead_phone text,
  action_type text check (action_type in ('call', 'email', 'visit')) not null default 'call',
  due_at timestamp with time zone not null,
  status text check (status in ('pending', 'completed', 'cancelled')) not null default 'pending',
  notes text,
  priority_bucket text check (priority_bucket in ('P1', 'P2', 'P3')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(tenant_id, lead_id, action_type, due_at)
);

-- Group Configuration
create table group_configs (
  group_id text primary key,
  tenant_id uuid references profiles(id) on delete cascade not null,
  model_preference text default 'Local',
  behavior text check (behavior in ('Listen', 'AutoReply', 'Broadcast')) default 'Listen',
  reply_timing text check (reply_timing in ('Immediate', '30s', 'Approval')) default 'Immediate',
  tone text check (tone in ('Professional', 'Friendly', 'Hinglish')) default 'Professional',
  language text check (language in ('EN', 'HI', 'Hinglish')) default 'EN'
);

-- Model Preferences
create table model_preferences (
  tenant_id uuid references profiles(id) on delete cascade primary key,
  default_model text default 'Local',
  billing_tier text default 'free',
  latency_threshold int default 2000,
  contribute_data boolean default false,
  consent_timestamp timestamp with time zone
);

-- AI API Keys
create table api_keys (
  tenant_id uuid references profiles(id) on delete cascade not null,
  provider text not null,
  key text not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (tenant_id, provider)
);

-- Agent Behavior Rules
create table agent_behavior_rules (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid references profiles(id) on delete cascade not null,
  trigger_keyword text not null,
  response_template text not null,
  priority int default 0
);

-- Messages
create table messages (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid references profiles(id) on delete cascade not null,
  remote_jid text not null,
  text text,
  sender text check (sender in ('Broker', 'Client', 'AI')) not null,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Agent Events
create table agent_events (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid references profiles(id) on delete cascade not null,
  event_type text not null,
  description text not null,
  metadata jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Subscriptions (Updated for Trial Status)
create table subscriptions (
  tenant_id uuid references profiles(id) on delete cascade primary key,
  plan text check (plan in ('Free', 'Pro', 'Team')) default 'Free',
  status text check (status in ('trial', 'active', 'cancelled', 'past_due')) default 'trial',
  renewal_date timestamp with time zone,
  razorpay_subscription_id text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS Policies
alter table profiles enable row level security;
create policy "Users can view their own profile" on profiles for select using (auth.uid() = id);

alter table whatsapp_sessions enable row level security;
create policy "Tenants can manage their own sessions" on whatsapp_sessions all using (auth.uid() = tenant_id);

alter table contacts enable row level security;
create policy "Tenants can manage their own contacts" on contacts all using (auth.uid() = tenant_id);

alter table listings enable row level security;
create policy "Tenants can manage their own listings" on listings all using (auth.uid() = tenant_id);

alter table leads enable row level security;
create policy "Tenants can manage their own leads" on leads all using (auth.uid() = tenant_id);

alter table lead_records enable row level security;
create policy "Tenants can manage their own lead records" on lead_records for select using ((select auth.uid()) = tenant_id);
create policy "Tenants can insert their own lead records" on lead_records for insert with check ((select auth.uid()) = tenant_id);
create policy "Tenants can update their own lead records" on lead_records for update using ((select auth.uid()) = tenant_id) with check ((select auth.uid()) = tenant_id);

alter table follow_up_tasks enable row level security;
create policy "Tenants can manage their own follow up tasks" on follow_up_tasks for select using ((select auth.uid()) = tenant_id);
create policy "Tenants can insert their own follow up tasks" on follow_up_tasks for insert with check ((select auth.uid()) = tenant_id);
create policy "Tenants can update their own follow up tasks" on follow_up_tasks for update using ((select auth.uid()) = tenant_id) with check ((select auth.uid()) = tenant_id);

alter table group_configs enable row level security;
create policy "Tenants can manage their own group configs" on group_configs all using (auth.uid() = tenant_id);

alter table model_preferences enable row level security;
create policy "Tenants can manage their own model prefs" on model_preferences all using (auth.uid() = tenant_id);

alter table api_keys enable row level security;
create policy "Tenants can manage their own api keys" on api_keys all using (auth.uid() = tenant_id);

alter table agent_behavior_rules enable row level security;
create policy "Tenants can manage their own rules" on agent_behavior_rules all using (auth.uid() = tenant_id);

alter table messages enable row level security;
create policy "Tenants can manage their own messages" on messages all using (auth.uid() = tenant_id);

alter table agent_events enable row level security;
create policy "Tenants can view their own agent events" on agent_events for select using (auth.uid() = tenant_id);
create policy "Service role can insert agent events" on agent_events for insert with check (true);

alter table subscriptions enable row level security;
create policy "Tenants can manage their own subscriptions" on subscriptions all using (auth.uid() = tenant_id);
