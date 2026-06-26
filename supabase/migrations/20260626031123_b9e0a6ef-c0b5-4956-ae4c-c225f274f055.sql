
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY channel, sub_channel, week_start_date
      ORDER BY updated_at DESC, created_at DESC
    ) AS rn
  FROM public.tracker_entries
)
DELETE FROM public.tracker_entries t
USING ranked r
WHERE t.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS tracker_entries_unique_week
  ON public.tracker_entries (channel, sub_channel, week_start_date);
