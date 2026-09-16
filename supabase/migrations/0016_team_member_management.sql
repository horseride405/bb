create policy "Admins can manage workspace members"
  on public.workspace_members for update
  using (public.is_workspace_admin(workspace_id))
  with check (
    public.is_workspace_admin(workspace_id)
    and role in ('admin', 'trader', 'viewer')
  );
