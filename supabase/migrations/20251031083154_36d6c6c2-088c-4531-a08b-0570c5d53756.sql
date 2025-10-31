-- Add gemini_api_key column to users table for storing user's API key
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;