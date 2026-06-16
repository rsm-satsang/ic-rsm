
-- PHASE 2
CREATE TYPE public.tracker_channel AS ENUM ('substack_satsang','substack_lifequest','youtube');
CREATE TYPE public.tracker_sub_channel AS ENUM ('newsletter','long_form','shorts');
CREATE TYPE public.tracker_status AS ENUM ('published','draft','not_published','tbd','not_applicable');

CREATE TABLE public.tracker_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel public.tracker_channel NOT NULL,
  sub_channel public.tracker_sub_channel NOT NULL DEFAULT 'newsletter',
  week_start_date date NOT NULL,
  title text,
  publish_date date,
  theme_id uuid REFERENCES public.themes(id) ON DELETE SET NULL,
  assignee_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status public.tracker_status NOT NULL DEFAULT 'tbd',
  due_date date,
  notes text,
  source text NOT NULL DEFAULT 'manual',
  source_url text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX tracker_entries_unique_slot
  ON public.tracker_entries (channel, sub_channel, week_start_date, COALESCE(source_url, ''));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_entries TO authenticated;
GRANT ALL ON public.tracker_entries TO service_role;
ALTER TABLE public.tracker_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tracker_read_all" ON public.tracker_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "tracker_write_all" ON public.tracker_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_tracker_entries_updated
  BEFORE UPDATE ON public.tracker_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PHASE 3
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS mentions uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'version';

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  type text NOT NULL,
  entity_type text,
  entity_id uuid,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  message text NOT NULL,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_own_read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_own_update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_insert_auth" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "notif_own_delete" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX idx_notifications_user_unread ON public.notifications (user_id, read_at, created_at DESC);

-- PHASE 4
CREATE TYPE public.approval_status AS ENUM ('pending_email','pending_approval','approved','rejected','suspended');

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS approval_status public.approval_status NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_notes text;

CREATE TABLE public.user_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  target_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.user_audit_log TO authenticated;
GRANT ALL ON public.user_audit_log TO service_role;
ALTER TABLE public.user_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_admin_read" ON public.user_audit_log FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "audit_admin_insert" ON public.user_audit_log FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.users (id, name, email, role, approval_status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'user',
    'pending_approval'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE POLICY "users_admin_update_all" ON public.users
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
