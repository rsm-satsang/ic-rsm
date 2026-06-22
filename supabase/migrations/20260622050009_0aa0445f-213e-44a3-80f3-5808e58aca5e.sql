
ALTER TYPE public.tracker_status ADD VALUE IF NOT EXISTS 'planning_assigned';
ALTER TYPE public.tracker_status ADD VALUE IF NOT EXISTS 'plan_complete';
ALTER TYPE public.tracker_status ADD VALUE IF NOT EXISTS 'build_assigned';
ALTER TYPE public.tracker_status ADD VALUE IF NOT EXISTS 'build_in_progress';
ALTER TYPE public.tracker_status ADD VALUE IF NOT EXISTS 'operate_assigned';
ALTER TYPE public.tracker_status ADD VALUE IF NOT EXISTS 'publish_complete';

ALTER TABLE public.tracker_entries
  ADD COLUMN IF NOT EXISTS plan_assignee_id uuid,
  ADD COLUMN IF NOT EXISTS plan_due_date date,
  ADD COLUMN IF NOT EXISTS theme_text text,
  ADD COLUMN IF NOT EXISTS plan_comments text,
  ADD COLUMN IF NOT EXISTS build_assignee_id uuid,
  ADD COLUMN IF NOT EXISTS build_due_date date,
  ADD COLUMN IF NOT EXISTS draft_title text,
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS operate_assignee_id uuid,
  ADD COLUMN IF NOT EXISTS operate_due_date date,
  ADD COLUMN IF NOT EXISTS substack_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS youtube_published boolean NOT NULL DEFAULT false;
