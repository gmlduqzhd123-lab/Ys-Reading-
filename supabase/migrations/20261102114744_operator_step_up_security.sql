create function private.operator_step_up_recent() returns boolean language plpgsql stable security invoker set search_path='' as $$
declare claims jsonb;verified_at numeric;
begin
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}');
 if claims->>'aal' is distinct from 'aal2' then return false;end if;
 select max((x->>'timestamp')::numeric) into verified_at from jsonb_array_elements(coalesce(claims->'amr','[]'))x where x->>'method' in ('totp','phone','webauthn','recovery_code','mfa/totp','mfa/phone','mfa/webauthn','mfa/recovery_code') and x->>'timestamp' ~ '^[0-9]{1,12}$';
 return coalesce(verified_at>=extract(epoch from now()-interval '15 minutes') and verified_at<=extract(epoch from now()+interval '1 minute'),false);
 exception when others then return false;
end $$;
revoke all on function private.operator_step_up_recent() from public,anon;grant execute on function private.operator_step_up_recent() to authenticated,service_role;
create function private.require_operator_step_up() returns void language plpgsql stable security definer set search_path='' as $$
begin if not private.data_session() or not private.is_operator() then raise exception 'BF_FORBIDDEN';end if;if not private.operator_step_up_recent() then raise exception 'BF_MFA_REQUIRED';end if;end $$;
revoke all on function private.require_operator_step_up() from public,anon,authenticated;grant execute on function private.require_operator_step_up() to service_role;
create function public.operator_security_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not private.data_session() or not private.is_operator() then raise exception 'BF_FORBIDDEN';end if;return jsonb_build_object('recent',private.operator_step_up_recent(),'asOf',now());end $$;
revoke all on function public.operator_security_state() from public,anon;grant execute on function public.operator_security_state() to authenticated;
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.operations_command(text,jsonb,uuid)'::regprocedure);
 if position('op:=private.is_operator();' in definition)=0 then raise exception 'Operator command anchor missing';end if;
 definition:=replace(definition,'op:=private.is_operator();',$guard$op:=private.is_operator();
 if op and p_command in ('teacher_decide','account_status','class_handover','group_handover','consent_decide','consent_withdraw','deletion_decide','retention_set') then perform private.require_operator_step_up();end if;$guard$);execute definition;
 definition:=pg_get_functiondef('public.account_job_begin(text,jsonb,uuid,text)'::regprocedure);
 if position('select * into a from public.profiles where id=auth.uid() for update;' in definition)=0 then raise exception 'Account command anchor missing';end if;
 definition:=replace(definition,'select * into a from public.profiles where id=auth.uid() for update;',$guard$if p_kind='delete_account' and private.is_operator() then perform private.require_operator_step_up();end if;
 select * into a from public.profiles where id=auth.uid() for update;$guard$);execute definition;
end $$;
