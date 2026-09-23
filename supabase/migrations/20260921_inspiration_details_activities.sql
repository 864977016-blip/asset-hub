-- Add the only missing activity target needed for shared-material activity entries.
alter type public.activity_target add value if not exists 'shared_asset';
