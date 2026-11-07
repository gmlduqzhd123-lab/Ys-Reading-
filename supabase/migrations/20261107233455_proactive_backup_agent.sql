create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- This machine credential authorizes only bounded status reports, never data
-- reads, backups, or fabricated restore-verification receipts.
create table private.backup_agents(
 id uuid primary key,secret bytea not null check(octet_length(secret)=32),active boolean not null default true,
 last_sequence bigint not null default 0,request_digest text,last_seen_at timestamptz,
 state text,code text,phase text,last_failure_at timestamptz,created_at timestamptz not null default now()
);
alter table private.backup_agents enable row level security;
revoke all on private.backup_agents from public,anon,authenticated,service_role;

create function public.backup_agent_report(p_payload text,p_signature text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v jsonb;a private.backup_agents;agent uuid;seq bigint;at timestamptz;fp text;expected bytea;given bytea;difference integer:=0;i integer;begin
 if p_payload is null or octet_length(p_payload)>2048 or p_signature is null or p_signature !~ '^[a-f0-9]{64}$' then raise exception 'BF_INVALID_INPUT';end if;
 v:=p_payload::jsonb;
 if jsonb_typeof(v)<>'object' or (select count(*) from jsonb_object_keys(v))<>7 or
 not (v ?& array['version','agent','sequence','checkedAt','state','code','phase']) or v->>'version' is distinct from '1' or
 exists(select 1 from jsonb_each(v) x where jsonb_typeof(x.value)='null') or
 jsonb_typeof(v->'version')<>'number' or jsonb_typeof(v->'sequence')<>'number' or
 exists(select 1 from jsonb_each(v) x where x.key in('agent','checkedAt','state','code','phase') and jsonb_typeof(x.value)<>'string') then raise exception 'BF_INVALID_INPUT';end if;
 agent:=(v->>'agent')::uuid;seq:=(v->>'sequence')::bigint;at:=(v->>'checkedAt')::timestamptz;
 if seq<1 or seq>9007199254740991 or at<now()-interval '10 minutes' or at>now()+interval '1 minute' or
 v->>'state' not in('ready','auth_required','retry_wait','backing_up','backup_failed','completed') or
 v->>'phase' not in('probe','backup') or v->>'code' not in('OK','MCP_AUTH_REQUIRED','MCP_TIMEOUT','MCP_UNAVAILABLE','MCP_REQUEST_FAILED','MCP_TOOL_FAILED','MCP_RESPONSE_INVALID','PROJECT_SCOPE_MISMATCH','BACKUP_FAILED','BACKUP_RUN_FAILED','BACKUP_CODEX_UNAVAILABLE','SNAPSHOT_READ_FAILED','PRIVACY_CHECKPOINT_READ_FAILED','BACKUP_ALREADY_RUNNING') or
 ((v->>'state' in('ready','backing_up','completed')) is distinct from (v->>'code'='OK')) or
 (v->>'state'='auth_required' and v->>'code'<>'MCP_AUTH_REQUIRED') then raise exception 'BF_INVALID_INPUT';end if;
 select * into a from private.backup_agents where id=agent and active;
 if not found then raise exception 'BF_FORBIDDEN';end if;
 expected:=extensions.hmac(convert_to(p_payload,'UTF8'),a.secret,'sha256');given:=decode(p_signature,'hex');
 for i in 0..31 loop difference:=difference | (get_byte(expected,i) # get_byte(given,i));end loop;
 if difference<>0 then raise exception 'BF_FORBIDDEN';end if;
 -- Authenticate before taking a write lock, then recheck against rotation/revocation.
 perform 1 from private.backup_agents where id=agent and active and secret=a.secret for update;
 if not found then raise exception 'BF_FORBIDDEN';end if;
 select * into a from private.backup_agents where id=agent;
 fp:=encode(sha256(convert_to(p_payload,'UTF8')),'hex');
 if seq=a.last_sequence and fp=a.request_digest then return jsonb_build_object('accepted',true,'replayed',true);end if;
 if seq<=a.last_sequence then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;
 update private.backup_agents set last_sequence=seq,request_digest=fp,last_seen_at=clock_timestamp(),state=v->>'state',code=v->>'code',phase=v->>'phase',
 last_failure_at=case when v->>'state' in('auth_required','retry_wait','backup_failed') then clock_timestamp() else last_failure_at end where id=agent;
 return jsonb_build_object('accepted',true,'replayed',false);
end $$;
revoke all on function public.backup_agent_report(text,text) from public,anon,authenticated;
grant execute on function public.backup_agent_report(text,text) to anon,authenticated;

create or replace function public.service_backup_health() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare verified timestamptz;attempt private.backup_attempts;agent private.backup_agents;code text:='OK';begin
 select max(verified_at) into verified from private.backup_runs;
 select * into attempt from private.backup_attempts order by started_at desc,id limit 1;
 select * into agent from private.backup_agents where active and last_seen_at is not null order by last_seen_at desc,id limit 1;
 if verified is null then code:='BACKUP_MISSING';elsif verified<now()-interval '48 hours' then code:='BACKUP_STALE';end if;
 if attempt.started_at>coalesce(verified,'-infinity') and attempt.status='failed' then
 code:=case when attempt.error_code ~ '(AUTH|MCP|TOKEN)' then 'BACKUP_AUTH_REQUIRED' else 'BACKUP_FAILED' end;
 elsif attempt.started_at>coalesce(verified,'-infinity') and attempt.status='running' and attempt.started_at<now()-interval '30 minutes' then code:='BACKUP_STALLED';end if;
 if agent.last_failure_at>coalesce(verified,'-infinity') then
 code:=case when agent.state='auth_required' then 'BACKUP_AUTH_REQUIRED' when agent.state='retry_wait' then 'BACKUP_RETRY_WAIT' when agent.state='backup_failed' then 'BACKUP_FAILED' else 'BACKUP_RECOVERY_PENDING' end;
 end if;
 return jsonb_build_object('healthy',code='OK','code',code,'checkedAt',now(),'verifiedAt',verified,
 'agentCheckedAt',agent.last_seen_at,'agentState',agent.state);
end $$;

create or replace function public.operator_backup_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.data_session() or not private.is_operator() then raise exception 'BF_FORBIDDEN';end if;
 return jsonb_build_object('asOf',now(),'health',public.service_backup_health(),
 'runs',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from private.backup_runs order by created_at desc,id limit 10)x),'[]'),
 'attempts',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from private.backup_attempts order by started_at desc,id limit 10)x),'[]'));
end $$;
