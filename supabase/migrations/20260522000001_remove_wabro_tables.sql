-- Drop WaBro feature tables
-- WaBro Android app has been removed; broadcast campaigns now route through the web UI.

DROP TABLE IF EXISTS wabro_message_status_events;
DROP TABLE IF EXISTS wabro_device_registrations;
DROP TABLE IF EXISTS wabro_device_send_progress;
DROP TABLE IF EXISTS wabro_devices;
DROP TABLE IF EXISTS wabro_send_logs;
DROP TABLE IF EXISTS wabro_campaign_contacts;
DROP TABLE IF EXISTS wabro_contacts;
DROP TABLE IF EXISTS wabro_campaigns;

-- Drop the trigger function if it still exists
DROP FUNCTION IF EXISTS set_wabro_device_registration_updated_at;
