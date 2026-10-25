ALTER TABLE public.weekly_newsletter_report_runs ADD COLUMN batch_key text NOT NULL DEFAULT 'weekly';
ALTER TABLE public.weekly_newsletter_report_runs DROP CONSTRAINT weekly_newsletter_report_runs_report_date_key;
ALTER TABLE public.weekly_newsletter_report_runs ADD CONSTRAINT weekly_report_date_batch_unique UNIQUE (report_date, batch_key);