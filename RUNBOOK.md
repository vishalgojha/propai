# PropAI Pulse — Runbook

## Health Endpoint

```
GET /health
```

Returns `{"status":"ok"}` with HTTP 200 when healthy. Returns HTTP 503 `"degraded"` when embeddings are unreachable.

```
GET /api/whatsapp/health/detailed
```

Returns per-session status, reconnect attempts, circuit breaker state, and message metrics.

---

## Common Scenarios

### WhatsApp Session Won't Connect

**Symptoms**: QR/pairing code not appearing, `POST /api/whatsapp/connect` returns error, dashboard shows "disconnected".

**Troubleshooting**:

1. **Check health endpoint**: `GET /api/whatsapp/health`
2. **Check event logs**: `GET /api/whatsapp/events?label=<session_label>`
3. **Check process role**: Ensure `PROPAI_PROCESS_ROLE` is `all` or `whatsapp` (not `api`).
4. **Force disconnect + reconnect**: `POST /api/whatsapp/disconnect` then `POST /api/whatsapp/connect`
5. **Reset session completely**: `POST /api/whatsapp/reset` (clears auth state, you'll need to re-link)
6. **Check for "replaced" conflict**: If another instance is running the same number, WhatsApp will disconnect with `conflict type="replaced"`. `POST /api/whatsapp/reset-all` to clear all sessions.

### "Conflict type='replaced'" Disconnect

**Cause**: Multiple Baileys sockets connected for the same WhatsApp number.

**Resolution**:
1. Kill all other instances (check Coolify — only one API service should run).
2. `POST /api/whatsapp/reset-all` to clear stale auth state.
3. Reconnect via `POST /api/whatsapp/connect`.

**Prevention**: Never run two API deployments with the same session simultaneously (see AGENTS.md "Critical Single-Session Rule"). If running API and whatsapp-worker separately, ensure only ONE exists per number.

### Stalled Ingestion (No New Stream Items)

**Symptoms**: Stream items not appearing for hours/days, but WhatsApp connection shows "connected".

**Troubleshooting**:

1. **Check runtime status**: `GET /api/whatsapp/monitor` — shows last message received timestamp
2. **Check support logs**: `GET /api/whatsapp/support-logs?label=<session_label>` — shows recent activity
3. **Check ingest status**:
   ```sql
   SELECT ingestion_status, count(*) FROM stream_items
   WHERE created_at > now() - interval '1 hour'
   GROUP BY ingestion_status;
   ```
4. **Check message dedup**: If messages are received but not parsed, check for content_hash conflicts.
5. **Restart session**: `POST /api/whatsapp/reset` then reconnect. If that fails, restart the service in Coolify.

### QR Code Expired / Pairing Code Not Working

**Symptoms**: "Request new code" button does nothing, code keeps showing old/expired codes.

**Fix**: The `pendingConnection` guard was removed — you should always be able to request a new code now. If still stuck:

1. Disconnect: `POST /api/whatsapp/disconnect`
2. Reconnect with fresh phone number: `POST /api/whatsapp/connect`

If using pairing code on mobile, the backend retries 3 times with 3s/6s/9s backoff. Check `GET /api/whatsapp/health/logs` for `pairing_code_error` events.

### IGR Fetch Timeout

**Symptoms**: `GET /api/igr/fetch?locality=X` times out.

**Known issue**: The government portal (`igrmaharashtra.gov.in`) is unreliable via direct HTTP fetch. Use the Camoufox-based browser path instead:

1. Ensure `CAMOFOX_URL` env var is set to a running Camoufox instance.
2. The browser-based fetch is the primary path; HTTP fetch is fallback.

### Embedding Provider Unreachable

**Symptoms**: `/health` returns `503 degraded`, semantic search returns empty results.

**Checks**:
```bash
curl https://api.doubleword.ai/v1/models -H "Authorization: Bearer $DOUBLEWORD_EMBEDDING_API_KEY"
```

**Fix**: Check `DOUBLEWORD_EMBEDDING_API_KEY` env var. The code falls back to `DOUBLEWORD_API_KEY` if the dedicated key is missing.

### Re-embedding All Stream Items

When changing embedding providers or models:

```bash
curl -X POST https://api.propai.live/api/backfill-embeddings \
  -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>"
```

**Note**: This processes ALL rows (not just null embeddings) — it's idempotent but can take a long time on large datasets. Use a long HTTP timeout.

### Push Notifications Not Working

1. Generate VAPID keys: `npx web-push generate-vapid-keys`
2. Add to API env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`
3. Add to App env: `VAPID_PUBLIC_KEY`
4. Redeploy both services.

Verify subscription in DB:
```sql
SELECT * FROM push_subscriptions WHERE tenant_id = '<tenant_id>';
```

---

## Reset Procedures

### Soft Reset (Clear connection, keep auth)

```
POST /api/whatsapp/disconnect
```

Use when you just need to re-initiate the link process without re-linking from WhatsApp.

### Hard Reset (Clear auth state)

```
POST /api/whatsapp/reset
```

Use when QR/code keeps failing. Clears `session_data` in `whatsapp_sessions` — you must re-link from WhatsApp.

### Nuke All Sessions

```
POST /api/whatsapp/reset-all
```

Use only when dealing with "replaced" conflicts or migrating sessions.

---

## Database Checks

### Unresolved list items

```sql
SELECT id, raw_text, locality, bhk, confidence_score
FROM stream_items
WHERE locality IS NULL
   OR locality IN ('Mumbai', 'Mumbai market')
   OR confidence_score < 0.4
ORDER BY created_at DESC
LIMIT 50;
```

### Stalled ingestion

```sql
SELECT tenant_id, source_phone, count(*) as unparsed
FROM raw_dump
WHERE created_at > now() - interval '24 hours'
  AND id NOT IN (SELECT DISTINCT message_id FROM stream_items WHERE message_id IS NOT NULL)
GROUP BY tenant_id, source_phone;
```

### Active sessions

```sql
SELECT s.id, p.phone, s.label, s.status, s.last_sync
FROM whatsapp_sessions s
JOIN profiles p ON p.id = s.tenant_id
ORDER BY s.last_sync DESC;
```

---

## Deployment

See `DEPLOY.md` for full deployment procedure.

Quick reference:
```
git push origin main
# Then trigger redeploy in Coolify for affected services
```

### Redeploy Map

| Changed | Redeploy |
|---------|----------|
| `apps/api/**` | API |
| `apps/app/**` | App |
| `apps/www/**` | WWW |
| `apps/mcp/**` | MCP |
| `packages/price-parser/**` | API + WWW |
| `supabase/migrations/**` | Apply manually |

---

## Metrics & Monitoring

| Endpoint | Description |
|----------|-------------|
| `GET /api/whatsapp/health` | Connection health |
| `GET /api/whatsapp/health/detailed` | Per-session status |
| `GET /api/whatsapp/monitor` | Ingestion stall monitor |
| `GET /api/whatsapp/monitor/messages` | Message throughput |
| `GET /api/whatsapp/groups/health` | Per-group activity status |
| `GET /api/whatsapp/events?label=<label>` | Connection lifecycle events |
| `GET /api/whatsapp/support-logs?label=<label>` | Debug logs for support |

Stall detection: If no inbound messages for ≥30 minutes, the runtime status service logs a stall event and triggers a push notification alert to workspace admins.
