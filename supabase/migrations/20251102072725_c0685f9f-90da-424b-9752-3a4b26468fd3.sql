-- Create a function to get invitation details with proper user and project info
CREATE OR REPLACE FUNCTION get_user_invitations(user_id uuid)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  invited_by uuid,
  access_level access_level,
  status invitation_status,
  created_at timestamptz,
  updated_at timestamptz,
  project_title text,
  project_description text,
  project_type project_type,
  inviter_name text,
  inviter_email text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    i.id,
    i.project_id,
    i.invited_by,
    i.access_level,
    i.status,
    i.created_at,
    i.updated_at,
    p.title as project_title,
    p.description as project_description,
    p.type as project_type,
    u.name as inviter_name,
    u.email as inviter_email
  FROM invitations i
  LEFT JOIN projects p ON i.project_id = p.id
  LEFT JOIN users u ON i.invited_by = u.id
  WHERE i.invited_user_id = user_id
  ORDER BY i.created_at DESC;
$$;