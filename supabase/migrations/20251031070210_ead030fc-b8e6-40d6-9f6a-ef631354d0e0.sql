-- Row Level Security Policies for RSM InnerContent

-- ================================================
-- USERS TABLE POLICIES
-- ================================================

CREATE POLICY "Users can view their own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all users"
  ON public.users FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage all users"
  ON public.users FOR ALL
  USING (public.is_admin(auth.uid()));

-- ================================================
-- PROJECTS TABLE POLICIES
-- ================================================

CREATE POLICY "Users can view their own projects"
  ON public.projects FOR SELECT
  USING (
    owner_id = auth.uid() 
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.collaborators
      WHERE collaborators.project_id = projects.id
      AND collaborators.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Project owners can update their projects"
  ON public.projects FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.collaborators
      WHERE collaborators.project_id = projects.id
      AND collaborators.user_id = auth.uid()
      AND collaborators.access_level IN ('owner', 'editor')
    )
  );

CREATE POLICY "Project owners can delete their projects"
  ON public.projects FOR DELETE
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));

-- ================================================
-- VERSIONS TABLE POLICIES
-- ================================================

CREATE POLICY "Users can view versions of accessible projects"
  ON public.versions FOR SELECT
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can create versions in accessible projects"
  ON public.versions FOR INSERT
  WITH CHECK (
    public.has_project_access(auth.uid(), project_id)
    AND created_by = auth.uid()
  );

CREATE POLICY "Admins and editors can delete versions"
  ON public.versions FOR DELETE
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.projects p
      LEFT JOIN public.collaborators c ON c.project_id = p.id
      WHERE p.id = versions.project_id
      AND (p.owner_id = auth.uid() OR (c.user_id = auth.uid() AND c.access_level IN ('owner', 'editor')))
    )
  );

-- ================================================
-- COLLABORATORS TABLE POLICIES
-- ================================================

CREATE POLICY "Users can view collaborators of their projects"
  ON public.collaborators FOR SELECT
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Project owners and admins can add collaborators"
  ON public.collaborators FOR INSERT
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.collaborators c
      WHERE c.project_id = collaborators.project_id
      AND c.user_id = auth.uid()
      AND c.access_level = 'owner'
    )
  );

CREATE POLICY "Project owners and admins can remove collaborators"
  ON public.collaborators FOR DELETE
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
  );

-- ================================================
-- COMMENTS TABLE POLICIES
-- ================================================

CREATE POLICY "Users can view comments on accessible projects"
  ON public.comments FOR SELECT
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can create comments on accessible projects"
  ON public.comments FOR INSERT
  WITH CHECK (
    public.has_project_access(auth.uid(), project_id)
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can update their own comments"
  ON public.comments FOR UPDATE
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Users can delete their own comments"
  ON public.comments FOR DELETE
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- ================================================
-- TIMELINE TABLE POLICIES
-- ================================================

CREATE POLICY "Users can view timeline of accessible projects"
  ON public.timeline FOR SELECT
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "System can insert timeline events"
  ON public.timeline FOR INSERT
  WITH CHECK (
    public.has_project_access(auth.uid(), project_id)
  );

-- ================================================
-- FILES TABLE POLICIES
-- ================================================

CREATE POLICY "Users can view files of accessible projects"
  ON public.files FOR SELECT
  USING (
    project_id IS NULL 
    OR public.has_project_access(auth.uid(), project_id)
  );

CREATE POLICY "Users can upload files to accessible projects"
  ON public.files FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (project_id IS NULL OR public.has_project_access(auth.uid(), project_id))
  );

CREATE POLICY "Users can delete their uploaded files"
  ON public.files FOR DELETE
  USING (uploaded_by = auth.uid() OR public.is_admin(auth.uid()));

-- ================================================
-- VOCABULARIES TABLE POLICIES
-- ================================================

CREATE POLICY "Users can view vocabularies"
  ON public.vocabularies FOR SELECT
  USING (
    visibility = 'public'
    OR visibility = 'org'
    OR (visibility = 'project' AND public.has_project_access(auth.uid(), project_id))
    OR created_by = auth.uid()
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Users can create vocabularies"
  ON public.vocabularies FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (project_id IS NULL OR public.has_project_access(auth.uid(), project_id))
  );

CREATE POLICY "Users can update their vocabularies"
  ON public.vocabularies FOR UPDATE
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Users can delete their vocabularies"
  ON public.vocabularies FOR DELETE
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

-- ================================================
-- PROMPTS TABLE POLICIES
-- ================================================

CREATE POLICY "Users can view accessible prompts"
  ON public.prompts FOR SELECT
  USING (
    scope = 'org'
    OR (scope = 'user' AND created_by = auth.uid())
    OR (scope = 'project' AND scope_id IS NOT NULL AND public.has_project_access(auth.uid(), scope_id::uuid))
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Users can create prompts"
  ON public.prompts FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      scope = 'user'
      OR (scope = 'org' AND public.is_admin(auth.uid()))
      OR (scope = 'project' AND scope_id IS NOT NULL AND public.has_project_access(auth.uid(), scope_id::uuid))
    )
  );

CREATE POLICY "Users can update their prompts"
  ON public.prompts FOR UPDATE
  USING (
    created_by = auth.uid()
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Users can delete their prompts"
  ON public.prompts FOR DELETE
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

-- ================================================
-- AI_LOGS TABLE POLICIES
-- ================================================

CREATE POLICY "Users can view AI logs of accessible projects"
  ON public.ai_logs FOR SELECT
  USING (
    public.has_project_access(auth.uid(), project_id)
    OR created_by = auth.uid()
  );

CREATE POLICY "System can create AI logs"
  ON public.ai_logs FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND public.has_project_access(auth.uid(), project_id)
  );

-- ================================================
-- STATUS_HISTORY TABLE POLICIES
-- ================================================

CREATE POLICY "Users can view status history of accessible projects"
  ON public.status_history FOR SELECT
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "System can create status history"
  ON public.status_history FOR INSERT
  WITH CHECK (
    changed_by = auth.uid()
    AND public.has_project_access(auth.uid(), project_id)
  );

-- ================================================
-- INTEGRATIONS TABLE POLICIES (ADMIN-ONLY)
-- ================================================

CREATE POLICY "Only admins can view integrations"
  ON public.integrations FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Only admins can create integrations"
  ON public.integrations FOR INSERT
  WITH CHECK (
    public.is_admin(auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "Only admins can update integrations"
  ON public.integrations FOR UPDATE
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Only admins can delete integrations"
  ON public.integrations FOR DELETE
  USING (public.is_admin(auth.uid()));

-- ================================================
-- AUTO-ADD ADMIN COLLABORATORS TRIGGER
-- ================================================

CREATE OR REPLACE FUNCTION public.auto_add_admin_collaborators()
RETURNS TRIGGER AS $$
DECLARE
  _admin_user RECORD;
  _creator_role TEXT;
BEGIN
  -- Get the role of the project creator
  SELECT role INTO _creator_role
  FROM public.users
  WHERE id = NEW.owner_id;

  -- If creator is not admin, add all admins as collaborators
  IF _creator_role != 'admin' THEN
    FOR _admin_user IN
      SELECT id, name FROM public.users WHERE role = 'admin'
    LOOP
      -- Add admin as viewer collaborator
      INSERT INTO public.collaborators (project_id, user_id, access_level, added_by)
      VALUES (NEW.id, _admin_user.id, 'viewer', NEW.owner_id)
      ON CONFLICT (project_id, user_id) DO NOTHING;

      -- Log timeline event
      INSERT INTO public.timeline (project_id, event_type, event_details, user_id, user_name)
      VALUES (
        NEW.id,
        'collaborator_added',
        jsonb_build_object('user', _admin_user.name, 'role', 'viewer', 'auto_added', true),
        _admin_user.id,
        _admin_user.name
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER auto_add_admins_to_project
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.auto_add_admin_collaborators();