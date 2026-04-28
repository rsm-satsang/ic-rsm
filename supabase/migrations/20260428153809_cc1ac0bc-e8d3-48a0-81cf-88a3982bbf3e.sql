DROP POLICY IF EXISTS "Users can view reference files in their projects" ON storage.objects;
CREATE POLICY "Authenticated can view project-references"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'project-references');

DROP POLICY IF EXISTS "Users can delete their reference files" ON storage.objects;
CREATE POLICY "Authenticated can delete project-references"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'project-references');

CREATE POLICY "Authenticated can update project-references"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'project-references');