-- Create storage bucket for vocabulary files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vocabulary-files',
  'vocabulary-files',
  false,
  5242880, -- 5MB limit
  ARRAY['text/plain', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for vocabulary-files bucket
CREATE POLICY "Users can upload vocabulary files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'vocabulary-files' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their vocabulary files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'vocabulary-files' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their vocabulary files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'vocabulary-files' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their vocabulary files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'vocabulary-files' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Update vocabularies table RLS to allow global visibility
DROP POLICY IF EXISTS "Users can view vocabularies" ON vocabularies;

CREATE POLICY "All authenticated users can view vocabularies"
ON vocabularies
FOR SELECT
TO authenticated
USING (true);