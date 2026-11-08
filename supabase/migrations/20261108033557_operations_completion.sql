-- Preserve every failed observation; only a failed bounded recheck opens an incident.
alter table private.monitor_requests add column attempt integer not null default 1 check(attempt between 1 and 2);
alter table private.monitor_diagnostics add column attempt integer not null default 1;
alter table private.monitor_diagnostics add column transport text not null default 'none' check(transport in('none','timeout','dns','tls','connection','unknown'));
create function private.accept_monitor_result(p_at timestamptz,p_http integer,p_body jsonb,p_upstream text,p_transport text,p_attempt integer) returns boolean language plpgsql set search_path='' as $$
declare healthy boolean;code text;begin
 if p_attempt not in(1,2) or p_attempt is null or p_transport not in('none','timeout','dns','tls','connection','unknown') or p_transport is null then raise exception 'BF_INVALID_INPUT';end if;
 healthy:=coalesce(p_http=200 and p_body->>'status'='ok' and p_body->>'configured'='true' and p_body#>>'{checks,database}'='true' and p_body#>>'{checks,authentication}'='true',false);
 perform private.record_monitor_diagnostic(p_at,p_http,p_body,p_upstream);
 update private.monitor_diagnostics set attempt=p_attempt,transport=p_transport where checked_at=p_at;
 if healthy or p_attempt=2 then
 code:=case when healthy then 'HEALTHY' when p_http is null then 'TIMEOUT' when p_http=200 then 'INVALID_HEALTH_RESPONSE' else 'HTTP_'||p_http end;
 perform private.record_service_check('supabase-cron',p_at,healthy,code);end if;
 return not healthy and p_attempt=1;
end $$;
revoke all on function private.accept_monitor_result(timestamptz,integer,jsonb,text,text,integer) from public,anon,authenticated,service_role;
create or replace function private.monitor_tick() returns void language plpgsql security definer set search_path='' as $$
declare r record;payload jsonb;retry boolean;request bigint;transport text;begin
 if not pg_try_advisory_xact_lock(hashtext('bookforest:monitor:tick')) then return;end if;
 for r in select p.id,p.created_at,p.attempt,h.status_code,h.content,h.headers,h.timed_out,h.error_msg from private.monitor_requests p left join net._http_response h on h.id=p.id where p.processed_at is null and(h.id is not null or p.created_at<now()-interval '2 minutes') order by p.created_at,p.id loop
 payload:='{}';begin payload:=r.content::jsonb;exception when others then payload:='{}';end;
 transport:=case when r.status_code is not null then 'none' when r.timed_out or r.error_msg ilike '%timed out%' then 'timeout' when r.error_msg ilike '%resolve%' then 'dns' when r.error_msg ilike '%SSL%' or r.error_msg ilike '%TLS%' then 'tls' when r.error_msg ilike '%connect%' then 'connection' else 'unknown' end;
 retry:=private.accept_monitor_result(r.created_at,r.status_code,payload,r.headers->>'x-vercel-id',transport,r.attempt);
 update private.monitor_requests set processed_at=now() where id=r.id;
 if retry then select net.http_get(url:='https://reading-blush-zeta.vercel.app/api/health?deep=1',headers:='{"Cache-Control":"no-cache"}'::jsonb,timeout_milliseconds:=10000) into request;insert into private.monitor_requests(id,attempt) values(request,2);end if;
 end loop;
 if not exists(select 1 from private.monitor_requests where created_at>now()-interval '5 minutes') then
 select net.http_get(url:='https://reading-blush-zeta.vercel.app/api/health?deep=1',headers:='{"Cache-Control":"no-cache"}'::jsonb,timeout_milliseconds:=10000) into request;
 insert into private.monitor_requests(id) values(request);end if;
 delete from private.monitor_requests where processed_at<now()-interval '1 day';end $$;

-- Private encrypted cloud archives run without a desktop session or MCP OAuth.
create table private.cloud_backup_config(singleton boolean primary key default true check(singleton),public_key text not null check(length(public_key) between 60 and 160),enabled boolean not null default true);
create table private.cloud_backup_jobs(id uuid primary key default gen_random_uuid(),purpose text not null check(purpose in('backup','download')),source_id uuid references private.cloud_backup_jobs(id),status text not null default 'queued' check(status in('queued','running','stored','failed')),created_at timestamptz not null default now(),finished_at timestamptz,storage_path text,bytes integer,digest text,verified_at timestamptz,error_code text);
alter table private.cloud_backup_config enable row level security;alter table private.cloud_backup_jobs enable row level security;
revoke all on private.cloud_backup_config,private.cloud_backup_jobs from public,anon,authenticated,service_role;
create function public.claim_cloud_backup_job(p_job uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.cloud_backup_jobs;pub text;begin
 select * into j from private.cloud_backup_jobs where id=p_job for update;
 if not found or j.status<>'queued' or j.created_at<now()-interval '10 minutes' then raise exception 'BF_CLOUD_JOB_INVALID';end if;
 select public_key into pub from private.cloud_backup_config where enabled;
 if pub is null then raise exception 'BF_CLOUD_NOT_CONFIGURED';end if;
 update private.cloud_backup_jobs set status='running' where id=j.id;
 if j.purpose='download' then return jsonb_build_object('purpose','download','path',(select storage_path from private.cloud_backup_jobs where id=j.source_id and status='stored'));end if;
 return jsonb_build_object('purpose','backup','publicKey',pub,'snapshot',private.operator_snapshot(),'privacy',private.operator_privacy_checkpoint());
end $$;
revoke all on function public.claim_cloud_backup_job(uuid) from public,anon,authenticated;grant execute on function public.claim_cloud_backup_job(uuid) to service_role;
create function public.finish_cloud_backup_job(p_job uuid,p_path text,p_bytes integer,p_digest text,p_ok boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_ok and(p_path is null or p_path<>p_job::text||'.bfcloud' or p_bytes not between 1 and 64000000 or p_digest !~ '^[a-f0-9]{64}$') then raise exception 'BF_INVALID_INPUT';end if;
 update private.cloud_backup_jobs set status=case when p_ok then 'stored' else 'failed' end,finished_at=clock_timestamp(),storage_path=p_path,bytes=p_bytes,digest=p_digest,error_code=case when p_ok then null else 'CLOUD_BACKUP_FAILED' end where id=p_job and status='running' and purpose='backup';
 if not found then raise exception 'BF_CLOUD_JOB_INVALID';end if;
end $$;
revoke all on function public.finish_cloud_backup_job(uuid,text,integer,text,boolean) from public,anon,authenticated;grant execute on function public.finish_cloud_backup_job(uuid,text,integer,text,boolean) to service_role;
create function private.cloud_backup_tick() returns void language plpgsql security definer set search_path='' as $$
declare job uuid;begin
 if not pg_try_advisory_xact_lock(hashtext('bookforest:cloud-backup')) or not exists(select 1 from private.cloud_backup_config where enabled) then return;end if;
 update private.cloud_backup_jobs set status='failed',error_code='CLOUD_JOB_TIMEOUT',finished_at=now() where status in('queued','running') and created_at<now()-interval '15 minutes';
 if exists(select 1 from private.cloud_backup_jobs where purpose='backup' and((status='stored' and created_at>now()-interval '20 hours') or created_at>now()-interval '15 minutes')) then return;end if;
 insert into private.cloud_backup_jobs(purpose) values('backup') returning id into job;
 perform net.http_post(url:='https://rbtqtkjnqtcnljvabisa.supabase.co/functions/v1/cloud-backup',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('job',job),timeout_milliseconds:=120000);
end $$;
revoke all on function private.cloud_backup_tick() from public,anon,authenticated,service_role;
create function public.service_cloud_backup_health() returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('configured',exists(select 1 from private.cloud_backup_config where enabled),'storedAt',(select max(created_at) from private.cloud_backup_jobs where purpose='backup' and status='stored'),'verifiedAt',(select max(verified_at) from private.cloud_backup_jobs),'healthy',exists(select 1 from private.cloud_backup_jobs where purpose='backup' and status='stored' and created_at>now()-interval '48 hours'),'storage','supabase-private-encrypted','separateProvider',false)
$$;
revoke all on function public.service_cloud_backup_health() from public;grant execute on function public.service_cloud_backup_health() to anon,authenticated;
do $$begin if to_regclass('storage.buckets') is not null then execute 'insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values(''bookforest-backups'',''bookforest-backups'',false,64000000,array[''application/json'']) on conflict(id) do nothing';end if;end $$;

create function public.operator_manage_invitation(p_email text,p_name text,p_revoke boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_operator_step_up();
 if p_email is null or lower(p_email)!~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(p_email)>254 or p_name is null or length(btrim(p_name)) not between 2 and 40 then raise exception 'BF_INVALID_INPUT';end if;
 if exists(select 1 from private.operator_email_invitations where email=lower(p_email) and claimed_at is not null) then raise exception 'BF_ALREADY_ACCEPTED';end if;
 if p_revoke then update private.operator_email_invitations set expires_at=now() where email=lower(p_email) and claimed_at is null;
 else insert into private.operator_email_invitations(email,display_name,expires_at) values(lower(p_email),btrim(p_name),now()+interval '14 days') on conflict(email) do update set expires_at=excluded.expires_at,display_name=excluded.display_name;end if;
 perform private.ops_audit('operator_invitation_updated');end $$;
revoke all on function public.operator_manage_invitation(text,text,boolean) from public,anon;grant execute on function public.operator_manage_invitation(text,text,boolean) to authenticated;

create table private.export_batches(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles(id) on delete cascade,title text not null,kind text not null,format text not null,include_names boolean not null,ids jsonb not null,requests jsonb not null,completed jsonb not null default '{}',created_at timestamptz not null default now());
alter table private.export_batches enable row level security;
revoke all on private.export_batches from public,anon,authenticated,service_role;
create index export_batches_owner_created_idx on private.export_batches(owner_id,created_at desc);
create function private.store_export_batch(p_title text,p_kind text,p_format text,p_names boolean,p_ids jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare batch_id uuid;requests jsonb;begin
 if not private.data_session() or p_title is null or length(btrim(p_title)) not between 1 and 100 or p_kind not in('reading','writing','draft') or p_format not in('docx','csv','google-docs','google-sheets') or p_names is null or jsonb_typeof(p_ids)<>'array' or jsonb_array_length(p_ids) not between 1 and 10000 then raise exception 'BF_INVALID_INPUT';end if;
 if p_format like 'google-%' and not exists(select 1 from public.profiles where id=auth.uid() and role='teacher') then raise exception 'BF_FORBIDDEN';end if;
 select jsonb_agg(gen_random_uuid()) into requests from generate_series(1,(jsonb_array_length(p_ids)+24)/25);
 delete from private.export_batches where owner_id=auth.uid() and created_at<now()-interval '7 days';
 insert into private.export_batches(owner_id,title,kind,format,include_names,ids,requests) values(auth.uid(),btrim(p_title),p_kind,p_format,p_names,p_ids,requests) returning export_batches.id into batch_id;return batch_id;
end $$;
revoke all on function private.store_export_batch(text,text,text,boolean,jsonb) from public,anon;grant execute on function private.store_export_batch(text,text,text,boolean,jsonb) to authenticated;
-- INVOKER is essential: the record index and source-table RLS limit selection.
create function public.start_export_batch(p_title text,p_kind text,p_format text,p_names boolean,p_classroom uuid default null,p_from date default null,p_to date default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare ids jsonb;begin
 if not private.data_session() or p_from>p_to then raise exception 'BF_INVALID_INPUT';end if;
 select coalesce(jsonb_agg(id order by recorded_on,id),'[]') into ids from(select r.id,r.recorded_on from public.learning_record_index r where r.kind=p_kind and(p_classroom is null or r.classroom_id=p_classroom) and(p_from is null or r.recorded_on>=p_from) and(p_to is null or r.recorded_on<=p_to) order by r.recorded_on,r.id limit 10001)x;
 return private.store_export_batch(p_title,p_kind,p_format,p_names,ids);end $$;
revoke all on function public.start_export_batch(text,text,text,boolean,uuid,date,date) from public,anon;grant execute on function public.start_export_batch(text,text,text,boolean,uuid,date,date) to authenticated;
create function public.export_batch_state(p_id uuid default null,p_part integer default null,p_done boolean default false,p_url text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.export_batches;begin
 if not private.data_session() then raise exception 'BF_FORBIDDEN';end if;
 if p_id is null then return coalesce((select jsonb_agg(to_jsonb(x)) from(select id,title,kind,format,created_at,jsonb_array_length(ids) total,(select count(*) from jsonb_object_keys(completed)) done,jsonb_array_length(requests) parts from private.export_batches where owner_id=auth.uid() and created_at>now()-interval '7 days' order by created_at desc limit 10)x),'[]');end if;
 select * into b from private.export_batches where id=p_id and owner_id=auth.uid() and created_at>now()-interval '7 days' for update;
 if not found then raise exception 'BF_FORBIDDEN';end if;
 if p_part is null or p_part<0 or p_part>=jsonb_array_length(b.requests) then raise exception 'BF_INVALID_INPUT';end if;
 if p_done then
 if not exists(select 1 from public.export_receipts where actor_id=auth.uid() and request_id=(b.requests->>p_part)::uuid and format=b.format and external_url is not distinct from p_url) then raise exception 'BF_EXPORT_NOT_GENERATED';end if;
 if p_url is not null and p_url !~ '^https://(docs\.google\.com|drive\.google\.com)/' then raise exception 'BF_INVALID_INPUT';end if;
 update private.export_batches set completed=completed||jsonb_build_object(p_part::text,jsonb_build_object('at',clock_timestamp(),'url',p_url)) where id=b.id;
 end if;
 return jsonb_build_object('id',b.id,'owner',b.owner_id,'title',b.title,'kind',b.kind,'format',b.format,'includeNames',b.include_names,'requestId',b.requests->p_part,'ids',(select jsonb_agg(value order by ordinality) from jsonb_array_elements(b.ids) with ordinality where ordinality>p_part*25 and ordinality<=(p_part+1)*25),'part',p_part,'parts',jsonb_array_length(b.requests),'completed',b.completed);
end $$;
revoke all on function public.export_batch_state(uuid,integer,boolean,text) from public,anon;grant execute on function public.export_batch_state(uuid,integer,boolean,text) to authenticated;

create function public.learning_change_token(p_classroom uuid default null) returns text language plpgsql stable security invoker set search_path='' as $$
declare token text;begin
 if not private.data_session() then raise exception 'BF_FORBIDDEN';end if;
 select md5(coalesce(string_agg(part,'|' order by part),'')) into token from(
 select kind||':'||id||':'||updated_at part from(select distinct on(kind) kind,id,updated_at from public.learning_record_index where p_classroom is null or classroom_id=p_classroom order by kind,updated_at desc,id)x
 union all select 'feedback:'||id||':'||created_at from(select f.id,f.created_at from public.feedback f join public.submissions s on s.id=f.submission_id join public.assignments a on a.id=s.assignment_id where p_classroom is null or a.classroom_id=p_classroom order by f.created_at desc,f.id limit 1)y
 union all select 'activity:'||id||':'||created_at from(select id,created_at from public.activity_events where p_classroom is null or classroom_id=p_classroom order by created_at desc,id limit 1)z
 )signal;return token;
end $$;
revoke all on function public.learning_change_token(uuid) from public,anon;grant execute on function public.learning_change_token(uuid) to authenticated;
