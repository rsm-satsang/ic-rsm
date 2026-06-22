
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS content_roles text[] NOT NULL DEFAULT '{}';

UPDATE public.users SET content_roles = ARRAY['builder']::text[]
  WHERE name IN ('Arvind') OR email IN ('drrajatnog@yahoo.com','drrajatnog@hotmail.com');

UPDATE public.users SET content_roles = ARRAY['operator']::text[]
  WHERE email = 'meenakshi.anurag@yahoo.com';

UPDATE public.users SET content_roles = ARRAY['planner']::text[]
  WHERE email = 'narayan.shiv@gmail.com';
