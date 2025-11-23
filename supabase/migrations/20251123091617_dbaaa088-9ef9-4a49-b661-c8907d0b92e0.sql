-- Fix storage RLS policy to allow project-based uploads
drop policy if exists "Users can upload files to project-references" on storage.objects;

create policy "Users can upload files to project-references"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'project-references'
  and (
    -- Allow if user has access to the project (first folder is project_id)
    exists (
      select 1 from projects p
      where p.id::text = (storage.foldername(name))[1]
      and (
        p.owner_id = auth.uid()
        or exists (
          select 1 from collaborators c
          where c.project_id = p.id
          and c.user_id = auth.uid()
        )
        or exists (
          select 1 from users u
          where u.id = auth.uid()
          and u.role = 'admin'
        )
      )
    )
  )
);