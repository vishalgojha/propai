# Group Audit Architecture

## Goal

On the first QR scan of a WhatsApp number, PropAI should not immediately start pushing group traffic into Stream.

Instead, PropAI should:

1. sync the group network
2. analyze the quality of that network
3. show a full audit page
4. help the broker choose which groups deserve parsing
5. enable parsing only after audit approval

## Why

This solves four real product problems:

- early Stream noise
- wasted parsing cost
- weak onboarding value
- low broker trust in automated ingestion

The audit page turns QR connect into an intelligence moment:

- how many groups exist
- how much member overlap exists across groups
- how chaotic the network is
- which groups look like real-estate signal vs personal or noisy traffic

## Current Production Implementation

### 1. First-scan parse gate

Newly connected sessions now carry:

- `session_data.groupAuditPending`
- `session_data.groupAuditCompletedAt`

When a session is pending audit:

- synced groups default to `group_configs.behavior = 'Off'`
- group parsing stays blocked until the audit is applied

### 2. Participant cache

The WhatsApp group sync now stores participant JIDs from live Baileys metadata into `whatsapp_groups.participant_jids`.

This allows audit scoring to compute:

- unique members
- duplicate members across groups
- overlap percentage

### 3. Group audit scoring

Current scoring is deterministic and production-safe:

- signal score
- noise score
- chaos score
- recommendation:
  - `parse`
  - `review`
  - `ignore`

This is intentionally stable and cheap. It can later be augmented with model-based explanation without making first-scan onboarding dependent on an LLM.

### 4. API surface

New endpoints:

- `GET /api/whatsapp/groups/audit?sessionLabel=...`
- `POST /api/whatsapp/groups/audit`

The POST endpoint applies audit decisions by:

- setting selected groups to `Listen`
- keeping others `Off`
- hiding ignored groups
- marking session audit as completed

### 5. Frontend surface

The existing WhatsApp page now includes a production `Audit` tab.

Behavior:

- connected sessions with `groupAuditPending` automatically open the audit flow
- the audit shows:
  - total groups
  - duplicate-member rate
  - business-group count
  - average chaos
  - recommended parse groups
- each group shows:
  - recommendation
  - overlap
  - signal
  - chaos
  - noise
  - reasons

## Current Data Model Changes

`whatsapp_groups` now stores:

- `participant_jids text[]`
- `duplicate_overlap_score integer`
- `signal_score integer`
- `noise_score integer`
- `audit_recommendation text`

Not all derived columns are fully persisted yet; the authoritative audit computation still happens in the service layer.

## Next Improvements

### AI layer

Add model-assisted reasoning for:

- better explanation copy
- better group naming interpretation
- better distinction between true broker groups and generic promo groups

### Richer network intelligence

Add:

- shared-broker cluster detection
- inactive group suppression
- locality concentration by group
- broker density estimation

### Separate audit storage

If this feature expands further, add dedicated tables for:

- `whatsapp_group_audits`
- `whatsapp_group_audit_runs`
- `whatsapp_group_audit_decisions`

For now, the current implementation is intentionally integrated with existing session and group tables so the feature can ship without introducing fragile parallel state.
