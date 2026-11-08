create table private.recovery_rehearsals(id uuid primary key default gen_random_uuid(),target_ref text not null check(target_ref ~ '^[a-z0-9]{20}$' and target_ref<>'rbtqtkjnqtcnljvabisa'),steps jsonb not null,revision integer not null default 1,actor_id uuid not null references public.profiles(id),updated_at timestamptz not null default now(),request_id uuid not null unique);
alter table private.recovery_rehearsals enable row level security;
revoke all on private.recovery_rehearsals from public,anon,authenticated,service_role;

create function public.operator_recovery_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.data_session() or not private.is_operator() then raise exception 'BF_FORBIDDEN';end if;
 return jsonb_build_object('asOf',now(),'operatorCount',(select count(*) from private.operators o join public.profiles p on p.id=o.user_id where p.account_active),
 'pendingEmails',coalesce((select jsonb_agg(jsonb_build_object('email',email,'expiresAt',expires_at)) from private.operator_email_invitations where claimed_at is null and expires_at>now()),'[]'),
 'rehearsals',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,target_ref,steps,revision,updated_at from private.recovery_rehearsals order by updated_at desc limit 10)x),'[]'));
end $$;
revoke all on function public.operator_recovery_state() from public,anon;
grant execute on function public.operator_recovery_state() to authenticated;

create function public.operator_recovery_check(p_target text,p_steps jsonb,p_id uuid default null,p_revision integer default 0,p_request uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.recovery_rehearsals;begin
 perform private.require_operator_step_up();
 if p_target is null or p_target !~ '^[a-z0-9]{20}$' or p_target='rbtqtkjnqtcnljvabisa' or p_request is null or p_revision is null or p_revision<0 or jsonb_typeof(p_steps) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_steps))<>8 or not(p_steps ?& array['backup','database','authentication','mfa','permissions','privacy','worker','google']) or exists(select 1 from jsonb_each(p_steps) x where jsonb_typeof(x.value)<>'boolean') then raise exception 'BF_INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended('recovery-check:'||p_target,0));
 select * into r from private.recovery_rehearsals where request_id=p_request;
 if found then if r.target_ref<>p_target or r.steps<>p_steps or r.actor_id<>auth.uid() then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;return jsonb_build_object('id',r.id,'revision',r.revision,'source','operator_confirmation');end if;
 if p_id is null then
 insert into private.recovery_rehearsals(target_ref,steps,actor_id,request_id) values(p_target,p_steps,auth.uid(),p_request) returning * into r;
 else
 update private.recovery_rehearsals set steps=p_steps,revision=revision+1,actor_id=auth.uid(),updated_at=clock_timestamp(),request_id=p_request where id=p_id and target_ref=p_target and revision=p_revision returning * into r;
 if not found then raise exception 'BF_STALE_REVISION';end if;end if;
 perform private.ops_audit('recovery_check_recorded');
 return jsonb_build_object('id',r.id,'revision',r.revision,'source','operator_confirmation');
end $$;
revoke all on function public.operator_recovery_check(text,jsonb,uuid,integer,uuid) from public,anon;
grant execute on function public.operator_recovery_check(text,jsonb,uuid,integer,uuid) to authenticated;

-- A reserved email proves owner authorization, not recipient control of the
-- account. Additional operators must confirm email and recent MFA themselves.
create or replace function public.complete_operator_email_setup() returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles;v_email text;verified_at timestamptz;inv private.operator_email_invitations;begin
 if auth.uid() is null or not private.session_ok(false) then raise exception 'BF_ACCOUNT_BLOCKED';end if;
 select * into p from public.profiles where id=auth.uid() for update;
 select lower(u.email),u.email_confirmed_at into v_email,verified_at from auth.users u where u.id=p.id;
 if verified_at is null or v_email is null then return jsonb_build_object('claimed',false);end if;
 select * into inv from private.operator_email_invitations where email=v_email for update;
 if not found then return jsonb_build_object('claimed',false);end if;
 if inv.claimed_by is not null then return jsonb_build_object('claimed',inv.claimed_by=p.id and private.is_operator());end if;
 if inv.expires_at<=clock_timestamp() or exists(select 1 from public.enrollments where student_id=p.id) or exists(select 1 from private.managed_accounts where student_id=p.id) then return jsonb_build_object('claimed',false);end if;
 update public.profiles set role='teacher',display_name=inv.display_name where id=p.id;
 if exists(select 1 from private.operators) and not private.operator_step_up_recent() then return jsonb_build_object('claimed',false,'requiresMfa',true);end if;
 insert into private.operators(user_id) values(p.id) on conflict do nothing;
 update private.operator_email_invitations set claimed_by=p.id,claimed_at=clock_timestamp() where email=inv.email;
 perform private.ops_audit('operator_email_verified',p.id);
 return jsonb_build_object('claimed',true);
end $$;

create function public.operator_invitation_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.session_ok(false) then raise exception 'BF_ACCOUNT_BLOCKED';end if;
 return jsonb_build_object('pending',exists(select 1 from private.operator_email_invitations i join auth.users u on lower(u.email)=i.email where u.id=auth.uid() and u.email_confirmed_at is not null and i.claimed_at is null and i.expires_at>now() and not exists(select 1 from private.managed_accounts where student_id=auth.uid()) and not exists(select 1 from public.enrollments where student_id=auth.uid())));
end $$;
revoke all on function public.operator_invitation_status() from public,anon;
grant execute on function public.operator_invitation_status() to authenticated;
