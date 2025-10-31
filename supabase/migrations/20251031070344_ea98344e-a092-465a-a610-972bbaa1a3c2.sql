-- Fix function search path security issue

-- Drop and recreate update_updated_at_column with proper search_path
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Recreate all triggers that use this function
CREATE TRIGGER update_users_updated_at 
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at 
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_comments_updated_at 
BEFORE UPDATE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vocabularies_updated_at 
BEFORE UPDATE ON public.vocabularies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_prompts_updated_at 
BEFORE UPDATE ON public.prompts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at 
BEFORE UPDATE ON public.integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();