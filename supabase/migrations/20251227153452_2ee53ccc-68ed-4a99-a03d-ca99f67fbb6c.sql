-- Allow all authenticated users to view other users for collaboration/invitation purposes
CREATE POLICY "Authenticated users can search users for collaboration"
ON public.users
FOR SELECT
TO authenticated
USING (true);