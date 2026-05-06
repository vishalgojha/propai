# Codex Prompt — Broker Missing Data Follow-up via WhatsApp

## What to build

Extend the `parseBroadcastMessage` feature with automatic follow-up:
After parsing a broadcast, if any listings have missing critical fields, PropAI sends ONE batched WhatsApp message back to the broker asking for the missing info. When the broker replies, a follow-up parser matches answers back to listings and updates them in Supabase.

Important outbound safety rule:
- Only the connected WhatsApp number `7021045254` is allowed to send these missing-data follow-up DMs.
- If the active sending session is any other number, do not send the follow-up DM. Just log and continue.
- Reserve `7021054254` for the future marketing agent / campaign outbound lane. Do not use it for these missing-data follow-ups.

---

## Stack context

- Node.js + Express + TypeScript (`apps/api`)
- WhatsApp sending: `client.sendText(jid, text)` via `sessionManager.getSession(tenantId)`
- Pattern for sending: see `sendViaTenantSession()` in `propaiRuntimeHooks.ts`
- Incoming messages handled in `propaiRuntimeHooks.ts` → `processInboundMessage()`
- DB: `supabaseAdmin` from `apps/api/src/config/supabase.ts`
- AI: `aiService.chat(prompt, 'Auto', taskType, tenantId, systemPrompt)`

## Admin accounts (exclude from broker detection, never send follow-up to)
```ts
const ADMIN_PHONES = ['9820056180', '7021045254', '7021054254'];
const ADMIN_EMAIL = 'vishal@chaoscraftlabs.com';
```

## Allowed sender for these DMs
```ts
const FOLLOW_UP_SENDER_PHONE = '7021045254';
const MARKETING_AGENT_PHONE = '7021054254';
```

---

## Part 1 — Send batched follow-up after broadcast parse

### Where to add this

In `broadcastParserService.ts`, after `Promise.allSettled` results are collected (Step 4), add a new step:

### Step 5 — Collect missing fields + send one WhatsApp

```ts
interface MissingDataItem {
  index: number;         // 1-based for human readability
  listing_id: string;
  building_name: string | null;
  bhk: string | null;
  missing_fields: string[];  // e.g. ["price", "area_sqft"]
}
```

Collect listings where any of these are null: `price_cr`, `rent_monthly` (if rent), `bhk`, `building_name`

Skip if:
- `resolvedPhone` is null or in `ADMIN_PHONES`
- No missing fields across all parsed listings
- The currently connected sender session is not `7021045254`

Build a single message:

```
Bhai, {N} listings mein kuch info missing hai:

1. {building_name or "listing"} ({bhk}) — {missing field labels}
2. {building_name or "listing"} ({bhk}) — {missing field labels}
...

Reply format:
1. [answer]
2. [answer]

Example: "1. 3.5cr  2. 450sqft  3. no oc"
```

Human-friendly field labels:
- `price_cr` → "price (Cr)"
- `rent_monthly` → "monthly rent (₹)"
- `bhk` → "BHK type"
- `building_name` → "building name"
- `area_sqft` → "area (sqft)"

Send via:
```ts
async function sendViaTenantSession(tenantId: string, jid: string, text: string) {
  const { sessionManager } = require('../whatsapp/SessionManager');
  const client = await sessionManager.getSession(tenantId);
  if (!client) throw new Error('No active WhatsApp session');

  const activePhone =
    typeof client.getOwnPhoneNumber === 'function'
      ? await client.getOwnPhoneNumber().catch(() => null)
      : null;

  const last10 = String(activePhone || '').replace(/\D/g, '').slice(-10);
  if (last10 !== '7021045254') {
    throw new Error('Follow-up DM blocked: active session is not the approved sender number');
  }

  await client.sendText(jid, text);
}
```

JID format: `${resolvedPhone}@s.whatsapp.net`

### Store pending follow-up in Supabase

After sending, insert to a new table `listing_follow_ups`:

```ts
await supabaseAdmin.from('listing_follow_ups').insert({
  id: uuid,
  tenant_id: tenantId,
  broker_phone: resolvedPhone,
  broker_jid: `${resolvedPhone}@s.whatsapp.net`,
  status: 'pending',          // 'pending' | 'replied' | 'expired'
  items: missingDataItems,    // JSONB — array of MissingDataItem
  sent_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()  // 24hr window
});
```

---

## Part 2 — Handle broker reply

### Where to add this

In `propaiRuntimeHooks.ts`, inside `processInboundMessage()`, BEFORE the existing `isSelfChat` check.

Add a check: if this is a DM (not a group), check if broker has a pending follow-up.

```ts
// Check for pending follow-up reply
if (!isGroup) {
  const senderPhone = remoteJid.replace('@s.whatsapp.net', '');
  const handled = await handleFollowUpReply(tenantId, senderPhone, text);
  if (handled) return;  // stop further processing
}
```

### `handleFollowUpReply` function

Add to a new file: `apps/api/src/services/broadcastFollowUpService.ts`

```ts
export async function handleFollowUpReply(
  tenantId: string,
  senderPhone: string,
  replyText: string
): Promise<boolean>
```

Steps:

**1. Find pending follow-up:**
```ts
const { data: followUp } = await supabaseAdmin
  .from('listing_follow_ups')
  .select('*')
  .eq('tenant_id', tenantId)
  .eq('broker_phone', senderPhone)
  .eq('status', 'pending')
  .gt('expires_at', new Date().toISOString())
  .order('sent_at', { ascending: false })
  .limit(1)
  .single();

if (!followUp) return false;  // not a follow-up reply, let normal flow handle it
```

**2. Parse reply via AI:**

```ts
const systemPrompt = `You match broker reply answers to numbered property listing questions. Return valid JSON only.`;

const userPrompt = `
A broker was asked about missing info for their property listings.
The original items with missing fields were:
${JSON.stringify(followUp.items, null, 2)}

The broker replied:
"""
${replyText}
"""

Match each answer to its numbered item. Return ONLY this JSON:
{
  "matches": [
    {
      "index": 1,
      "listing_id": "uuid",
      "updates": {
        "price_cr": number or null,
        "rent_monthly": number or null,
        "bhk": "string or null",
        "building_name": "string or null",
        "area_sqft": number or null
      }
    }
  ],
  "confidence": "high" | "low"
}

Rules:
- Only include fields that were actually answered
- Price: convert to crores (e.g. "35L" → 0.35, "3.5cr" → 3.5, "35 lakh" → 0.35)
- If answer is unclear → omit that field from updates
- If broker answered all in one line without numbering, match by order
`;

const raw = await aiService.chat(userPrompt, 'Auto', 'parsing', tenantId, systemPrompt);
const parsed = JSON.parse(raw.text);
```

**3. Apply updates to listings:**
```ts
for (const match of parsed.matches) {
  const updates = Object.fromEntries(
    Object.entries(match.updates).filter(([_, v]) => v !== null && v !== undefined)
  );
  if (Object.keys(updates).length === 0) continue;

  await supabaseAdmin
    .from('listings')
    .update(updates)
    .eq('id', match.listing_id)
    .eq('tenant_id', tenantId);
}
```

**4. Mark follow-up as replied:**
```ts
await supabaseAdmin
  .from('listing_follow_ups')
  .update({ status: 'replied', replied_at: new Date().toISOString() })
  .eq('id', followUp.id);
```

**5. Send confirmation back to broker:**
```ts
const updatedCount = parsed.matches.filter(m => Object.keys(m.updates).length > 0).length;
await sendViaTenantSession(
  tenantId,
  `${senderPhone}@s.whatsapp.net`,
  `✓ Got it! ${updatedCount} listing(s) updated. Thanks bhai 🙏`
);
```

**6. Return `true`** — signals to `processInboundMessage` that this was handled.

---

## Part 3 — Supabase migration additions

Add to `supabase/migrations/20250001_broadcast_tables.sql`:

```sql
create table if not exists listing_follow_ups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references auth.users(id),
  broker_phone text not null,
  broker_jid text not null,
  status text default 'pending',
  items jsonb not null,
  sent_at timestamptz default now(),
  replied_at timestamptz,
  expires_at timestamptz not null
);

create index if not exists idx_follow_ups_broker on listing_follow_ups(tenant_id, broker_phone, status);
```

---

## Part 4 — Admin account setup

In `apps/api/src/config/supabase.ts` or a new `apps/api/src/config/constants.ts`:

```ts
export const ADMIN_PHONES = ['9820056180', '7021045254', '7021054254'];
export const ADMIN_EMAILS = ['vishal@chaoscraftlabs.com'];
export const FOLLOW_UP_SENDER_PHONE = '7021045254';
export const MARKETING_AGENT_PHONE = '7021054254';

export function isAdminPhone(phone: string): boolean {
  const last10 = phone.replace(/\D/g, '').slice(-10);
  return ADMIN_PHONES.some(p => p.slice(-10) === last10);
}

export function isAllowedFollowUpSender(phone: string | null | undefined): boolean {
  const last10 = String(phone || '').replace(/\D/g, '').slice(-10);
  return last10 === FOLLOW_UP_SENDER_PHONE;
}
```

Import `isAdminPhone` in:
- `broadcastParserService.ts` — skip follow-up send
- `broadcastParserService.ts` — skip broker creation (already had `ADMIN_NUMBER`, replace with this)
- `broadcastFollowUpService.ts` — guard at top of `handleFollowUpReply`

Import `isAllowedFollowUpSender` in:
- shared WhatsApp send helper / follow-up sender path

Keep `MARKETING_AGENT_PHONE` separate so future campaign / nurture / outbound marketing tools can be routed through `7021054254` without weakening the missing-data follow-up guard.

---

## Files to create

```
apps/api/src/services/broadcastFollowUpService.ts
```

## Files to modify

```
apps/api/src/services/broadcastParserService.ts   — add Step 5 (send follow-up)
apps/api/src/whatsapp/propaiRuntimeHooks.ts        — add handleFollowUpReply check
apps/api/src/config/constants.ts                   — add ADMIN_PHONES, ADMIN_EMAILS, FOLLOW_UP_SENDER_PHONE, helpers
supabase/migrations/20250001_broadcast_tables.sql  — add listing_follow_ups table
```

---

## Notes for Codex

- `sendViaTenantSession` already exists in `propaiRuntimeHooks.ts` — extract it to a shared util or import it in `broadcastFollowUpService.ts` to avoid duplication
- Follow-up send should be fire-and-forget (try/catch, log error, don't fail the parse response)
- `handleFollowUpReply` must return `false` quickly if no pending follow-up — don't slow down normal message flow
- All DB operations use `supabaseAdmin` (service role)
- TypeScript interfaces for `MissingDataItem`, `FollowUpRecord`, `ReplyMatch`
- No new npm packages
