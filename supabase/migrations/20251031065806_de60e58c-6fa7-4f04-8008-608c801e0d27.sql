-- RSM InnerContent Database Schema

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create custom types
CREATE TYPE app_role AS ENUM ('admin', 'user');
CREATE TYPE project_type AS ENUM ('document', 'note', 'article', 'email');
CREATE TYPE project_status AS ENUM ('draft', 'in_progress', 'review', 'approved', 'published');
CREATE TYPE access_level AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE prompt_scope AS ENUM ('user', 'project', 'org');
CREATE TYPE vocab_visibility AS ENUM ('project', 'org', 'public');
CREATE TYPE event_type AS ENUM ('created', 'edited', 'ai_action', 'comment', 'status_change', 'version_created', 'collaborator_added', 'file_uploaded', 'vocab_added');

-- Users table (extends Supabase auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Projects table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  type project_type NOT NULL DEFAULT 'document',
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status project_status NOT NULL DEFAULT 'draft',
  language TEXT DEFAULT 'en',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Versions table
CREATE TABLE public.versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  title TEXT,
  description TEXT,
  content TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, version_number)
);

-- Collaborators table
CREATE TABLE public.collaborators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  access_level access_level NOT NULL DEFAULT 'viewer',
  added_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- Comments table
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_id UUID REFERENCES public.versions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  inline_reference JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Timeline table
CREATE TABLE public.timeline (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event_type event_type NOT NULL,
  event_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Files table
CREATE TABLE public.files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_vocabulary BOOLEAN DEFAULT FALSE,
  parsed_keywords JSONB,
  uploaded_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vocabularies table
CREATE TABLE public.vocabularies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT,
  parsed_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  visibility vocab_visibility NOT NULL DEFAULT 'project',
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prompts table
CREATE TABLE public.prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  scope prompt_scope NOT NULL,
  scope_id UUID,
  description TEXT,
  template TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI Logs table
CREATE TABLE public.ai_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_id UUID REFERENCES public.versions(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  compiled_prompt TEXT NOT NULL,
  response TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Status History table
CREATE TABLE public.status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  old_status project_status,
  new_status project_status NOT NULL,
  changed_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Integrations/Secrets table (for storing encrypted Gemini API key)
CREATE TABLE public.integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  value_encrypted TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_projects_owner ON public.projects(owner_id);
CREATE INDEX idx_projects_updated ON public.projects(updated_at DESC);
CREATE INDEX idx_projects_created ON public.projects(created_at DESC);
CREATE INDEX idx_versions_project ON public.versions(project_id, version_number DESC);
CREATE INDEX idx_versions_created ON public.versions(created_at DESC);
CREATE INDEX idx_collaborators_project ON public.collaborators(project_id);
CREATE INDEX idx_collaborators_user ON public.collaborators(user_id);
CREATE INDEX idx_comments_project ON public.comments(project_id);
CREATE INDEX idx_timeline_project ON public.timeline(project_id, created_at DESC);
CREATE INDEX idx_files_project ON public.files(project_id);
CREATE INDEX idx_vocabularies_project ON public.vocabularies(project_id);
CREATE INDEX idx_ai_logs_project ON public.ai_logs(project_id, created_at DESC);
CREATE INDEX idx_status_history_project ON public.status_history(project_id, changed_at DESC);

-- Enable Row Level Security on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocabularies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- Create helper functions
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = _user_id AND role = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.has_project_access(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    LEFT JOIN public.collaborators c ON c.project_id = p.id
    WHERE p.id = _project_id
    AND (p.owner_id = _user_id OR c.user_id = _user_id OR public.is_admin(_user_id))
  )
$$;

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vocabularies_updated_at BEFORE UPDATE ON public.vocabularies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_prompts_updated_at BEFORE UPDATE ON public.prompts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to auto-create initial version when project is created
CREATE OR REPLACE FUNCTION public.create_initial_version()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.versions (project_id, version_number, title, content, created_by)
  VALUES (NEW.id, 1, 'Initial version', '', NEW.owner_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_project_created
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.create_initial_version();

-- Trigger to add timeline event when project is created
CREATE OR REPLACE FUNCTION public.log_project_created()
RETURNS TRIGGER AS $$
DECLARE
  _user_name TEXT;
BEGIN
  SELECT name INTO _user_name FROM public.users WHERE id = NEW.owner_id;
  
  INSERT INTO public.timeline (project_id, event_type, event_details, user_id, user_name)
  VALUES (
    NEW.id,
    'created',
    jsonb_build_object('title', NEW.title, 'type', NEW.type),
    NEW.owner_id,
    COALESCE(_user_name, 'Unknown User')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_project_created_timeline
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.log_project_created();