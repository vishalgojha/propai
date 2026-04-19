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

alter table group_configs enable row level security;
create policy "Tenants can manage their own group configs" on group_configs all using (auth.uid() = tenant_id);

alter table model_preferences enable row level security;
create policy "Tenants can manage their own model prefs" on model_preferences all using (auth.uid() = tenant_id);

alter table agent_behavior_rules enable row level security;
create policy "Tenants can manage their own rules" on agent_behavior_rules all using (auth.uid() = tenant_id);

alter table messages enable row level security;
create policy "Tenants can manage their own messages" on messages all using (auth.uid() = tenant_id);

alter table agent_events enable row level security;
create policy "Tenants can view their own agent events" on agent_events for select using (auth.uid() = tenant_id);
create policy "Service role can insert agent events" on agent_events for insert with check (true);

alter table subscriptions enable row level security;
create policy "Tenants can manage their own subscriptions" on subscriptions all using (auth.uid() = tenant_id);
