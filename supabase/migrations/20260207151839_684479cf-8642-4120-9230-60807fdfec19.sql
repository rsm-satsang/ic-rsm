-- Update has_project_access function to include task assignees
CREATE OR REPLACE FUNCTION public.has_project_access(_user_id uuid, _project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    LEFT JOIN public.collaborators c ON c.project_id = p.id AND c.user_id = _user_id
    LEFT JOIN public.user_tasks t ON t.project_id = p.id AND t.assigned_to = _user_id
    WHERE p.id = _project_id
    AND (p.owner_id = _user_id OR c.user_id = _user_id OR t.assigned_to = _user_id OR public.is_admin(_user_id))
  )
$function$;

-- Update projects SELECT policy to include task assignees
DROP POLICY IF EXISTS "Users can view their own projects" ON public.projects;

CREATE POLICY "Users can view their own projects" 
ON public.projects 
FOR SELECT
USING (
  (owner_id = auth.uid()) 
  OR is_admin(auth.uid()) 
  OR (EXISTS (
    SELECT 1 FROM collaborators
    WHERE collaborators.project_id = projects.id AND collaborators.user_id = auth.uid()
  ))
  OR (EXISTS (
    SELECT 1 FROM user_tasks
    WHERE user_tasks.project_id = projects.id AND user_tasks.assigned_to = auth.uid()
  ))
);