-- Create status enum for tasks
CREATE TYPE public.task_status AS ENUM ('pending', 'in_progress', 'completed');

-- Create version_notes table for notes on versions
CREATE TABLE public.version_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID REFERENCES public.versions(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create user_tasks table for task assignments
CREATE TABLE public.user_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  version_id UUID REFERENCES public.versions(id) ON DELETE SET NULL,
  note_id UUID REFERENCES public.version_notes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  status public.task_status DEFAULT 'pending' NOT NULL,
  due_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.version_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies for version_notes
CREATE POLICY "Users can view notes of accessible projects"
ON public.version_notes FOR SELECT
USING (has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can create notes in accessible projects"
ON public.version_notes FOR INSERT
WITH CHECK (has_project_access(auth.uid(), project_id) AND created_by = auth.uid());

CREATE POLICY "Users can update their own notes"
ON public.version_notes FOR UPDATE
USING (created_by = auth.uid() OR is_admin(auth.uid()));

CREATE POLICY "Users can delete their own notes"
ON public.version_notes FOR DELETE
USING (created_by = auth.uid() OR is_admin(auth.uid()));

-- RLS policies for user_tasks
CREATE POLICY "Users can view tasks in accessible projects or assigned to them"
ON public.user_tasks FOR SELECT
USING (has_project_access(auth.uid(), project_id) OR assigned_to = auth.uid());

CREATE POLICY "Users can create tasks in accessible projects"
ON public.user_tasks FOR INSERT
WITH CHECK (has_project_access(auth.uid(), project_id) AND assigned_by = auth.uid());

CREATE POLICY "Users can update tasks they created or are assigned to"
ON public.user_tasks FOR UPDATE
USING (assigned_by = auth.uid() OR assigned_to = auth.uid() OR is_admin(auth.uid()));

CREATE POLICY "Users can delete tasks they created"
ON public.user_tasks FOR DELETE
USING (assigned_by = auth.uid() OR is_admin(auth.uid()));

-- Create indexes for performance
CREATE INDEX idx_version_notes_version_id ON public.version_notes(version_id);
CREATE INDEX idx_version_notes_project_id ON public.version_notes(project_id);
CREATE INDEX idx_user_tasks_assigned_to ON public.user_tasks(assigned_to);
CREATE INDEX idx_user_tasks_project_id ON public.user_tasks(project_id);
CREATE INDEX idx_user_tasks_note_id ON public.user_tasks(note_id);

-- Trigger for updated_at
CREATE TRIGGER update_version_notes_updated_at
BEFORE UPDATE ON public.version_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_tasks_updated_at
BEFORE UPDATE ON public.user_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();