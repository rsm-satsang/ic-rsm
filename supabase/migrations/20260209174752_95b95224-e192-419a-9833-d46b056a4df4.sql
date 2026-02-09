
-- Create themes table for user-created themes
CREATE TABLE public.themes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view themes
CREATE POLICY "All authenticated users can view themes"
ON public.themes FOR SELECT
USING (true);

-- Any authenticated user can create themes
CREATE POLICY "Authenticated users can create themes"
ON public.themes FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- Insert default "General" theme
INSERT INTO public.themes (name, created_by) VALUES ('General', '00000000-0000-0000-0000-000000000000');
