-- Remove gemini_api_key column from users table
-- Keys will now be stored in Supabase Secrets and accessed via edge functions

ALTER TABLE public.users DROP COLUMN IF EXISTS gemini_api_key;