
CREATE POLICY "auth read content-store" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'content-store');
CREATE POLICY "auth write content-store" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'content-store');
CREATE POLICY "auth update content-store" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'content-store');
CREATE POLICY "auth delete content-store" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'content-store');

CREATE POLICY "auth read sop-files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'sop-files');
CREATE POLICY "auth write sop-files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'sop-files');
CREATE POLICY "auth update sop-files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'sop-files');
CREATE POLICY "auth delete sop-files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'sop-files');
