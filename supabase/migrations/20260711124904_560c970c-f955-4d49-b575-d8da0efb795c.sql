
-- Founder content (photo + vision note)
CREATE TABLE public.founder_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_url TEXT,
  vision_note TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.founder_content TO authenticated;
GRANT ALL ON public.founder_content TO service_role;
ALTER TABLE public.founder_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read founder_content" ON public.founder_content FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write founder_content" ON public.founder_content FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Founder messages (cards)
CREATE TABLE public.founder_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  message_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.founder_messages TO authenticated;
GRANT ALL ON public.founder_messages TO service_role;
ALTER TABLE public.founder_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read founder_messages" ON public.founder_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write founder_messages" ON public.founder_messages FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Help FAQs
CREATE TABLE public.help_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.help_faqs TO authenticated;
GRANT ALL ON public.help_faqs TO service_role;
ALTER TABLE public.help_faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read help_faqs" ON public.help_faqs FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write help_faqs" ON public.help_faqs FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Help videos
CREATE TABLE public.help_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  video_url TEXT,
  storage_path TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.help_videos TO authenticated;
GRANT ALL ON public.help_videos TO service_role;
ALTER TABLE public.help_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read help_videos" ON public.help_videos FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write help_videos" ON public.help_videos FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- updated_at triggers
CREATE TRIGGER trg_founder_content_updated BEFORE UPDATE ON public.founder_content
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_founder_messages_updated BEFORE UPDATE ON public.founder_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_help_faqs_updated BEFORE UPDATE ON public.help_faqs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_help_videos_updated BEFORE UPDATE ON public.help_videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
