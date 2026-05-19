# Inbox Intelligence Architecture

## Goal

PropAI Inbox should turn inbound WhatsApp conversations into private, structured realtor intelligence.

Inbox is not the primary place where a broker sends messages. Inbox is the place where PropAI:

- filters noisy personal or non-real-estate traffic
- preserves private thread history
- extracts structured requirement and relationship signals
- joins inbox context with Stream context for agent assistance

## Product Language

Use these terms in user-facing copy:

- `Inbox`: the private conversation surface
- `thread`: one DM or conversation inside the inbox
- `held`: AI kept the thread out of the main inbox until relevance is clearer
- `ignored`: the broker explicitly does not want that source shown in inbox

Do not refer to the deprecated WhatsApp-web mirror as `monitor` in user-facing discussion or docs.

## Principles

- Private by default
- Personal outreach stays on the broker's phone
- Inbox data never becomes public stream content by default
- AI can suggest inclusion, but the broker can always override
- Raw chat logs should not be resent to the model on every action

## Data Layers

Use four layers:

1. `raw events`
2. `thread records`
3. `contact memory`
4. `workspace summaries`

### Raw Events

Existing sources:

- `messages`
- `raw_dump`

These stay the source of truth for inbound history.

### Thread Records

Each inbox item should be represented as a thread view with:

- `chatId`
- `remoteJid`
- `title`
- `preview`
- `lastMessageAt`
- `governance.state`
- `governance.reason`
- `governance.override`

### Contact Memory

Each recurring DM source should become a first-class contact record over time:

- normalized phone
- role
- localities
- requirement history
- relationship summary
- trust or relevance signals

### Workspace Summaries

Aggregate private patterns:

- recurring requirement clusters
- active collaborating brokers
- follow-up gaps
- locality demand trends

## Governance Model

Inbox governance is workspace-level and session-aware.

Current persisted states:

- `allowed`
- `held`
- `ignored`

Current storage path:

- `workspace_settings.settings.inboxIntelligence.sessions[sessionKey].threads[chatId]`

Why this path exists:

- it avoids adding new tables before the data model stabilizes
- it survives browser changes because it is server-side
- it can later be migrated into dedicated inbox tables

## Classification Rules

The first pass uses deterministic heuristics before any deeper AI work:

- blocked social domains like YouTube or Instagram
- emoji-heavy low-signal messages
- low-signal greeting chatter
- positive real-estate keywords like buyer, seller, budget, BHK, locality, broker

This is intentionally cheap. It keeps irrelevant chats away from expensive downstream processing.

## Current API Surface

Legacy internal naming still exists in some services, but the Inbox-facing APIs are:

- `GET /api/whatsapp/inbox`
- `GET /api/whatsapp/inbox/governance`
- `POST /api/whatsapp/inbox/governance`
- `GET /api/whatsapp/monitor/messages`

The message-history route still uses legacy naming internally. User-facing product language should stay `Inbox`.

## Current Implementation

### Backend

- `workspaceMonitorService` now decorates inbox threads with server-side governance
- `inboxGovernanceService` owns thread classification and override persistence
- `workspaceSettingsService` now preserves nested inbox intelligence settings during saves

### Frontend

- Inbox uses server-provided governance state for `Inbox`, `Held by AI`, and `Ignored`
- broker actions like `Keep in inbox`, `Hold outside inbox`, and `Never show in inbox` persist through the backend
- sidebar product label is now `Inbox`

## Near-Term Build Plan

1. Move more thread controls out of local UI state into backend-owned state
2. Add contact-memory extraction for allowed threads
3. Build context compaction for thread summaries before LLM calls
4. Join Inbox and Stream in agent tools
5. Add proactive follow-up and matching suggestions

## Next Tables

When the model stabilizes, create dedicated tables for:

- `inbox_threads`
- `inbox_thread_events`
- `workspace_contacts`
- `workspace_contact_memories`
- `workspace_memory_summaries`

Until then, the current implementation is the safe bridge layer.
