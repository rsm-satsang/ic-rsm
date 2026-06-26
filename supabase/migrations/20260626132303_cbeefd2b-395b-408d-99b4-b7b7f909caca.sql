
-- Trigger: when a profile row is removed, also remove the auth user so the email can sign up again
CREATE OR REPLACE FUNCTION public.delete_auth_user_on_profile_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_auth_user_on_profile_delete ON public.users;
CREATE TRIGGER trg_delete_auth_user_on_profile_delete
AFTER DELETE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.delete_auth_user_on_profile_delete();

-- Backfill: for any auth.users that has no matching profile row (because it was deleted),
-- remove the auth row so the person can sign up fresh.
DELETE FROM auth.users a
WHERE NOT EXISTS (SELECT 1 FROM public.users p WHERE p.id = a.id);
