
ALTER TABLE public.tracker_entries
  ADD COLUMN IF NOT EXISTS plan_assignee_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS build_assignee_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS operate_assignee_ids uuid[] NOT NULL DEFAULT '{}';

UPDATE public.tracker_entries
   SET plan_assignee_ids = ARRAY[plan_assignee_id]
 WHERE plan_assignee_id IS NOT NULL
   AND (plan_assignee_ids IS NULL OR array_length(plan_assignee_ids,1) IS NULL);

UPDATE public.tracker_entries
   SET build_assignee_ids = ARRAY[build_assignee_id]
 WHERE build_assignee_id IS NOT NULL
   AND (build_assignee_ids IS NULL OR array_length(build_assignee_ids,1) IS NULL);

UPDATE public.tracker_entries
   SET operate_assignee_ids = ARRAY[operate_assignee_id]
 WHERE operate_assignee_id IS NOT NULL
   AND (operate_assignee_ids IS NULL OR array_length(operate_assignee_ids,1) IS NULL);
