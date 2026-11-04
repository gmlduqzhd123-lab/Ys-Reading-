-- Extend existing invoker read models to scoped staff, never global is_teacher.
do $$declare d text;parts text[];begin
 d:=pg_get_viewdef('public.learning_record_index'::regclass,true);
 parts:=string_to_array(d,'UNION ALL');
 if cardinality(parts)<>3 then raise exception 'Record read model anchor missing';end if;
 parts[1]:=replace(parts[1],'private.is_teacher(r.classroom_id)','private.staff_learning_visible(r.student_id, r.classroom_id)');
 parts[2]:=replace(parts[2],'private.is_teacher(a.classroom_id)','private.staff_learning_visible(s.student_id, a.classroom_id)');
 -- Preserve the original personal-draft branch and all source-table RLS.
 d:=array_to_string(parts,'UNION ALL');
 execute 'create or replace view public.learning_record_index with(security_invoker=true) as '||d;
 d:=pg_get_functiondef('public.record_search(text,uuid,uuid,text,date,date,text,integer)'::regprocedure);
 execute replace(d,'private.is_teacher(p_classroom)','private.staff_permission(p_classroom,''read'')');
 d:=pg_get_viewdef('public.teacher_attention'::regclass,true);
 d:=replace(d,'private.is_teacher(s.classroom_id)','private.staff_learning_visible(s.student_id, s.classroom_id)');
 d:=replace(d,'private.is_teacher(r.classroom_id)','private.staff_learning_visible(r.student_id, r.classroom_id)');
 execute 'create or replace view public.teacher_attention with(security_invoker=true) as '||d;
 d:=pg_get_functiondef('public.teacher_overview(uuid,integer)'::regprocedure);
 if position('where teacher_id=auth.uid() and' in d)=0 then raise exception 'Overview class anchor missing';end if;
 d:=replace(d,'private.is_teacher(p_classroom)','private.staff_permission(p_classroom,''read'')');
 d:=replace(d,'where teacher_id=auth.uid() and','where private.staff_permission(id,''read'') and');
 d:=replace(d,'where e.active)','where e.active and (private.is_teacher(e.classroom_id) or private.staff_learning_visible(e.student_id,e.classroom_id)))');
 execute d;
 d:=pg_get_functiondef('public.teacher_notices_read(uuid,timestamptz)'::regprocedure);
 execute replace(d,'private.is_teacher(p_classroom)','private.staff_permission(p_classroom,''read'')');
end $$;
drop policy notice_read on public.teacher_notice_reads;
create policy notice_read on public.teacher_notice_reads for select to authenticated using(private.data_session() and teacher_id=(select auth.uid()) and private.staff_permission(classroom_id,'read'));

-- Public recovery heartbeat: no paths, hashes, quantities, users or raw errors.
create function public.service_backup_health() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare verified timestamptz;attempt private.backup_attempts;code text:='OK';begin
 select max(verified_at) into verified from private.backup_runs;
 select * into attempt from private.backup_attempts order by started_at desc,id limit 1;
 if verified is null then code:='BACKUP_MISSING';
 elsif verified<now()-interval '48 hours' then code:='BACKUP_STALE';end if;
 if attempt.started_at>coalesce(verified,'-infinity') and attempt.status='failed' then
  code:=case when attempt.error_code ~ '(AUTH|MCP|TOKEN)' then 'BACKUP_AUTH_REQUIRED' else 'BACKUP_FAILED' end;
 elsif attempt.started_at>coalesce(verified,'-infinity') and attempt.status='running' and attempt.started_at<now()-interval '30 minutes' then code:='BACKUP_STALLED';end if;
 return jsonb_build_object('healthy',code='OK','code',code,'checkedAt',now(),'verifiedAt',verified);
end $$;
revoke all on function public.service_backup_health() from public;
grant execute on function public.service_backup_health() to anon,authenticated;

create table private.google_export_jobs(
 actor_id uuid not null references public.profiles(id) on delete cascade,request_id uuid not null,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 state text not null check(state in('reserved','posting','uncertain','complete')),
 lease uuid not null,lease_until timestamptz not null,result jsonb,updated_at timestamptz not null default now(),
 primary key(actor_id,request_id));
alter table private.google_export_jobs enable row level security;
revoke all on private.google_export_jobs from public,anon,authenticated;
create function public.google_export_job(p_action text,p_request uuid,p_fingerprint text,p_lease uuid default null,p_result jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.google_export_jobs;begin
 if not private.data_session() or not exists(select 1 from public.profiles where id=auth.uid() and role='teacher') then raise exception 'BF_FORBIDDEN';end if;
 if p_action is null or p_action not in('reserve','posting','retry','uncertain','complete') or p_request is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'BF_INVALID_INPUT';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into j from private.google_export_jobs where actor_id=auth.uid() and request_id=p_request for update;
 if found and j.fingerprint<>p_fingerprint then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;
 if p_action='reserve' then
  if j.state='complete' then return jsonb_build_object('state',j.state,'result',j.result);end if;
  if j.lease_until>now() then raise exception 'GOOGLE_EXPORT_BUSY';end if;
  insert into private.google_export_jobs(actor_id,request_id,fingerprint,state,lease,lease_until)
  values(auth.uid(),p_request,p_fingerprint,'reserved',gen_random_uuid(),now()+interval '3 minutes')
  on conflict(actor_id,request_id) do update set state=case when google_export_jobs.state in('posting','uncertain') then 'uncertain' else 'reserved' end,lease=excluded.lease,lease_until=excluded.lease_until,updated_at=now() returning * into j;
  return jsonb_build_object('state',j.state,'lease',j.lease);
 end if;
 if j.actor_id is null or p_lease is null or j.lease<>p_lease or j.lease_until<=now() then raise exception 'GOOGLE_EXPORT_BUSY';end if;
 if p_action='posting' then
  if j.state<>'reserved' then raise exception 'GOOGLE_EXPORT_PENDING';end if;
  update private.google_export_jobs set state='posting',updated_at=now() where actor_id=auth.uid() and request_id=p_request;
 elsif p_action='complete' then
  if p_result is null or jsonb_typeof(p_result)<>'object' or length(p_result::text)>3000 or coalesce(p_result->>'id','') !~ '^[a-zA-Z0-9_-]{1,200}$' or coalesce(p_result->>'webViewLink','') !~ '^https://(docs|drive)\.google\.com/' then raise exception 'BF_INVALID_INPUT';end if;
  update private.google_export_jobs set state='complete',result=jsonb_build_object('id',p_result->>'id','webViewLink',p_result->>'webViewLink'),updated_at=now() where actor_id=auth.uid() and request_id=p_request;
 elsif p_action='retry' then
  if j.state='uncertain' then raise exception 'GOOGLE_EXPORT_PENDING';end if;
  update private.google_export_jobs set state='reserved',lease_until=now(),updated_at=now() where actor_id=auth.uid() and request_id=p_request;
 else
  update private.google_export_jobs set state='uncertain',lease_until=now(),updated_at=now() where actor_id=auth.uid() and request_id=p_request;
 end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.google_export_job(text,uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.google_export_job(text,uuid,text,uuid,jsonb) to authenticated;

create function public.report_batch_preview(p_classroom uuid,p_from date default null,p_until date default null,p_after uuid default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s record;v jsonb;items jsonb:='[]';cursor_id uuid;n integer:=0;more boolean:=false;begin
 if not private.data_session() or not private.can_review_class(p_classroom) then raise exception 'BF_FORBIDDEN';end if;
 if (p_from is null)<>(p_until is null) or p_from>p_until or p_until-p_from>1096 then raise exception 'BF_INVALID_INPUT';end if;
 for s in select e.student_id from public.enrollments e where e.classroom_id=p_classroom and e.active and (p_after is null or e.student_id>p_after) and private.staff_learning_visible(e.student_id,p_classroom) order by e.student_id limit 31 loop
  if n=30 then more:=true;exit;end if;
  v:=public.growth_report_state(p_classroom,s.student_id,p_from,p_until,1);
  items:=items||jsonb_build_array(jsonb_build_object('student',s.student_id,'name',v->'student'->>'name','token',v->>'sourceToken','version',(v->>'latestVersion')::integer,'counts',v->'counts','title',(v->'student'->>'name')||'의 책숲 성장 기록','note',''));
  cursor_id:=s.student_id;n:=n+1;
 end loop;
 return jsonb_build_object('data',items,'next',case when more then cursor_id else null end);
end $$;
revoke all on function public.report_batch_preview(uuid,date,date,uuid) from public,anon;
grant execute on function public.report_batch_preview(uuid,date,date,uuid) to authenticated;

-- Privacy checkpoints travel independently of an older backup. They contain
-- identifiers and access state only, are encrypted by the operator tool, and
-- have no client grants. A restore starts held until a fresh checkpoint applies.
create table private.privacy_guard_events(id bigint generated by default as identity primary key,student_id uuid not null,classroom_id uuid,kind text not null,created_at timestamptz not null default now());
alter table private.deletion_requests add column privacy_changed_at timestamptz not null default now();
create function private.stamp_privacy_decision() returns trigger language plpgsql set search_path='' as $$begin new.privacy_changed_at:=clock_timestamp();return new;end $$;
revoke all on function private.stamp_privacy_decision() from public,anon,authenticated;
create trigger stamp_privacy_decision before update of status on private.deletion_requests for each row when(old.status is distinct from new.status) execute function private.stamp_privacy_decision();
create index privacy_guard_subject_idx on private.privacy_guard_events(student_id,classroom_id,kind);
create table private.recovery_state(singleton boolean primary key default true check(singleton),held boolean not null default false,watermark bigint not null default 0,checked_at timestamptz);
insert into private.recovery_state(singleton) values(true);
create table private.recovery_denials(student_id uuid not null,classroom_id uuid,kind text not null,created_at timestamptz not null default now());
create unique index recovery_denial_subject_idx on private.recovery_denials(student_id,coalesce(classroom_id,'00000000-0000-0000-0000-000000000000'::uuid),kind);
alter table private.privacy_guard_events enable row level security;
alter table private.recovery_state enable row level security;
alter table private.recovery_denials enable row level security;
revoke all on private.privacy_guard_events,private.recovery_state,private.recovery_denials from public,anon,authenticated;
create function private.remember_privacy_deletion() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_table_name='profiles' then insert into private.privacy_guard_events(student_id,kind) values(old.id,'deleted');
 else insert into private.privacy_guard_events(student_id,classroom_id,kind) values(old.student_id,old.classroom_id,'enrollment_deleted');end if;return old;
end $$;
revoke all on function private.remember_privacy_deletion() from public,anon,authenticated;
create trigger remember_deleted_profile after delete on public.profiles for each row execute function private.remember_privacy_deletion();
create trigger remember_deleted_enrollment after delete on public.enrollments for each row execute function private.remember_privacy_deletion();
create function private.remember_privacy_change() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_table_name='profiles' then
  if new.consent_status is distinct from old.consent_status or new.account_active is distinct from old.account_active then insert into private.privacy_guard_events(student_id,kind) values(new.id,'state');end if;
 elsif new.active is distinct from old.active then insert into private.privacy_guard_events(student_id,classroom_id,kind) values(new.student_id,new.classroom_id,'state');end if;
 return new;end $$;
revoke all on function private.remember_privacy_change() from public,anon,authenticated;
create trigger remember_profile_privacy after update of consent_status,account_active on public.profiles for each row execute function private.remember_privacy_change();
create trigger remember_enrollment_privacy after update of active on public.enrollments for each row execute function private.remember_privacy_change();
create function private.operator_privacy_checkpoint() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('format','bookforest-privacy-checkpoint','version',1,'capturedAt',now(),'watermark',coalesce((select max(id) from private.privacy_guard_events),0),
 'profiles',coalesce((select jsonb_agg(jsonb_build_object('id',id,'active',account_active,'consent',consent_status)) from public.profiles),'[]'),
 'enrollments',coalesce((select jsonb_agg(jsonb_build_object('student',student_id,'classroom',classroom_id,'active',active)) from public.enrollments),'[]'),
 'deleted',coalesce((select jsonb_agg(distinct student_id) from private.privacy_guard_events e where kind='deleted' and not exists(select 1 from public.profiles p where p.id=e.student_id)),'[]'),
 'removedEnrollments',coalesce((select jsonb_agg(jsonb_build_object('student',student_id,'classroom',classroom_id)) from (select distinct student_id,classroom_id from private.privacy_guard_events e where kind='enrollment_deleted' and not exists(select 1 from public.enrollments m where m.student_id=e.student_id and m.classroom_id=e.classroom_id))x),'[]'),
 'deletions',coalesce((select jsonb_agg(jsonb_build_object('student',student_id,'classroom',classroom_id,'scope',scope,'at',privacy_changed_at)) from private.deletion_requests where status in('approved','purged','completed')),'[]'));
$$;
revoke all on function private.operator_privacy_checkpoint() from public,anon,authenticated;
create function private.recovery_row_allowed(p_student uuid,p_classroom uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.recovery_state where held) and not exists(select 1 from private.recovery_denials d where d.student_id=p_student and (d.classroom_id is null or d.classroom_id=p_classroom));
$$;
revoke all on function private.recovery_row_allowed(uuid,uuid) from public,anon;grant execute on function private.recovery_row_allowed(uuid,uuid) to authenticated;
-- All existing data commands pass this gate; no session is accepted while held.
do $$declare d text;begin
 d:=pg_get_functiondef('private.session_ok(boolean)'::regprocedure);
 if position('select * into p from public.profiles' in d)=0 then raise exception 'Recovery session anchor missing';end if;
 execute replace(d,'select * into p from public.profiles','if exists(select 1 from private.recovery_state where held) then return false;end if; select * into p from public.profiles');
end $$;
do $$declare t record;predicate text;begin
 for t in select table_name,bool_or(column_name='classroom_id') has_class,bool_or(column_name='assignment_id') has_assignment from information_schema.columns where table_schema='public' group by table_name having bool_or(column_name='student_id') loop
  if not exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t.table_name and c.relkind='r') then continue;end if;
  predicate:=case when t.has_class then 'private.recovery_row_allowed(student_id,classroom_id)' when t.has_assignment then format('private.recovery_row_allowed(student_id,(select a.classroom_id from public.assignments a where a.id=%I.assignment_id))',t.table_name) else 'private.recovery_row_allowed(student_id,null)' end;
  execute format('create policy recovery_guard on public.%I as restrictive for all to authenticated using(%s) with check(%s)',t.table_name,predicate,predicate);
 end loop;
end $$;
create function private.recovery_apply_checkpoint(p_checkpoint jsonb) returns jsonb language plpgsql set search_path='' as $$
declare part jsonb;blocked integer;begin
 if not exists(select 1 from private.recovery_state where held) then raise exception 'RECOVERY_HOLD_REQUIRED';end if;
 if p_checkpoint->>'format' is distinct from 'bookforest-privacy-checkpoint' or (p_checkpoint->>'version')::integer is distinct from 1 or p_checkpoint->>'capturedAt' is null or p_checkpoint->>'watermark' is null or (p_checkpoint->>'capturedAt')::timestamptz<now()-interval '24 hours' or (p_checkpoint->>'capturedAt')::timestamptz>now()+interval '1 minute' or (p_checkpoint->>'watermark')::bigint<(select watermark from private.recovery_state) then raise exception 'FRESH_PRIVACY_CHECKPOINT_REQUIRED';end if;
 foreach part in array array[p_checkpoint->'profiles',p_checkpoint->'enrollments',p_checkpoint->'deleted',p_checkpoint->'removedEnrollments',p_checkpoint->'deletions'] loop
  if jsonb_typeof(part) is distinct from 'array' then raise exception 'PRIVACY_CHECKPOINT_INVALID';end if;
 end loop;
 insert into private.recovery_denials(student_id,kind)
 select (x->>'id')::uuid,'consent_or_account' from jsonb_array_elements(p_checkpoint->'profiles')x where (x->>'consent'<>'verified' or not (x->>'active')::boolean) and exists(select 1 from public.profiles p where p.id=(x->>'id')::uuid and p.account_active and p.consent_status='verified') on conflict do nothing;
 insert into private.recovery_denials(student_id,kind) select x::uuid,'deleted_account' from jsonb_array_elements_text(p_checkpoint->'deleted')x where exists(select 1 from public.profiles p where p.id=x::uuid) on conflict do nothing;
 insert into private.recovery_denials(student_id,classroom_id,kind)
 select (x->>'student')::uuid,(x->>'classroom')::uuid,'enrollment' from jsonb_array_elements((p_checkpoint->'removedEnrollments')||(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(p_checkpoint->'enrollments')x where not (x->>'active')::boolean))x where exists(select 1 from public.enrollments e where e.student_id=(x->>'student')::uuid and e.classroom_id=(x->>'classroom')::uuid and e.active) on conflict do nothing;
 insert into private.recovery_denials(student_id,classroom_id,kind) select (x->>'student')::uuid,(x->>'classroom')::uuid,'deletion_request' from jsonb_array_elements(p_checkpoint->'deletions')x where (x->>'at')::timestamptz>coalesce((p_checkpoint->>'backupAt')::timestamptz,'-infinity') and exists(select 1 from public.profiles p where p.id=(x->>'student')::uuid) on conflict do nothing;
 update public.profiles p set account_active=false,security_cutoff=clock_timestamp() where exists(select 1 from private.recovery_denials d where d.student_id=p.id and d.classroom_id is null);
 update public.enrollments e set active=false where exists(select 1 from private.recovery_denials d where d.student_id=e.student_id and (d.classroom_id is null or d.classroom_id=e.classroom_id));
 select count(*) into blocked from private.recovery_denials;
 update private.recovery_state set held=blocked>0,watermark=(p_checkpoint->>'watermark')::bigint,checked_at=now();
 -- If older data conflicts with current privacy decisions, keep the entire
 -- restored service closed until the operator resolves those records.
 return jsonb_build_object('reconciled',true,'denials',blocked,'heldForReview',blocked>0);
end $$;
revoke all on function private.recovery_apply_checkpoint(jsonb) from public,anon,authenticated,service_role;

create table private.plaza_reports(id uuid primary key default gen_random_uuid(),post_id uuid not null references public.plaza_posts(id) on delete cascade,classroom_id uuid not null references public.classrooms(id) on delete cascade,reporter_id uuid references public.profiles(id) on delete set null,reason text not null check(reason in('privacy','hurtful','other')),note text not null check(length(note)<=500),status text not null default 'open' check(status in('open','kept','hidden')),revision integer not null default 1,reviewed_by uuid references public.profiles(id) on delete set null,created_at timestamptz not null default now(),reviewed_at timestamptz);
create unique index plaza_one_open_report_idx on private.plaza_reports(post_id,reporter_id) where status='open';
create index plaza_report_queue_idx on private.plaza_reports(classroom_id,status,created_at desc,id);
create table private.plaza_report_requests(actor_id uuid references public.profiles(id) on delete cascade,request_id uuid,fingerprint text not null,result jsonb not null,primary key(actor_id,request_id));
alter table private.plaza_reports enable row level security;alter table private.plaza_report_requests enable row level security;
revoke all on private.plaza_reports,private.plaza_report_requests from public,anon,authenticated;
create function public.plaza_report_state(p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.data_session() then raise exception 'BF_FORBIDDEN';end if;
 if p_page is null or p_page not between 1 and 100000 then raise exception 'BF_INVALID_INPUT';end if;
 return jsonb_build_object('page',p_page,'total',(select count(*) from private.plaza_reports r where r.reporter_id=auth.uid() or private.is_teacher(r.classroom_id)),
 'rows',coalesce((select jsonb_agg(to_jsonb(x)) from(select r.id,r.post_id,r.reason,r.note,r.status,r.revision,r.created_at,r.reviewed_at,private.is_teacher(r.classroom_id) can_review,
 case when private.plaza_visible(r.post_id) then p.title else '게시가 종료된 작품' end title
 from private.plaza_reports r join public.plaza_posts p on p.id=r.post_id where r.reporter_id=auth.uid() or private.is_teacher(r.classroom_id) order by (r.status='open') desc,r.created_at desc,r.id limit 20 offset (p_page-1)*20)x),'[]'));
end $$;
create function public.plaza_report_command(p_action text,p_payload jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.plaza_posts;r private.plaza_reports;prev private.plaza_report_requests;fp text;result jsonb;reason text;note text;begin
 if not private.data_session() then raise exception 'BF_FORBIDDEN';end if;
 if p_action is null or p_action not in('report','keep','hide') or p_request is null or jsonb_typeof(p_payload) is distinct from 'object' or length(p_payload::text)>3000 then raise exception 'BF_INVALID_INPUT';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 fp:=encode(sha256(convert_to(p_action||p_payload::text,'UTF8')),'hex');
 select * into prev from private.plaza_report_requests where actor_id=auth.uid() and request_id=p_request;
 if found then if prev.fingerprint<>fp then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;return prev.result;end if;
 if p_action='report' then
  select * into p from public.plaza_posts where id=(p_payload->>'post')::uuid for update;
  reason:=p_payload->>'reason';note:=btrim(coalesce(p_payload->>'note',''));
  if p.id is null or p.status<>'published' or not private.plaza_visible(p.id) then raise exception 'BF_FORBIDDEN';end if;
  if reason is null or reason not in('privacy','hurtful','other') or length(note)>500 then raise exception 'BF_INVALID_INPUT';end if;
  select * into r from private.plaza_reports where post_id=p.id and reporter_id=auth.uid() and status='open';
  if r.id is null then insert into private.plaza_reports(post_id,classroom_id,reporter_id,reason,note) values(p.id,p.classroom_id,auth.uid(),reason,note) returning * into r;end if;
 else
  select * into r from private.plaza_reports where id=(p_payload->>'id')::uuid;
  if r.id is null or not private.is_teacher(r.classroom_id) then raise exception 'BF_FORBIDDEN';end if;
  perform 1 from public.classrooms where id=r.classroom_id for update;
  perform 1 from public.plaza_posts where id=r.post_id for update;
  select * into r from private.plaza_reports where id=r.id for update;
  if r.status<>'open' or r.revision is distinct from (p_payload->>'revision')::integer then raise exception 'BF_REPORT_CONFLICT';end if;
  if p_action='hide' then update public.plaza_posts set status='withdrawn' where id=r.post_id;end if;
  update private.plaza_reports set status=case when p_action='hide' then 'hidden' else 'kept' end,revision=revision+1,reviewed_by=auth.uid(),reviewed_at=now() where id=r.id returning * into r;
  perform private.ops_audit('plaza_report_reviewed',null,r.classroom_id);
 end if;
 result:=jsonb_build_object('id',r.id,'status',r.status);
 insert into private.plaza_report_requests values(auth.uid(),p_request,fp,result);return result;
end $$;
revoke all on function public.plaza_report_state(integer),public.plaza_report_command(text,jsonb,uuid) from public,anon;
grant execute on function public.plaza_report_state(integer),public.plaza_report_command(text,jsonb,uuid) to authenticated;

create or replace function public.service_release_contract() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('protocol',2,'minimumWorkerProtocol',2,'reportReview',true,'scopedStaff',true,
 'operationsCompletion',exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='plaza_report_command'),
 'exportJobs',exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='google_export_job'));
$$;
