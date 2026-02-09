-- Drop existing SELECT and UPDATE policies on projects
DROP POLICY IF EXISTS "Users can view their own projects" ON public.projects;
DROP POLICY IF EXISTS "Project owners can update their projects" ON public.projects;

-- Create new policies for universal access
CREATE POLICY "All authenticated users can view all projects"
ON public.projects
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "All authenticated users can update all projects"
ON public.projects
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Also update collaborators visibility so users can see all collaborators
DROP POLICY IF EXISTS "Users can view collaborators of their projects" ON public.collaborators;

CREATE POLICY "All authenticated users can view all collaborators"
ON public.collaborators
FOR SELECT
TO authenticated
USING (true);

-- Update has_project_access function to always return true for authenticated users
CREATE OR REPLACE FUNCTION public.has_project_access(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id IS NOT NULL
$$;