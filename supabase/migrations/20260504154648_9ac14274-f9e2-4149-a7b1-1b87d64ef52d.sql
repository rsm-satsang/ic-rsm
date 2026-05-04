
-- Create project_images table to tag images to projects
CREATE TABLE public.project_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  image_url TEXT NOT NULL,
  storage_path TEXT,
  prompt TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.project_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view project images of accessible projects"
ON public.project_images FOR SELECT
USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can create project images in accessible projects"
ON public.project_images FOR INSERT
WITH CHECK (public.has_project_access(auth.uid(), project_id) AND created_by = auth.uid());

CREATE POLICY "Users can delete project images in accessible projects"
ON public.project_images FOR DELETE
USING (public.has_project_access(auth.uid(), project_id));

-- Storage bucket for generated project images (public so URLs render directly)
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-images', 'project-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view project images"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-images');

CREATE POLICY "Authenticated users can upload project images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'project-images');

CREATE POLICY "Authenticated users can delete project images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'project-images');
