CREATE TABLE public.weekly_newsletter_report_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 report_date date NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending',
 report_text text,
 recipient_count integer NOT NULL DEFAULT 0,
 sent_count integer NOT NULL DEFAULT 0,
 failed_count integer NOT NULL DEFAULT 0,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.weekly_newsletter_report_runs TO service_role;
ALTER TABLE public.weekly_newsletter_report_runs ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.weekly_newsletter_report_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL REFERENCES public.weekly_newsletter_report_runs(id),
 user_id uuid NOT NULL,
 status text NOT NULL,
 message_id text,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id, user_id)
);
GRANT ALL ON public.weekly_newsletter_report_deliveries TO service_role;
ALTER TABLE public.weekly_newsletter_report_deliveries ENABLE ROW LEVEL SECURITY;