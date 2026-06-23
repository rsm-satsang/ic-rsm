
CREATE TABLE public.tracker_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  sub_channel text NOT NULL,
  week_start_date date NOT NULL,
  tracker_entry_id uuid,
  user_id uuid,
  user_name text,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.tracker_activity TO authenticated;
GRANT ALL ON public.tracker_activity TO service_role;

ALTER TABLE public.tracker_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tracker activity"
  ON public.tracker_activity FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert tracker activity"
  ON public.tracker_activity FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_tracker_activity_week ON public.tracker_activity (channel, sub_channel, week_start_date, created_at DESC);
CREATE INDEX idx_tracker_activity_entry ON public.tracker_activity (tracker_entry_id, created_at DESC);
