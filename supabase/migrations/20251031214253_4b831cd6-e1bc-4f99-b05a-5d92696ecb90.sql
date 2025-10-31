-- Enable realtime for versions table
ALTER TABLE public.versions REPLICA IDENTITY FULL;

-- Add versions table to realtime publication if not already added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'versions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.versions;
  END IF;
END $$;