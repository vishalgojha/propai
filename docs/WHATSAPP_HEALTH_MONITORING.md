# WhatsApp Health Monitoring - Ops Guide

## Overview
PropAI Pulse now includes comprehensive WhatsApp connection monitoring with automatic reconnection capabilities.

## Connection Resilience
**Exponential Backoff Reconnection** (`WhatsAppClient.ts`):
- Reconnect attempts: 0 → 10
- Backoff timing: 2s → 4s → 8s → 16s → ... → max 30s
- Auto-reset on successful connection
- Timer cleanup on manual disconnect

## Health Endpoints

### `/api/whatsapp/health` (Existing)
Returns basic ingestion health per session:
```json
{
  "sessions": [...],
  "summary": {
    "groupCount": 5,
    "activeGroups24h": 3,
    "messagesReceived24h": 150,
    "parserSuccessRate": 95,
    "healthState": "healthy"
  }
}
```

### `/api/whatsapp/health/detailed` (NEW)
Operations-grade monitoring with reconnect status:
```json
{
  "success": true,
  "timestamp": "2026-04-30T10:30:00Z",
  "health": { /* basic health */ },
  "sessions": [
    {
      "label": "Owner-9876543210",
      "status": "connecting",
      "liveData": {
        "reconnectAttempts": 3,
        "isReconnecting": true
      }
    }
  ],
  "events": [ /* last 50 events */ ],
  "ops": {
    "totalSessions": 2,
    "connectedSessions": 1,
    "reconnectingSessions": 1,
    "totalReconnectAttempts": 3,
    "healthState": "warning"
  }
}
```

## Monitoring Dashboard Metrics

### Key Alerts
| Condition | Severity | Action |
|-----------|----------|--------|
| `reconnectAttempts >= 5` | Warning | Check WhatsApp API status |
| `reconnectAttempts >= 10` | Critical | Session exhausted, manual intervention |
| `healthState === 'critical'` | Critical | Check parser/injection pipeline |
| `parserSuccessRate < 80%` | Warning | Review message format changes |

### Proactive Checks
```bash
# Check reconnecting sessions
curl -H "Authorization: Bearer $TOKEN" \
  https://api.propai.com/api/whatsapp/health/detailed \
  | jq '.ops.reconnectingSessions'

# Get session-level reconnect status
curl -H "Authorization: Bearer $TOKEN" \
  https://api.propai.com/api/whatsapp/status \
  | jq '.sessions[] | select(.isReconnecting == true)'
```

## Multi-Number Support

### Architecture
- **Session Key**: `${tenantId}:${sessionLabel}`
- **Isolation**: Each phone number = separate Baileys socket
- **Filtering**: All stream/monitor/inbox APIs accept `?sessionLabel=...`

### Usage Patterns
```bash
# List items from specific number
GET /api/channels/stream?sessionLabel=Owner-9876543210

# Monitor specific number
GET /api/whatsapp/monitor?sessionLabel=Owner-1234567890

# Check status of all numbers
GET /api/whatsapp/status
```

## Troubleshooting Guide

### Session Stuck in "Reconnecting"
1. Check attempt count: `GET /api/whatsapp/health/detailed`
2. If `reconnectAttempts >= 10`: Session exhausted
3. Fix: Disconnect and reconnect manually
   ```bash
   POST /api/whatsapp/disconnect
   { "label": "Owner-9876543210" }
   ```

### Parser Failures
1. Check `parserSuccessRate` in health endpoint
2. Review recent events: `GET /api/whatsapp/events`
3. Common cause: WhatsApp message format changes

### Connection Drops
- Normal: Network blips (auto-reconnects within 30s)
- Abnormal: >10 reconnects or `loggedOut` status
- Action: Verify phone number still has WhatsApp active

## Circuit Breaker (Next Sprint)
- Planned: Auto-disable reconnection if WhatsApp API returns 5xx
- Currently: Unlimited retries until `maxReconnectAttempts` (10)

## Business Impact
- **Before**: Silent disconnects → broker churn
- **After**: Visible "reconnecting (3/10)" → broker trust
- **Metric**: Track `reconnectingSessions` → support ticket reduction

---
**CTO Directive**: Monitor `ops.reconnectingSessions` daily. If >5% of sessions reconnecting, escalate to engineering.
