create table private.backup_copy_checks(id uuid primary key,verified_at timestamptz not null,backup_digest text not null check(backup_digest ~ '^[a-f0-9]{64}$'),location_kind text not null check(location_kind in('same_pc','other_volume','removable','network')),bytes bigint not null check(bytes>0));
alter table private.backup_copy_checks enable row level security;
revoke all on private.backup_copy_checks from public,anon,authenticated,service_role;

create or replace function public.service_backup_health() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare verified timestamptz;attempt private.backup_attempts;agent private.backup_agents;code text:='OK';backup_ok boolean;agent_ok boolean;begin
 select max(verified_at) into verified from private.backup_runs;
 select * into attempt from private.backup_attempts order by started_at desc,id limit 1;
 select * into agent from private.backup_agents where active order by last_seen_at desc nulls last,id limit 1;
 if verified is null then code:='BACKUP_MISSING';elsif verified<now()-interval '48 hours' then code:='BACKUP_STALE';end if;
 if attempt.started_at>coalesce(verified,'-infinity') and attempt.status='failed' then
 code:=case when attempt.error_code ~ '(AUTH|MCP|TOKEN)' then 'BACKUP_AUTH_REQUIRED' else 'BACKUP_FAILED' end;
 elsif attempt.started_at>coalesce(verified,'-infinity') and attempt.status='running' and attempt.started_at<now()-interval '30 minutes' then code:='BACKUP_STALLED';end if;
 if agent.last_failure_at>coalesce(verified,'-infinity') then
 code:=case when agent.state='auth_required' then 'BACKUP_AUTH_REQUIRED' when agent.state='retry_wait' then 'BACKUP_RETRY_WAIT' when agent.state='backup_failed' then 'BACKUP_FAILED' else 'BACKUP_RECOVERY_PENDING' end;end if;
 backup_ok:=code='OK';
 agent_ok:=agent.last_seen_at is not null and agent.last_seen_at>=now()-interval '2 hours' and agent.last_seen_at<=now()+interval '1 minute';
 if code='OK' and not agent_ok then code:=case when agent.id is null or agent.last_seen_at is null then 'BACKUP_AGENT_MISSING' else 'BACKUP_AGENT_OFFLINE' end;end if;
 return jsonb_build_object('healthy',code='OK','backupHealthy',backup_ok,'agentHealthy',coalesce(agent_ok,false),'code',code,'checkedAt',now(),'verifiedAt',verified,'agentCheckedAt',agent.last_seen_at,'agentState',agent.state);
end $$;

create or replace function public.operator_backup_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.data_session() or not private.is_operator() then raise exception 'BF_FORBIDDEN';end if;
 return jsonb_build_object('asOf',now(),'health',public.service_backup_health(),
 'runs',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from private.backup_runs order by created_at desc,id limit 10)x),'[]'),
 'attempts',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from private.backup_attempts order by started_at desc,id limit 10)x),'[]'),
 'copies',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from private.backup_copy_checks order by verified_at desc,id limit 10)x),'[]'));
end $$;
