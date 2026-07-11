
CREATE TABLE public.content_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type TEXT,
  url TEXT,
  publish_date DATE,
  title TEXT,
  transcript TEXT,
  extra JSONB DEFAULT '{}'::jsonb,
  source_file_path TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_items TO authenticated;
GRANT ALL ON public.content_items TO service_role;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all content_items" ON public.content_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.sops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  content_type TEXT,
  owner TEXT,
  version TEXT,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  file_path TEXT,
  file_name TEXT,
  file_mime TEXT,
  file_size BIGINT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sops TO authenticated;
GRANT ALL ON public.sops TO service_role;
ALTER TABLE public.sops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all sops" ON public.sops FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER content_items_updated BEFORE UPDATE ON public.content_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER sops_updated BEFORE UPDATE ON public.sops FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
