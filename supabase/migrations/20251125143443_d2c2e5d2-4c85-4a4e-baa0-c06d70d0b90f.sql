-- Allow users to view other users who are collaborators on projects they have access to
CREATE POLICY "Users can view project collaborators"
ON public.users
FOR SELECT
TO authenticated
USING (
  -- User can see themselves
  id = auth.uid()
  OR
  -- User is admin
  is_admin(auth.uid())
  OR
  -- User is viewing someone who is a collaborator on a project they have access to
  EXISTS (
    SELECT 1 FROM public.collaborators c1
    INNER JOIN public.collaborators c2 ON c1.project_id = c2.project_id
    WHERE c1.user_id = auth.uid()
    AND c2.user_id = users.id
  )
  OR
  -- User is viewing the owner of a project they have access to
  EXISTS (
    SELECT 1 FROM public.projects p
    INNER JOIN public.collaborators c ON c.project_id = p.id
    WHERE c.user_id = auth.uid()
    AND p.owner_id = users.id
  )
  OR
  -- User is viewing someone they invited
  EXISTS (
    SELECT 1 FROM public.invitations i
    WHERE i.invited_by = auth.uid()
    AND i.invited_user_id = users.id
  )
  OR
  -- User is viewing someone who invited them
  EXISTS (
    SELECT 1 FROM public.invitations i
    WHERE i.invited_user_id = auth.uid()
    AND i.invited_by = users.id
  )
);