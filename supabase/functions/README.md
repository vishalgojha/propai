# Background Workers

These Supabase Edge Functions power the broker automation workers for PropAI Pulse:

- `lead-scorer`
- `follow-up-scheduler`
- `site-visit-reminder`
- `market-pulse`
- `lead-reengagement`

## Deploy

1. Log into the linked project:
   ```bash
   supabase login
   supabase link --project-ref wnrwntumacbirbndfvwg
   ```

2. Set the function secrets:
   ```bash
   supabase secrets set SUPABASE_URL=https://wnrwntumacbirbndfvwg.supabase.co
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
   supabase secrets set OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY
   supabase secrets set OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
   supabase secrets set OPENROUTER_MODEL=openai/gpt-4o-mini
   supabase secrets set APP_URL=https://app.propai.live
   ```

3. Deploy the worker functions:
   ```bash
   supabase functions deploy lead-scorer
   supabase functions deploy follow-up-scheduler
   supabase functions deploy site-visit-reminder
   supabase functions deploy market-pulse
   supabase functions deploy lead-reengagement
   ```

4. Push the SQL migration:
   ```bash
   supabase db push
   ```

5. Verify the schedules:
   - Check `cron.job` in the SQL editor
   - Check `worker_logs` after the first run
   - Check `outbound_message_queue` for queued WhatsApp payloads

## Notes

- The cron expressions are stored in UTC, with the weekly/daily IST jobs converted already:
  - Monday 9:00 AM IST = `30 3 * * 1`
  - Daily 10:00 AM IST = `30 4 * * *`
- Workers only write to `outbound_message_queue`.
- Baileys remains the only layer that should actually send WhatsApp messages.
