-- Project owners reserve exact emails through the trusted management connection.
-- No password, signup metadata, or client-supplied email can grant a role.
create table private.operator_email_invitations (
 email text primary key check(email=lower(btrim(email)) and length(email) between 3 and 254),
 display_name text not null check(length(btrim(display_name)) between 1 and 40),
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 claimed_by uuid,
 claimed_at timestamptz,
 check((claimed_by is null)=(claimed_at is null))
);
alter table private.operator_email_invitations enable row level security;
revoke all on private.operator_email_invitations from public,anon,authenticated;

create function public.complete_operator_email_setup() returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.profiles; v_email text; verified_at timestamptz; invitation private.operator_email_invitations;
begin
 if auth.uid() is null or not private.session_ok(false) then raise exception 'BF_ACCOUNT_BLOCKED'; end if;
 select * into p from public.profiles where id=auth.uid() for update;
 select lower(u.email),u.email_confirmed_at into v_email,verified_at from auth.users u where u.id=p.id;
 if verified_at is null or v_email is null then return jsonb_build_object('claimed',false); end if;
 select * into invitation from private.operator_email_invitations i where i.email=v_email for update;
 if not found then return jsonb_build_object('claimed',false); end if;
 if invitation.claimed_by is not null then
 -- A consumed invitation never restores a role revoked later by the owner.
 return jsonb_build_object('claimed',invitation.claimed_by=p.id and private.is_operator());
 end if;
 if invitation.expires_at<=clock_timestamp() or exists(select 1 from public.enrollments where student_id=p.id)
 or exists(select 1 from private.managed_accounts where student_id=p.id) then return jsonb_build_object('claimed',false); end if;
 update public.profiles set role='teacher',display_name=invitation.display_name where id=p.id;
 insert into private.operators(user_id) values(p.id) on conflict do nothing;
 update private.operator_email_invitations set claimed_by=p.id,claimed_at=clock_timestamp() where operator_email_invitations.email=invitation.email;
 insert into private.operations_audit(actor_id,subject_id,event) values(p.id,p.id,'operator_email_verified');
 return jsonb_build_object('claimed',true);
end $$;
revoke all on function public.complete_operator_email_setup() from public,anon;
grant execute on function public.complete_operator_email_setup() to authenticated;
