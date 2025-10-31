-- Create invitation_status enum
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'rejected');

-- Create invitations table
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  invited_user_id UUID NOT NULL,
  invited_by UUID NOT NULL,
  access_level access_level NOT NULL DEFAULT 'viewer',
  status invitation_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, invited_user_id)
);

-- Enable RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view invitations sent to them
CREATE POLICY "Users can view their invitations"
ON public.invitations
FOR SELECT
USING (invited_user_id = auth.uid() OR invited_by = auth.uid() OR is_admin(auth.uid()));

-- Policy: Project owners can create invitations
CREATE POLICY "Project owners can create invitations"
ON public.invitations
FOR INSERT
WITH CHECK (
  invited_by = auth.uid() AND 
  (EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = project_id AND owner_id = auth.uid()
  ) OR is_admin(auth.uid()))
);

-- Policy: Invited users can update their invitations
CREATE POLICY "Invited users can update invitations"
ON public.invitations
FOR UPDATE
USING (invited_user_id = auth.uid())
WITH CHECK (invited_user_id = auth.uid());

-- Policy: Inviters can delete pending invitations
CREATE POLICY "Inviters can delete invitations"
ON public.invitations
FOR DELETE
USING (invited_by = auth.uid() OR is_admin(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_invitations_updated_at
BEFORE UPDATE ON public.invitations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to handle invitation acceptance
CREATE OR REPLACE FUNCTION public.accept_invitation(invitation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invitation RECORD;
  _user_name TEXT;
BEGIN
  -- Get invitation details
  SELECT * INTO _invitation
  FROM public.invitations
  WHERE id = invitation_id AND invited_user_id = auth.uid() AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or already processed';
  END IF;

  -- Update invitation status
  UPDATE public.invitations
  SET status = 'accepted', updated_at = NOW()
  WHERE id = invitation_id;

  -- Add user as collaborator
  INSERT INTO public.collaborators (project_id, user_id, access_level, added_by)
  VALUES (_invitation.project_id, _invitation.invited_user_id, _invitation.access_level, _invitation.invited_by)
  ON CONFLICT (project_id, user_id) DO UPDATE
  SET access_level = EXCLUDED.access_level;

  -- Get user name
  SELECT name INTO _user_name FROM public.users WHERE id = auth.uid();

  -- Log to timeline
  INSERT INTO public.timeline (project_id, event_type, event_details, user_id, user_name)
  VALUES (
    _invitation.project_id,
    'collaborator_added',
    jsonb_build_object('user', _user_name, 'role', _invitation.access_level, 'via_invitation', true),
    auth.uid(),
    COALESCE(_user_name, 'Unknown User')
  );
END;
$$;