# Canonical Market Graph Design

## Goal

PropAI should ingest noisy WhatsApp market traffic from many brokers and many groups, parse it with LLMs, deduplicate it aggressively, and expose a higher-quality global market graph without re-running expensive extraction on every duplicate repost.

The core shift is:

- `stream_items` stays as the event-level parsed candidate store
- a new canonical layer becomes the product-facing market truth
- duplicates become evidence, not clutter

This design assumes:

- LLM extraction remains the primary parser
- deterministic parsing is not relied on for correctness
- dedupe is probabilistic and evidence-driven
- global visibility is controlled separately from raw provenance

## Current System

Today the backend flow is centered on [channelService.ts](/home/vishal/propai/apps/api/src/services/channelService.ts:1490):

- parse inbound WhatsApp message with `aiService.chat()`
- write each candidate into `stream_items`
- immediately match that row to `broker_channels`

Current strengths:

- raw market traffic is captured quickly
- multi-item broker blasts are already split
- stream corrections already exist in `stream_item_corrections`
- group/session metadata and global stream policy are in place

Current gaps:

- `stream_items` mixes parsing, visibility, duplication, and market truth
- duplicate inventory across brokers/groups inflates feed quality noise
- repeated reposts waste LLM budget if reparsed as new truth each time
- there is no canonical record that many `stream_items` can attach to

## Target Model

Use four layers:

1. `raw message`
2. `parsed candidate`
3. `canonical market record`
4. `visibility and ranking`

### Layer 1: Raw Message

Keep immutable event data:

- original text
- sender JID / phone
- group JID
- workspace / tenant / session
- receive timestamp
- raw media references if any

Existing candidates:

- `messages`
- `raw_dump`

Recommendation:

- standardize on one immutable inbound event table over time
- do not delete or overwrite raw events

### Layer 2: Parsed Candidate

This remains `stream_items`.

Each row is:

- one parsed listing or requirement candidate
- tied to one source message segment
- confidence-scored
- parser-versioned
- not assumed to be canonical truth

Add to `stream_items` over time:

- `parser_version text`
- `semantic_fingerprint_text text`
- `semantic_fingerprint_embedding vector`
- `novelty_score numeric`
- `duplicate_cluster_hint text`
- `canonical_record_id uuid null`
- `canonical_match_confidence numeric null`
- `canonical_decision text null check (canonical_decision in ('new', 'matched', 'conflicted', 'rejected'))`

## New Canonical Tables

### `canonical_records`

One row per deduplicated market object.

Use for both listings and requirements at first; split later only if query patterns demand it.

Suggested columns:

```sql
create table if not exists canonical_records (
  id uuid primary key default gen_random_uuid(),
  record_kind text not null check (record_kind in ('listing', 'requirement')),
  deal_type text not null default 'unknown',
  asset_class text not null default 'unknown',
  property_category text not null default 'residential',
  canonical_title text,
  locality text,
  city text,
  building_name text,
  micro_location text,
  bhk text,
  area_sqft numeric,
  price_numeric numeric,
  price_label text,
  furnishing text,
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
  semantic_fingerprint_embedding vector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### `canonical_record_evidence`

Each canonical record is supported by many stream candidates.

```sql
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
```

### `source_reliability`

Track how much trust to assign a broker/source over time.

```sql
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
```

### `canonical_corrections`

Promote corrections from event-level only to canonical-level too.

This can be separate or derived from `stream_item_corrections`.

## Ingestion Flow

### Step 1: Parse Every Message Once

Keep the current `parseMessageWithAI()` flow as the first extraction pass.

Output should include:

- structured fields
- `semantic_fingerprint_text`
- field confidence
- parser version
- novelty hint

Recommended prompt addition:

```json
{
  "semanticFingerprintText": "compact identity summary for retrieval",
  "fieldConfidence": {
    "locality": 0.91,
    "priceNumeric": 0.72,
    "bhk": 0.88
  },
  "noveltyScore": 0.34
}
```

The fingerprint should be short and stable, for example:

- `2bhk sale hiranandani powai around 2.35cr approx 950sqft furnished`

### Step 2: Write Candidate To `stream_items`

This continues as now, but with:

- parser metadata
- semantic fingerprint text
- canonical match fields initially null

### Step 3: Retrieve Canonical Candidates

Do not ask the LLM to solve identity across the full corpus.

Retrieve top `k` possible canonicals by:

- embedding similarity on `semantic_fingerprint_text`
- recency window, such as last `30` days
- same `record_type`
- same `deal_type` where available
- same locality/city if present

Retrieval goal:

- reduce merge choice to a small candidate set

### Step 4: Match Or Create

Run a merge scorer over:

- new parsed candidate
- top `k` canonical candidates

Scorer output:

- `same_record`
- `possible_same_record`
- `different_record`
- `insufficient_data`

And:

- confidence
- agreeing fields
- conflicting fields
- whether new candidate improves canonical truth

This scorer can be:

- a cheaper LLM classification call
- or a learned scorer later

### Step 5: Update Canonical Record

If matched:

- link `stream_item` to canonical
- update `source_count`, `unique_broker_count`, `unique_group_count`
- update `last_seen_at`
- update truth fields only if confidence improves
- increment contradictions when fields disagree materially

If not matched:

- create a new canonical record
- link first evidence row

## Merge Rules

The system should never treat one message as the absolute truth. It should converge.

### Field Update Rules

Each canonical field should be selected by weighted evidence:

- candidate field confidence
- source reliability
- freshness
- number of agreeing sources

Suggested formula:

`field_weight = field_confidence * source_reliability * freshness_weight`

Prefer:

- latest consistent price
- locality confirmed by multiple brokers
- building/project names repeated across sources
- direct owner data only if the source is historically reliable

### Contradiction Rules

Mark conflict when:

- price differs by more than a configurable tolerance
- bhk differs materially
- sale vs rent differs
- listing vs requirement differs
- locality/building conflict is high-confidence on both sides

When contradictions exceed a threshold:

- keep canonical active
- raise `contradiction_count`
- mark `status = conflicted`
- lower feed ranking

## Duplicate Handling

Duplicates are valuable evidence.

What they should improve:

- confidence
- freshness
- source diversity
- market relevance

What they should not do:

- create duplicate cards in global feed
- trigger a full expensive parse-and-merge cycle if already known

### Duplicate Reuse Strategy

If a near-identical message has already been processed:

- skip full extraction if the previous parsed candidate is recent enough
- reuse prior structured candidate as a draft
- only run a lighter merge / delta step

This is the biggest LLM cost lever.

## LLM Usage Strategy

### Expensive Path

Use richer extraction only when:

- message is novel
- candidate retrieval score is weak
- match candidates are highly conflicting
- the message contains multiple mixed records
- the record is about to be promoted globally

### Cheap Path

Use lighter or reused inference when:

- text is near-duplicate of recent content
- similar candidate already exists
- only freshness/source evidence needs updating
- no new fields are likely to be discovered

### Cache Layers

Store:

- `raw_text_hash`
- `normalized_text_hash`
- `semantic_fingerprint_text`
- parse result by parser version

If the same message or a trivial forward variant repeats:

- do not pay for full parsing again

## Global Visibility Model

Separate data quality from product exposure.

### Public / Global Layer

Show:

- canonical summary
- confidence
- freshness
- source count
- locality / building / price summary

Do not show by default:

- exact source phone
- exact group name
- private provenance trail

### Restricted Layer

For authorized workflows, keep access to:

- source contact
- exact underlying evidence items
- correction and provenance trail

This avoids building a global raw-message leak machine.

## Ranking

The feed should rank canonical records, not raw `stream_items`.

Suggested ranking components:

- freshness score
- source diversity
- confidence score
- contradiction penalty
- source reliability
- demand/supply relevance
- workspace personalization

Example:

`rank = freshness * 0.35 + confidence * 0.25 + source_diversity * 0.20 + source_reliability * 0.15 - contradiction_penalty * 0.25`

## How This Fits The Current PropAI Code

### Existing `channelService`

Keep `stream_items` ingestion in [channelService.ts](/home/vishal/propai/apps/api/src/services/channelService.ts:1424), but add a post-ingest canonicalization phase:

1. upsert `stream_items`
2. retrieve possible canonical records
3. run merge scorer
4. create/update canonical record
5. attach evidence
6. match canonical record to channels

### Channel Matching

Current channel matching uses raw stream items in [channelService.ts](/home/vishal/propai/apps/api/src/services/channelService.ts:1717).

Recommended future state:

- personal channels subscribe to canonical records
- optionally keep event-level links for audit

This reduces duplicate clutter in personal channel feeds too.

### Corrections

Current correction flow updates `stream_items` and writes `stream_item_corrections`.

Recommended change:

- any accepted correction should also re-evaluate the linked canonical record
- use corrections to update `source_reliability`
- use corrected examples to improve prompt tuning and parse prompts

## Rollout Plan

### Phase 1: Safe Additions

- add `canonical_records`
- add `canonical_record_evidence`
- add `source_reliability`
- add new nullable metadata columns on `stream_items`

No product behavior changes yet.

### Phase 2: Background Canonicalizer

- build a worker that backfills canonicals from existing `stream_items`
- process newest `N` days first
- write links but keep current UI reading from `stream_items`

### Phase 3: Dual Read

- for global stream and selected internal views, read canonical records first
- preserve raw/evidence drill-down

### Phase 4: Cost Controls

- add parse cache
- add duplicate reuse
- add lighter merge scorer path

### Phase 5: Product Shift

- switch `/stream` and channel feeds to canonical-first rendering
- expose duplicates as evidence count, not as duplicate cards

## Success Metrics

Track:

- duplicate collapse ratio
- average sources per canonical
- correction rate before and after canonicalization
- parse cost per unique canonical record
- feed card duplication rate
- merge precision from sampled audits
- median time from raw message to usable canonical record

## Immediate Next Build

If implementing this in the current repo, build in this order:

1. new migrations for `canonical_records`, `canonical_record_evidence`, `source_reliability`
2. add parser metadata fields to `stream_items`
3. implement a `CanonicalizationService`
4. call it after `stream_items` upsert
5. backfill historical `stream_items`
6. add admin/debug views for canonical conflicts and evidence

That gets PropAI from a parsed-message feed to a market graph.
