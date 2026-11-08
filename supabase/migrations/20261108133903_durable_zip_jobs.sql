-- A NOLOGIN, non-bypass role evaluates the existing source RLS for background
-- tasks. It is not granted to browser roles. Only the private broker may call it.
do $$begin if not exists(select 1 from pg_roles where rolname='bookforest_export_reader') then create role bookforest_export_reader nologin nobypassrls inherit;end if;end $$;
grant authenticated to bookforest_export_reader;
grant bookforest_export_reader to postgres;
grant usage,create on schema private to bookforest_export_reader;
create function private.zip_visible_part(p_owner uuid,p_claims jsonb,p_batch uuid,p_part integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare old_sub text:=current_setting('request.jwt.claim.sub',true);old_claims text:=current_setting('request.jwt.claims',true);result jsonb;begin
 perform set_config('request.jwt.claim.sub',p_owner::text,true);perform set_config('request.jwt.claims',p_claims::text,true);
 result:=public.export_batch_content(p_batch,p_part);
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);perform set_config('request.jwt.claims',coalesce(old_claims,''),true);return result;
end $$;
alter function private.zip_visible_part(uuid,jsonb,uuid,integer) owner to bookforest_export_reader;
revoke create on schema private from bookforest_export_reader;
revoke all on function private.zip_visible_part(uuid,jsonb,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function private.zip_visible_part(uuid,jsonb,uuid,integer) to postgres;
create table private.zip_jobs(batch_id uuid primary key references private.export_batches(id) on delete cascade,state text not null default 'queued' check(state in('queued','running','complete','failed','cancelled')),claims jsonb not null,generation integer not null default 1,updated_at timestamptz not null default now(),error_code text);
create table private.zip_parts(batch_id uuid not null references private.zip_jobs(batch_id) on delete cascade,part integer not null,content bytea not null,digest text not null,primary key(batch_id,part));
create table private.zip_tasks(id uuid primary key default gen_random_uuid(),batch_id uuid not null references private.zip_jobs(batch_id) on delete cascade,generation integer not null,part integer not null,state text not null default 'queued',lease uuid,created_at timestamptz not null default now(),attempt integer not null default 1,finished_at timestamptz);
create index zip_tasks_pending_idx on private.zip_tasks(batch_id,created_at desc) where state in('queued','running');
create table private.zip_worker_config(singleton boolean primary key default true check(singleton),url text not null check(url='https://reading-blush-zeta.vercel.app/api/exports/worker' or url ~ '^http://(127\.0\.0\.1|172\.[0-9.]+|192\.168\.[0-9.]+):3096/api/exports/worker$'));
create table private.zip_dispatch_usage(day date not null,subject text not null,total integer not null,primary key(day,subject));
alter table private.zip_dispatch_usage enable row level security;revoke all on private.zip_dispatch_usage from public,anon,authenticated,service_role;
insert into private.zip_worker_config values(true,'https://reading-blush-zeta.vercel.app/api/exports/worker');
alter table private.zip_jobs enable row level security;alter table private.zip_parts enable row level security;alter table private.zip_tasks enable row level security;alter table private.zip_worker_config enable row level security;
revoke all on private.zip_jobs,private.zip_parts,private.zip_tasks,private.zip_worker_config from public,anon,authenticated,service_role;
create function private.zip_queue(p_batch uuid) returns void language plpgsql security definer set search_path='' as $$
declare j private.zip_jobs;b private.export_batches;n integer;task uuid;target text;begin
 select * into j from private.zip_jobs where batch_id=p_batch for update;
 select * into b from private.export_batches where id=p_batch;
 if j.state not in('queued','running') or b.discarded or b.created_at<now()-interval '7 days' then return;end if;
 if exists(select 1 from private.zip_tasks where batch_id=p_batch and generation=j.generation and state in('queued','running') and created_at>now()-interval '2 minutes') then return;end if;
 update private.zip_tasks set state='expired' where batch_id=p_batch and state in('queued','running');
 select x into n from generate_series(0,jsonb_array_length(b.requests)-1)x where not exists(select 1 from private.zip_parts where batch_id=p_batch and part=x) order by x limit 1;
 if n is null then update private.zip_jobs set state='complete',updated_at=now() where batch_id=p_batch;return;end if;
 if(select count(*) from private.zip_tasks where batch_id=p_batch and generation=j.generation and part=n)>=3 then update private.zip_jobs set state='failed',error_code='ZIP_RETRY_EXHAUSTED',updated_at=now() where batch_id=p_batch;return;end if;
 perform pg_advisory_xact_lock(hashtextextended('zip-dispatch-budget',0));
 if exists(select 1 from private.zip_dispatch_usage where day=(now() at time zone 'Asia/Seoul')::date and((subject=b.owner_id::text and total>=1000) or(subject='global' and total>=5000))) then update private.zip_jobs set state='failed',error_code='ZIP_DAILY_QUOTA',updated_at=now() where batch_id=b.id;return;end if;
 insert into private.zip_dispatch_usage values((now() at time zone 'Asia/Seoul')::date,b.owner_id::text,1),((now() at time zone 'Asia/Seoul')::date,'global',1) on conflict(day,subject) do update set total=zip_dispatch_usage.total+1;
 insert into private.zip_tasks(batch_id,generation,part) values(p_batch,j.generation,n) returning id into task;
 select url into target from private.zip_worker_config where singleton;
 if to_regnamespace('net') is not null then execute 'select net.http_post(url:=$1,headers:='' {"Content-Type":"application/json"}''::jsonb,body:=jsonb_build_object(''job'',$2),timeout_milliseconds:=60000)' using target,task;end if;
end $$;
revoke all on function private.zip_queue(uuid) from public,anon,authenticated,service_role;
create function public.zip_job(p_batch uuid,p_action text default 'status') returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.zip_jobs;claims jsonb;begin
 if not private.owns_export_batch(p_batch) then raise exception 'BF_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('export:'||auth.uid()::text,0));
 if p_action not in('status','start','cancel') or p_action is null then raise exception 'BF_INVALID_INPUT';end if;
 if p_action<>'status' and not public.consume_export_budget() then raise exception 'BF_EXPORT_QUOTA';end if;
 if p_action='start' then
 if not exists(select 1 from private.export_batches where id=p_batch and format in('csv','docx')) then raise exception 'BF_INVALID_INPUT';end if;
 perform private.zip_visible_part(auth.uid(),auth.jwt(),p_batch,0);
 if nullif(auth.jwt()->>'session_id','') is null or not exists(select 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=auth.uid()) then raise exception 'BF_SESSION_REQUIRED';end if;
 claims:=jsonb_build_object('sub',auth.uid(),'role','authenticated','session_id',auth.jwt()->>'session_id','aal',auth.jwt()->>'aal');
 insert into private.zip_jobs(batch_id,claims) values(p_batch,claims) on conflict(batch_id) do update set claims=excluded.claims,state=case when zip_jobs.state in('failed','cancelled') then 'queued' else zip_jobs.state end,generation=case when zip_jobs.state in('failed','cancelled') then zip_jobs.generation+1 else zip_jobs.generation end,error_code=null,updated_at=now();
 perform private.zip_queue(p_batch);
 elsif p_action='cancel' then update private.zip_jobs set state='cancelled',generation=generation+1,updated_at=now() where batch_id=p_batch;end if;
 select * into j from private.zip_jobs where batch_id=p_batch;
 return jsonb_build_object('state',coalesce(j.state,'new'),'done',(select count(*) from private.zip_parts where batch_id=p_batch),'parts',(select jsonb_array_length(requests) from private.export_batches where id=p_batch),'error',j.error_code);
end $$;
revoke all on function public.zip_job(uuid,text) from public,anon;grant execute on function public.zip_job(uuid,text) to authenticated;
create function public.claim_zip_task(p_task uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.zip_tasks;j private.zip_jobs;b private.export_batches;payload jsonb;v_lease uuid;begin
 select * into t from private.zip_tasks where id=p_task for update;
 if not found or t.state<>'queued' or t.created_at<now()-interval '2 minutes' then raise exception 'BF_JOB_UNAVAILABLE';end if;
 select * into j from private.zip_jobs where batch_id=t.batch_id;
 select * into b from private.export_batches where id=t.batch_id;
 if j.generation<>t.generation or j.state not in('queued','running') or b.discarded or not exists(select 1 from auth.sessions where id=(j.claims->>'session_id')::uuid and user_id=b.owner_id) then raise exception 'BF_JOB_UNAVAILABLE';end if;
 payload:=private.zip_visible_part(b.owner_id,j.claims,b.id,t.part);
 v_lease:=gen_random_uuid();update private.zip_tasks set state='running',lease=v_lease where id=t.id;update private.zip_jobs set state='running',updated_at=now() where batch_id=b.id;
 return jsonb_build_object('lease',v_lease,'part',t.part,'parts',jsonb_array_length(b.requests),'format',b.format,'bundle',payload->'bundle');
end $$;
revoke all on function public.claim_zip_task(uuid) from public;grant execute on function public.claim_zip_task(uuid) to anon;
create function public.finish_zip_task(p_task uuid,p_lease uuid,p_content text default null,p_ok boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare t private.zip_tasks;j private.zip_jobs;b private.export_batches;raw bytea;size integer;owner_size bigint;total_size bigint;begin
 select b2.* into b from private.zip_tasks t2 join private.export_batches b2 on b2.id=t2.batch_id where t2.id=p_task;
 if not found then raise exception 'BF_JOB_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended('export:'||b.owner_id::text,0));
 select * into t from private.zip_tasks where id=p_task for update;
 select * into j from private.zip_jobs where batch_id=t.batch_id for update;
 if t.lease is distinct from p_lease or t.state not in('running','done') or j.generation<>t.generation or j.state not in('running','complete') or b.discarded then raise exception 'BF_JOB_UNAVAILABLE';end if;
 if t.state='done' then return;end if;
 if not p_ok then update private.zip_tasks set state='failed',finished_at=now() where id=t.id;update private.zip_jobs set state='failed',error_code='ZIP_GENERATION_FAILED',updated_at=now() where batch_id=b.id;return;end if;
 if p_content is null or length(p_content)>4194304 then raise exception 'BF_EXPORT_TOO_LARGE';end if;
 perform private.zip_visible_part(b.owner_id,j.claims,b.id,t.part);
 if not exists(select 1 from auth.sessions where id=(j.claims->>'session_id')::uuid and user_id=b.owner_id) then raise exception 'BF_JOB_UNAVAILABLE';end if;
 raw:=decode(p_content,'base64');size:=octet_length(raw);if size not between 1 and 3145728 then raise exception 'BF_EXPORT_TOO_LARGE';end if;
 perform pg_advisory_xact_lock(hashtextextended('zip-artifact-global',0));
 select coalesce(sum(octet_length(p.content)) filter(where b2.owner_id=b.owner_id),0),coalesce(sum(octet_length(p.content)),0) into owner_size,total_size from private.zip_parts p join private.export_batches b2 on b2.id=p.batch_id;
 if coalesce(owner_size,0)+size>67108864 or total_size+size>134217728 then raise exception 'BF_EXPORT_STORAGE_QUOTA';end if;
 insert into private.zip_parts values(b.id,t.part,raw,encode(sha256(raw),'hex')) on conflict do nothing;
 update private.zip_tasks set state='done',finished_at=now() where id=t.id;
 update private.export_batches set completed=completed||jsonb_build_object(t.part::text,jsonb_build_object('at',now(),'url',null,'server',true)) where id=b.id;
 update private.zip_jobs set state='queued',updated_at=now() where batch_id=b.id;
 perform private.zip_queue(b.id);
end $$;
revoke all on function public.finish_zip_task(uuid,uuid,text,boolean) from public;grant execute on function public.finish_zip_task(uuid,uuid,text,boolean) to anon;
create function public.read_zip_part(p_batch uuid,p_part integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.zip_parts;b private.export_batches;begin
 if not private.owns_export_batch(p_batch) or not exists(select 1 from private.zip_jobs where batch_id=p_batch and state='complete') then raise exception 'BF_FORBIDDEN';end if;
 if not exists(select 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=auth.uid()) then raise exception 'BF_FORBIDDEN';end if;
 perform private.zip_visible_part(auth.uid(),auth.jwt(),p_batch,p_part);
 select * into p from private.zip_parts where batch_id=p_batch and part=p_part;
 if not found then raise exception 'BF_FORBIDDEN';end if;
 select * into b from private.export_batches where id=p_batch;
 return jsonb_build_object('name','책숲-'||(p_part+1)||'-'||jsonb_array_length(b.requests)||'.'||b.format,'content',encode(p.content,'base64'),'digest',p.digest);
end $$;
revoke all on function public.read_zip_part(uuid,integer) from public,anon;grant execute on function public.read_zip_part(uuid,integer) to authenticated;
create function private.zip_tick() returns void language plpgsql security definer set search_path='' as $$declare j record;begin
 for j in select batch_id from private.zip_jobs where state in('queued','running') order by updated_at limit 20 loop perform private.zip_queue(j.batch_id);end loop;
 delete from private.zip_tasks where finished_at<now()-interval '1 day';
 delete from private.zip_tasks where created_at<now()-interval '1 day' and state in('expired','failed');
 delete from private.zip_dispatch_usage where day<(now() at time zone 'Asia/Seoul')::date-7;
end $$;
-- Derived export copies can be rebuilt from canonical records. Exclude them
-- before reading binary/text data so temporary ZIPs cannot bloat full backups.
-- Restoring a backup requires creating new export batches and configuring the
-- new worker destination; no stale capability is reactivated.
do $$declare d text;begin
 d:=pg_get_functiondef('private.operator_snapshot()'::regprocedure);
 if position('if table_row.schemaname=''auth'' and table_row.tablename in (' in d)=0 then raise exception 'Snapshot ephemeral anchor missing';end if;
 d:=replace(d,'if table_row.schemaname=''auth'' and table_row.tablename in (','if table_row.schemaname=''private'' and table_row.tablename in (''export_batches'',''export_requests'',''export_snapshots'',''export_api_budget'',''zip_jobs'',''zip_tasks'',''zip_parts'',''zip_worker_config'',''zip_dispatch_usage'') then rows:=''[]''; elsif table_row.schemaname=''auth'' and table_row.tablename in (');execute d;
 d:=pg_get_functiondef('public.service_release_contract()'::regprocedure);
 d:=replace(d,'''scopeCache'',','''exportCapacity'',to_regprocedure(''public.create_export_batch(text,text,text,boolean,uuid,date,date,text,uuid)'') is not null,''copyReporting'',to_regprocedure(''public.service_copy_health()'') is not null,''teacherDrafts'',to_regprocedure(''public.teacher_work_draft(text,text,jsonb,jsonb,integer,uuid)'') is not null,''durableZip'',to_regprocedure(''public.zip_job(uuid,text)'') is not null,''scopeCache'',');execute d;
end $$;
revoke all on function private.zip_tick() from public,anon,authenticated,service_role;
do $$declare d text;begin
 d:=pg_get_functiondef('public.discard_export_batch(uuid)'::regprocedure);
 d:=replace(d,'delete from private.export_snapshots where batch_id=p_id;','delete from private.export_snapshots where batch_id=p_id; delete from private.zip_jobs where batch_id=p_id;');execute d;
 d:=pg_get_functiondef('public.export_batch_state(uuid,integer,boolean,text)'::regprocedure);
 d:=replace(d,'jsonb_array_length(requests) parts from private.export_batches','jsonb_array_length(requests) parts,(select state from private.zip_jobs z where z.batch_id=export_batches.id) zip_state,(select count(*) from private.zip_parts z where z.batch_id=export_batches.id) zip_done from private.export_batches');execute d;
 d:=replace(d,'''part'',p_part','''total'',jsonb_array_length(b.ids),''part'',p_part');execute d;
 if to_regnamespace('cron') is not null then perform cron.schedule('bookforest-zip-jobs-v1','* * * * *','select private.zip_tick()');end if;
end $$;
create function public.check_zip_download(p_batch uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare b jsonb;visible integer;begin
 b:=public.export_batch_state(p_batch,0);
 select count(*) into visible from private.export_snapshots where batch_id=p_batch;
 if visible<>(b->>'total')::integer then raise exception 'BF_EXPORT_ACCESS_CHANGED';end if;
 return true;
end $$;
revoke all on function public.check_zip_download(uuid) from public,anon;grant execute on function public.check_zip_download(uuid) to authenticated;
