create or replace function public.accept_workspace_invitation(
  invitation_id uuid,
  invitation_token_digest text
)
returns setof public.workspace_members
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.workspace_invitations;
  member public.workspace_members;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select *
    into invitation
    from public.workspace_invitations
   where id = invitation_id
     and token_digest = invitation_token_digest
     and accepted_at is null
     and expires_at > now()
   for update;
  if invitation.id is null then
    raise exception 'Invitation is invalid or expired';
  end if;
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> lower(invitation.email) then
    raise exception 'Invitation email does not match authenticated user';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (invitation.workspace_id, auth.uid(), invitation.role)
  on conflict (workspace_id, user_id)
  do update set role = excluded.role
  returning * into member;
  update public.workspace_invitations
     set accepted_at = now()
   where id = invitation.id;
  return next member;
end;
$$;

revoke execute on function public.accept_workspace_invitation(uuid, text) from public;
grant execute on function public.accept_workspace_invitation(uuid, text) to authenticated;
