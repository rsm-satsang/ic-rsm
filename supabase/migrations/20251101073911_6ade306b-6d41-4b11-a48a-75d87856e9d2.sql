-- Update storage policy to allow all authenticated users to view all vocabulary files
DROP POLICY IF EXISTS "Users can view their vocabulary files" ON storage.objects;

CREATE POLICY "All users can view vocabulary files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'vocabulary-files');