-- Create storage bucket for project reference files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('project-references', 'project-references', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for project-references bucket
CREATE POLICY "Users can upload reference files to their projects"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-references'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view reference files in their projects"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'project-references'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their reference files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-references'
  AND auth.uid()::text = (storage.foldername(name))[1]
);