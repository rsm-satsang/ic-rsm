-- Allow users with project access to update versions
CREATE POLICY "Users can update versions in accessible projects"
ON public.versions
FOR UPDATE
USING (has_project_access(auth.uid(), project_id))
WITH CHECK (has_project_access(auth.uid(), project_id));