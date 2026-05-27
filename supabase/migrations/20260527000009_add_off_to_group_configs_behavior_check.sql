-- Allow 'Off' as a valid behavior value for group_configs
-- The code sets behavior to 'Off' when a group is toggled off for parsing,
-- but the check constraint only allowed ('Listen', 'AutoReply', 'Broadcast').

alter table group_configs
  drop constraint if exists group_configs_behavior_check;

alter table group_configs
  add constraint group_configs_behavior_check
  check (behavior in ('Listen', 'AutoReply', 'Broadcast', 'Off'));
