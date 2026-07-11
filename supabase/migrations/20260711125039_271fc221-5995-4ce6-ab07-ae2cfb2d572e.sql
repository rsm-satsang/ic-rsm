
-- help-videos bucket: authenticated read; admin write
CREATE POLICY "auth read help-videos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'help-videos');
CREATE POLICY "admin write help-videos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'help-videos' AND public.is_admin(auth.uid()));
CREATE POLICY "admin update help-videos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'help-videos' AND public.is_admin(auth.uid()));
CREATE POLICY "admin delete help-videos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'help-videos' AND public.is_admin(auth.uid()));

-- founder photo uses existing public project-images bucket; add admin-only writes for founder/ prefix
CREATE POLICY "admin write founder photo" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-images' AND (storage.foldername(name))[1] = 'founder' AND public.is_admin(auth.uid()));
CREATE POLICY "admin update founder photo" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'project-images' AND (storage.foldername(name))[1] = 'founder' AND public.is_admin(auth.uid()));
CREATE POLICY "admin delete founder photo" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'project-images' AND (storage.foldername(name))[1] = 'founder' AND public.is_admin(auth.uid()));
