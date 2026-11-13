-- Copy inspection time is not the creation time of its contents.
alter table private.backup_copy_reports add column source_created_at timestamptz;
do $$declare d text;begin
 d:=pg_get_functiondef('public.backup_copy_report(text,text)'::regprocedure);
 d:=replace(d,'v->>''version''<>''1''','(v->>''version'' is null or jsonb_typeof(v->''version'')<>''number'' or v->>''version'' not in(''1'',''2''))');
 d:=replace(d,'(select count(*) from jsonb_object_keys(t))<>7','(select count(*) from jsonb_object_keys(t))<>(case when v->>''version''=''2'' then 8 else 7 end)');
 d:=replace(d,E'end loop;\n select * into a',E'if v->>''version''=''2'' and(not(t?''sourceCreatedAt'') or(t->>''sourceCreatedAt'' is not null and(t->>''sourceCreatedAt'')::timestamptz>now()+interval ''1 minute'')) then raise exception ''BF_INVALID_INPUT'';end if; end loop;\n select * into a');
 d:=replace(d,'(t->>''bytes'')::bigint,at)','(t->>''bytes'')::bigint,at,(t->>''sourceCreatedAt'')::timestamptz)');
 d:=replace(d,'checked_at=excluded.checked_at;','checked_at=excluded.checked_at,source_created_at=excluded.source_created_at;');execute d;
end $$;
create or replace function public.service_copy_health() returns jsonb language sql stable security definer set search_path='' as $$
with targets as(select r.*,case when r.kind='recovery-kit' then r.backup_digest is not distinct from(select snapshot_digest from private.backup_runs order by created_at desc,id limit 1)
 else r.backup_digest is not distinct from(select digest from private.cloud_backup_jobs where purpose='backup' and status='stored' order by created_at desc limit 1) end latest
 from private.backup_copy_reports r join private.backup_agents a on a.id=r.agent_id and a.active),
checks as(select *,coalesce(checked_at>now()-interval '2 hours' and state='verified' and verified_at>now()-interval '48 hours' and source_created_at>now()-interval '48 hours' and source_created_at<=now()+interval '1 minute' and latest,false) fresh from targets where configured)
select jsonb_build_object('checkedAt',now(),'configured',exists(select 1 from checks),'external',exists(select 1 from checks where external),'healthy',not exists(select 1 from checks where not fresh),
'code',case when exists(select 1 from checks where state in('failed','missing')) then 'BACKUP_COPY_FAILED' when exists(select 1 from checks where not fresh) then 'BACKUP_COPY_STALE' else 'OK' end,
'targets',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'configured',configured,'external',external,'state',state,'checkedAt',checked_at,'verifiedAt',verified_at,'sourceCreatedAt',source_created_at,'latest',latest)) from targets),'[]'))
$$;

do $$declare d text;begin
 d:=pg_get_functiondef('public.backup_agent_report(text,text)'::regprocedure);
 d:=replace(d,'''OK'',''MCP_AUTH_REQUIRED''','''BACKUP_CREDENTIAL_EXPIRED'',''BACKUP_PERMISSION_DENIED'',''BACKUP_CREDENTIAL_INVALID'',''BACKUP_TRANSPORT_UNAVAILABLE'',''BACKUP_TRANSPORT_FAILED'',''BACKUP_RESPONSE_INVALID'',''OK'',''MCP_AUTH_REQUIRED''');
 d:=replace(d,'v->>''code''<>''MCP_AUTH_REQUIRED''','v->>''code'' not in(''MCP_AUTH_REQUIRED'',''BACKUP_CREDENTIAL_EXPIRED'',''BACKUP_PERMISSION_DENIED'')');execute d;
 d:=pg_get_functiondef('public.service_backup_health()'::regprocedure);
 d:=replace(d,'backup_ok:=code=''OK'';','if code<>''OK'' and agent.code=''BACKUP_PERMISSION_DENIED'' then code:=''BACKUP_PERMISSION_DENIED'';end if; backup_ok:=code=''OK'';');execute d;
end $$;

-- Bounded, authenticated operational metadata; no other teacher's identifiers,
-- document bodies, task capabilities or claims are returned.
create function public.export_usage() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if not private.data_session() then raise exception 'BF_FORBIDDEN';end if;
 select jsonb_build_object('active',count(*) filter(where not discarded),'daily',count(*) filter(where created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),
 'sourceBytes',coalesce(sum(source_bytes) filter(where not discarded),0)) into result from private.export_batches where owner_id=auth.uid() and created_at>now()-interval '7 days';
 return result||jsonb_build_object('artifactBytes',coalesce((select sum(octet_length(p.content)) from private.zip_parts p join private.export_batches b on b.id=p.batch_id where b.owner_id=auth.uid()),0),
 'sharedArtifactBytes',coalesce((select sum(octet_length(content)) from private.zip_parts),0),'requestsThisMinute',coalesce((select total from private.export_api_budget where owner_id=auth.uid() and minute=date_trunc('minute',now())),0),
 'limits',jsonb_build_object('active',10,'daily',20,'sourceBytes',67108864,'artifactBytes',67108864,'sharedArtifactBytes',134217728,'requestsPerMinute',60));
end $$;
revoke all on function public.export_usage() from public,anon;grant execute on function public.export_usage() to authenticated;
do $$declare d text;begin
 d:=pg_get_functiondef('public.export_batch_state(uuid,integer,boolean,text)'::regprocedure);
 d:=replace(d,' zip_state,',' zip_state,(select error_code from private.zip_jobs z where z.batch_id=export_batches.id) zip_error,(select updated_at from private.zip_jobs z where z.batch_id=export_batches.id) zip_updated,');execute d;
end $$;
create or replace function private.zip_tick() returns void language plpgsql security definer set search_path='' as $$declare job_row record;begin
 for job_row in select batch_id from private.zip_jobs where state in('queued','running') order by updated_at,batch_id limit 20 loop
  update private.zip_jobs set updated_at=now() where batch_id=job_row.batch_id;
  perform private.zip_queue(job_row.batch_id);
 end loop;
 -- Cancelled/failed derived files can be rebuilt from the retained snapshot.
 -- Release their capacity after 24h without deleting canonical student work.
 delete from private.zip_parts p using private.zip_jobs j where p.batch_id=j.batch_id and j.state in('failed','cancelled') and j.updated_at<now()-interval '1 day';
 delete from private.zip_tasks where finished_at<now()-interval '1 day';
 delete from private.zip_tasks where created_at<now()-interval '1 day' and state in('expired','failed');
 delete from private.zip_dispatch_usage where day<(now() at time zone 'Asia/Seoul')::date-7;
end $$;

-- Use top-one index lookups rather than running source RLS across the complete
-- history. These remain SECURITY INVOKER lookups against the same secured view.
create index submissions_student_activity_idx on public.submissions(student_id,created_at desc);
do $$declare d text;old_cte text:='recent_activity as materialized(select r.classroom_id,r.student_id,max(r.updated_at) last_activity from public.learning_record_index r join classes c on c.id=r.classroom_id group by r.classroom_id,r.student_id), ';begin
 d:=pg_get_functiondef('public.teacher_overview(uuid,integer)'::regprocedure);
 if position(old_cte in d)=0 then raise exception 'Overview activity anchor missing';end if;
 d:=replace(d,old_cte,'');
 d:=replace(d,'ra.last_activity','case when e.consent_status=''verified'' and e.account_active and not e.must_change_password then greatest(
 (select r.updated_at from public.learning_record_index r where r.kind=''reading'' and r.classroom_id=e.classroom_id and r.student_id=e.student_id order by r.updated_at desc limit 1),
 (select r.updated_at from public.learning_record_index r where r.kind=''writing'' and r.classroom_id=e.classroom_id and r.student_id=e.student_id order by r.updated_at desc limit 1),
 (select r.updated_at from public.learning_record_index r where r.kind=''draft'' and r.classroom_id=e.classroom_id and r.student_id=e.student_id order by r.updated_at desc limit 1)) else null end last_activity');
 d:=replace(d,'from roster e left join recent_activity ra using(classroom_id,student_id))','from roster e)');execute d;
 d:=pg_get_functiondef('public.service_release_contract()'::regprocedure);
 d:=replace(d,'''scopeCache'',','''recoveryOperations'',to_regprocedure(''public.export_usage()'') is not null,''scopeCache'',');execute d;
end $$;
