-- Create table for user-specific version favorites
CREATE TABLE public.version_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  version_id UUID NOT NULL REFERENCES public.versions(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, version_id)
);

-- Enable RLS
ALTER TABLE public.version_favorites ENABLE ROW LEVEL SECURITY;

-- Users can view their own favorites
CREATE POLICY "Users can view their own favorites"
ON public.version_favorites
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own favorites
CREATE POLICY "Users can create their own favorites"
ON public.version_favorites
FOR INSERT
WITH CHECK (auth.uid() = user_id AND has_project_access(auth.uid(), project_id));

-- Users can delete their own favorites
CREATE POLICY "Users can delete their own favorites"
ON public.version_favorites
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_version_favorites_user_id ON public.version_favorites(user_id);
CREATE INDEX idx_version_favorites_version_id ON public.version_favorites(version_id);