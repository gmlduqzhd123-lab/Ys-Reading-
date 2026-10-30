-- Account operations are separate from learning data. No passwords or writing are kept here.
alter table public.profiles add column account_active boolean not null default true;
alter table public.profiles add column must_change_password boolean not null default false;
alter table public.profiles add column security_cutoff timestamptz;
create table private.operators(user_id uuid primary key references public.profiles(id),created_at timestamptz not null default now());
create table private.managed_accounts(student_id uuid primary key references public.profiles(id),classroom_id uuid not null references public.classrooms(id),login_id text not null unique);
create index managed_accounts_class_idx on private.managed_accounts(classroom_id);
create table private.operations_audit(id uuid primary key default gen_random_uuid(),actor_id uuid,subject_id uuid,classroom_id uuid,event text not null,created_at timestamptz not null default now());
create index operations_audit_class_idx on private.operations_audit(classroom_id,created_at desc);
create table private.consent_requests(id uuid primary key default gen_random_uuid(),student_id uuid not null references public.profiles(id),classroom_id uuid not null references public.classrooms(id),requested_by uuid not null,method text not null check(method in ('paper','school_system')),reference text not null check(length(reference) between 1 and 100),confirmed_on date not null,status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),decided_by uuid,created_at timestamptz not null default now());
create unique index consent_one_pending_idx on private.consent_requests(student_id) where status='pending';
create index consent_class_idx on private.consent_requests(classroom_id,created_at desc);
create table private.retention_policies(classroom_id uuid primary key references public.classrooms(id),days integer not null check(days between 30 and 3650),updated_at timestamptz not null default now());
create table private.deletion_requests(id uuid primary key default gen_random_uuid(),student_id uuid not null,classroom_id uuid references public.classrooms(id),scope text not null check(scope in ('class_records','account')),requested_by uuid not null,reason text not null check(reason in ('request','retention')),expires_before timestamptz,status text not null default 'pending' check(status in ('pending','approved','rejected','purged','completed')),decided_by uuid,created_at timestamptz not null default now(),completed_at timestamptz,check((scope='account')=(classroom_id is null)));
create unique index deletion_one_open_idx on private.deletion_requests(student_id,coalesce(classroom_id,'00000000-0000-0000-0000-000000000000'::uuid)) where status in ('pending','approved','purged');
create index deletion_class_idx on private.deletion_requests(classroom_id,created_at desc);
create table private.teacher_requests(user_id uuid primary key references public.profiles(id),status text not null default 'pending' check(status in ('pending','approved','rejected')),created_at timestamptz not null default now());
create table private.operation_replays(actor_id uuid not null,request_id uuid not null,command text not null,payload jsonb not null,result jsonb not null,primary key(actor_id,request_id));
create table private.account_jobs(id uuid primary key default gen_random_uuid(),actor_id uuid not null,request_id uuid not null,kind text not null check(kind in ('create_students','reset_password','change_password','delete_account')),fingerprint text not null,plan jsonb not null,results jsonb not null default '{}',lease uuid not null,lease_until timestamptz not null,done boolean not null default false,created_at timestamptz not null default now(),unique(actor_id,request_id));
revoke all on all tables in schema private from public,anon,authenticated;

create function private.session_ok(p_allow_password_change boolean default false) returns boolean language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; sid uuid; valid boolean;
begin
 select * into p from public.profiles where id=auth.uid();
 if not found or not p.account_active or (p.must_change_password and not p_allow_password_change) then return false; end if;
 if p.security_cutoff is null then return true; end if;
 begin sid:=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid; exception when others then return false; end;
 if sid is null then return false; end if;
 -- A revoked JWT stays cryptographically valid. Only sessions created after the cutoff may proceed.
 execute 'select exists(select 1 from auth.sessions where id=$1 and user_id=$2 and created_at>$3)' into valid using sid,p.id,p.security_cutoff;
 return valid;
end $$;
create function private.is_operator() returns boolean language sql stable security definer set search_path='' as $$select private.session_ok(false) and exists(select 1 from private.operators where user_id=auth.uid())$$;
create function public.account_session() returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('fresh',private.session_ok(true),'ready',private.session_ok(false),'operator',private.is_operator())$$;
create function private.data_session() returns boolean language sql stable security definer set search_path='' as $$select private.session_ok(false) and exists(select 1 from public.profiles where id=auth.uid() and (role='teacher' or consent_status='verified'))$$;
revoke all on function private.session_ok(boolean),private.is_operator(),private.data_session(),public.account_session() from public;
grant execute on function private.session_ok(boolean),private.is_operator(),private.data_session(),public.account_session() to authenticated;

-- Apply an additional restrictive gate to every learning table. Own profile remains readable
-- so a suspended account can see an accurate status and sign out.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' and tablename not in ('profiles','missions') loop
 execute format('create policy account_gate on public.%I as restrictive for all to authenticated using ((select private.data_session())) with check ((select private.data_session()))',t.tablename);
 end loop;
end $$;
create policy profile_account_gate on public.profiles as restrictive for select to authenticated using(id=(select auth.uid()) or (select private.session_ok(false)));
-- Calls to definer RPCs need the same gate; moving implementations keeps their existing
-- snapshots and authorization logic intact. The private implementations have no client grant.
do $$ declare f record; args text; begin
 for f in select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) identity_args,pg_get_function_arguments(p.oid) full_args,pg_get_function_result(p.oid) result,p.proargnames from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.proname<>'account_session' loop
 select string_agg(quote_ident(a),',') into args from unnest(f.proargnames) a;
 execute format('alter function public.%I(%s) set schema private',f.proname,f.identity_args);
 execute format('alter function private.%I(%s) rename to %I',f.proname,f.identity_args,'legacy_'||f.proname);
 execute format('revoke all on function private.%I(%s) from public,anon,authenticated','legacy_'||f.proname,f.identity_args);
 execute format('create function public.%I(%s) returns %s language plpgsql security definer set search_path='''' as $guard$ begin if not private.session_ok(false) then raise exception ''BF_ACCOUNT_BLOCKED''; end if; return private.%I(%s); end $guard$',f.proname,f.full_args,f.result,'legacy_'||f.proname,args);
 execute format('revoke all on function public.%I(%s) from public,anon',f.proname,f.identity_args);
 execute format('grant execute on function public.%I(%s) to authenticated',f.proname,f.identity_args);
 end loop;
end $$;

create or replace function private.is_active_student(p_classroom_id uuid) returns boolean language sql stable security definer set search_path='' as $$
select private.data_session() and exists(select 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.classroom_id=p_classroom_id and e.student_id=auth.uid() and e.active and p.role='student' and p.consent_status='verified') and not exists(select 1 from private.deletion_requests d where d.student_id=auth.uid() and (d.classroom_id=p_classroom_id or d.scope='account') and d.status in ('approved','purged'))$$;
create or replace function private.is_teacher(p_classroom_id uuid) returns boolean language sql stable security definer set search_path='' as $$select private.session_ok(false) and exists(select 1 from public.classrooms c join public.profiles p on p.id=c.teacher_id where c.id=p_classroom_id and c.teacher_id=auth.uid() and p.role='teacher')$$;
create or replace function private.plaza_visible(p_post uuid) returns boolean language sql stable security definer set search_path='' as $$
select private.data_session() and exists(select 1 from public.plaza_posts p join public.profiles owner on owner.id=p.student_id where p.id=p_post and
(p.student_id=auth.uid() or private.is_teacher(p.classroom_id) or (p.status='published' and owner.consent_status='verified' and owner.account_active and not exists(select 1 from private.deletion_requests d where d.student_id=owner.id and (d.classroom_id=p.classroom_id or d.scope='account') and d.status in ('approved','purged')) and
(case when p.group_id is null then private.is_active_student(p.classroom_id) else private.in_grade(p.group_id) end))))$$;

create function private.can_manage_student(p_student uuid,p_class uuid) returns boolean language sql stable security definer set search_path='' as $$select private.is_operator() or (private.is_teacher(p_class) and exists(select 1 from public.enrollments where student_id=p_student and classroom_id=p_class) and exists(select 1 from public.profiles where id=p_student and role='student'))$$;
create function private.ops_audit(p_event text,p_subject uuid default null,p_class uuid default null) returns void language sql security definer set search_path='' as $$insert into private.operations_audit(actor_id,subject_id,classroom_id,event) values(auth.uid(),p_subject,p_class,p_event)$$;
create function private.last_student_activity(p_student uuid,p_class uuid) returns timestamptz language sql stable security definer set search_path='' as $$
 select max(at) from (
 select created_at at from public.enrollments where student_id=p_student and classroom_id=p_class
 union all select updated_at from public.reading_logs where student_id=p_student and classroom_id=p_class
 union all select d.updated_at from public.drafts d join public.assignments a on a.id=d.assignment_id where d.student_id=p_student and a.classroom_id=p_class
 union all select s.created_at from public.submissions s join public.assignments a on a.id=s.assignment_id where s.student_id=p_student and a.classroom_id=p_class
 union all select f.created_at from public.feedback f join public.submissions s on s.id=f.submission_id join public.assignments a on a.id=s.assignment_id where s.student_id=p_student and a.classroom_id=p_class
 union all select e.created_at from public.entries e join public.submissions s on s.id=e.submission_id join public.assignments a on a.id=s.assignment_id where e.student_id=p_student and a.classroom_id=p_class
 union all select r.created_at from public.reviews r join public.entries e on e.id=r.entry_id join public.submissions s on s.id=e.submission_id join public.assignments a on a.id=s.assignment_id where e.student_id=p_student and a.classroom_id=p_class
 union all select created_at from public.economy_ledger where student_id=p_student and classroom_id=p_class
 union all select created_at from public.activity_events where student_id=p_student and classroom_id=p_class
 union all select created_at from public.shop_orders where student_id=p_student and classroom_id=p_class
 union all select created_at from public.plaza_posts where student_id=p_student and classroom_id=p_class
 union all select r.created_at from public.plaza_reactions r join public.plaza_posts p on p.id=r.post_id where (r.student_id=p_student or p.student_id=p_student) and p.classroom_id=p_class
 ) x $$;
revoke all on function private.can_manage_student(uuid,uuid),private.ops_audit(text,uuid,uuid),private.last_student_activity(uuid,uuid) from public,anon,authenticated;

create function public.operations_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare op boolean; result jsonb;
begin
 if not private.session_ok(true) then raise exception 'BF_ACCOUNT_BLOCKED'; end if;
 op:=private.is_operator();
 select jsonb_build_object(
 'operator',op,
 'groups',case when op then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'owner_id',owner_id)) from public.grade_groups),'[]') else '[]'::jsonb end,
 'classes',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('retention_days',r.days)) from public.classrooms c left join private.retention_policies r on r.classroom_id=c.id where op or private.is_teacher(c.id)),'[]'),
 'students',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'consent_status',p.consent_status,'account_active',p.account_active,'must_change_password',p.must_change_password,'classroom_id',e.classroom_id,'active',e.active,'login_id',m.login_id,'last_activity',private.last_student_activity(p.id,e.classroom_id))) from public.enrollments e join public.profiles p on p.id=e.student_id left join private.managed_accounts m on m.student_id=p.id where op or private.is_teacher(e.classroom_id)),'[]'),
 'teachers',case when op then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'account_active',p.account_active)) from public.profiles p where role='teacher'),'[]') else '[]'::jsonb end,
 'teacher_requests',case when op then coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('display_name',p.display_name)) from private.teacher_requests r join public.profiles p on p.id=r.user_id where r.status='pending'),'[]') else '[]'::jsonb end,
 'consents',coalesce((select jsonb_agg(to_jsonb(r)) from private.consent_requests r where op or r.student_id=auth.uid() or private.is_teacher(r.classroom_id)),'[]'),
 'deletions',coalesce((select jsonb_agg(to_jsonb(r)) from private.deletion_requests r where op or r.student_id=auth.uid() or private.is_teacher(r.classroom_id)),'[]'),
 'audit',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from private.operations_audit a where op or a.actor_id=auth.uid() or private.is_teacher(a.classroom_id) order by created_at desc limit 100) x),'[]')
 ) into result;
 return result;
end $$;

create function public.operations_command(p_command text,p_payload jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles; target uuid; cls uuid; req uuid; op boolean; replay private.operation_replays; r private.deletion_requests; cr private.consent_requests; result jsonb:='{}'; d integer; other uuid;
begin
 if not private.session_ok(false) then raise exception 'BF_ACCOUNT_BLOCKED'; end if;
 if p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>4000 then raise exception 'BF_INVALID_INPUT'; end if;
 select * into a from public.profiles where id=auth.uid() for update; op:=private.is_operator();
 select * into replay from private.operation_replays where actor_id=a.id and request_id=p_request_id;
 if found then if replay.command<>p_command or replay.payload<>p_payload then raise exception 'BF_IDEMPOTENCY_CONFLICT'; end if; return replay.result; end if;
 target:=nullif(p_payload->>'studentId','')::uuid; cls:=nullif(p_payload->>'classroomId','')::uuid; req:=nullif(p_payload->>'id','')::uuid;
 case p_command
 when 'teacher_request' then
 if a.role<>'student' or exists(select 1 from public.enrollments where student_id=a.id) or exists(select 1 from private.managed_accounts where student_id=a.id) then raise exception 'BF_FORBIDDEN'; end if;
 insert into private.teacher_requests(user_id) values(a.id) on conflict(user_id) do update set status='pending';
 when 'teacher_decide' then
 if not op then raise exception 'BF_FORBIDDEN'; end if;
 if not exists(select 1 from private.teacher_requests where user_id=target and status='pending') then raise exception 'BF_NOT_FOUND'; end if;
 if exists(select 1 from public.enrollments where student_id=target) or exists(select 1 from private.managed_accounts where student_id=target) then raise exception 'BF_FORBIDDEN'; end if;
 update private.teacher_requests set status=case when p_payload->>'approve'='true' then 'approved' else 'rejected' end where user_id=target;
 if p_payload->>'approve'='true' then update public.profiles set role='teacher' where id=target; end if;
 when 'consent_request' then
 if not private.is_teacher(cls) or not private.can_manage_student(target,cls) then raise exception 'BF_FORBIDDEN'; end if;
 if p_payload->>'method' not in ('paper','school_system') or length(btrim(coalesce(p_payload->>'reference',''))) not between 1 and 100 or (p_payload->>'confirmedOn')::date>current_date or (p_payload->>'confirmedOn')::date<current_date-366 then raise exception 'BF_INVALID_INPUT'; end if;
 insert into private.consent_requests(student_id,classroom_id,requested_by,method,reference,confirmed_on) values(target,cls,a.id,p_payload->>'method',btrim(p_payload->>'reference'),(p_payload->>'confirmedOn')::date) returning id into req;
 when 'consent_decide' then
 if not op then raise exception 'BF_FORBIDDEN'; end if;
 select * into cr from private.consent_requests where id=req and status='pending' for update;
 if not found then raise exception 'BF_NOT_FOUND'; end if;
 target:=cr.student_id; cls:=cr.classroom_id;
 if p_payload->>'approve'='true' then
 if p_payload->>'evidenceChecked' is distinct from 'true' then raise exception 'BF_EVIDENCE_REQUIRED'; end if;
 update public.profiles set consent_status='verified' where id=target and role='student';
 end if;
 update private.consent_requests set status=case when p_payload->>'approve'='true' then 'approved' else 'rejected' end,decided_by=a.id where id=req;
 when 'consent_withdraw' then
 target:=coalesce(target,a.id);
 if (target<>a.id and not op) or not exists(select 1 from public.profiles where id=target and role='student') then raise exception 'BF_FORBIDDEN'; end if;
 update public.profiles set consent_status='pending' where id=target;
 update private.consent_requests set status='withdrawn',decided_by=a.id where student_id=target and status in ('pending','approved');
 when 'retention_set' then
 if not private.is_teacher(cls) and not op then raise exception 'BF_FORBIDDEN'; end if;
 if p_payload->>'days' is null then delete from private.retention_policies where classroom_id=cls;
 else d:=(p_payload->>'days')::integer; insert into private.retention_policies(classroom_id,days) values(cls,d) on conflict(classroom_id) do update set days=excluded.days,updated_at=now(); end if;
 when 'deletion_request' then
 target:=coalesce(target,a.id);
 if not exists(select 1 from public.profiles where id=target and role='student') then raise exception 'BF_FORBIDDEN'; end if;
 if cls is null then if target<>a.id and not op then raise exception 'BF_FORBIDDEN'; end if;
 else if not private.can_manage_student(target,cls) then raise exception 'BF_FORBIDDEN'; end if; end if;
 if p_payload->>'retention'='true' then
 select days into d from private.retention_policies where classroom_id=cls;
 if d is null or private.last_student_activity(target,cls) is null or private.last_student_activity(target,cls)>=now()-make_interval(days=>d) then raise exception 'BF_NOT_EXPIRED'; end if;
 end if;
 insert into private.deletion_requests(student_id,classroom_id,scope,requested_by,reason,expires_before) values(target,cls,case when cls is null then 'account' else 'class_records' end,a.id,case when p_payload->>'retention'='true' then 'retention' else 'request' end,case when p_payload->>'retention'='true' then now()-make_interval(days=>d) end) returning id into req;
 when 'deletion_decide' then
 if not op then raise exception 'BF_FORBIDDEN'; end if;
 select * into r from private.deletion_requests where id=req and status='pending' for update;
 if not found then raise exception 'BF_NOT_FOUND'; end if;
 target:=r.student_id; cls:=r.classroom_id;
 if p_payload->>'approve'='true' and p_payload->>'confirmed' is distinct from 'true' then raise exception 'BF_CONFIRM_REQUIRED'; end if;
 update private.deletion_requests set status=case when p_payload->>'approve'='true' then 'approved' else 'rejected' end,decided_by=a.id where id=req;
 if p_payload->>'approve'='true' and r.scope='account' then update public.profiles set account_active=false,security_cutoff=clock_timestamp() where id=target; end if;
 when 'class_handover' then
 if not op then raise exception 'BF_FORBIDDEN'; end if;
 other:=(p_payload->>'teacherId')::uuid;
 if not exists(select 1 from public.profiles where id=other and role='teacher' and account_active and not must_change_password) then raise exception 'BF_FORBIDDEN'; end if;
 update public.classrooms set teacher_id=other where id=cls;
 if not found then raise exception 'BF_NOT_FOUND'; end if;
 when 'group_handover' then
 if not op then raise exception 'BF_FORBIDDEN'; end if;
 other:=(p_payload->>'teacherId')::uuid;
 if not exists(select 1 from public.profiles where id=other and role='teacher' and account_active and not must_change_password) then raise exception 'BF_FORBIDDEN'; end if;
 update public.grade_groups set owner_id=other where id=req;
 if not found then raise exception 'BF_NOT_FOUND'; end if;
 when 'account_status' then
 if not op or target=a.id or exists(select 1 from private.operators where user_id=target) then raise exception 'BF_FORBIDDEN'; end if;
 if exists(select 1 from private.deletion_requests where student_id=target and scope='account' and status in ('approved','purged')) then raise exception 'BF_DELETION_PENDING'; end if;
 if p_payload->>'active'='false' and (exists(select 1 from public.classrooms where teacher_id=target) or exists(select 1 from public.grade_groups where owner_id=target)) then raise exception 'BF_HANDOVER_REQUIRED'; end if;
 update public.profiles set account_active=(p_payload->>'active')::boolean,security_cutoff=clock_timestamp() where id=target;
 if not found then raise exception 'BF_NOT_FOUND'; end if;
 else raise exception 'BF_INVALID_COMMAND'; end case;
 result:=jsonb_build_object('id',req,'ok',true);
 perform private.ops_audit(p_command,target,cls);
 insert into private.operation_replays values(a.id,p_request_id,p_command,p_payload,result);
 return result;
end $$;

-- Delete previews never return writing or passwords. Learning snapshots may only be
-- deleted by this approved, scoped service transaction; they still cannot be edited.
create function public.deletion_preview(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r private.deletion_requests; result jsonb;
begin
 select * into r from private.deletion_requests where id=p_id;
 if not found or not private.session_ok(false) or not(private.is_operator() or r.student_id=auth.uid() or private.is_teacher(r.classroom_id)) then raise exception 'BF_FORBIDDEN'; end if;
 select jsonb_build_object('reading_logs',(select count(*) from public.reading_logs where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id)),
 'submissions',(select count(*) from public.submissions s join public.assignments a on a.id=s.assignment_id where s.student_id=r.student_id and (r.classroom_id is null or a.classroom_id=r.classroom_id)),
 'plaza_posts',(select count(*) from public.plaza_posts where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id)),
 'ledger',(select count(*) from public.economy_ledger where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id)),
 'auth_account',r.scope='account','retention_eligible',r.expires_before is null or private.last_student_activity(r.student_id,r.classroom_id)<r.expires_before) into result;
 return result;
end $$;
create or replace function private.protect_snapshot() returns trigger language plpgsql set search_path='' as $$
declare r private.deletion_requests;
begin
 if tg_op='DELETE' and current_user not in ('anon','authenticated','authenticator') then
 select * into r from private.deletion_requests where id=nullif(current_setting('bookforest.purge_request',true),'')::uuid and status='approved';
 if found and old.student_id=r.student_id and (r.classroom_id is null or old.classroom_id=r.classroom_id) then return old; end if;
 end if;
 raise exception 'BF_IMMUTABLE_SNAPSHOT';
end $$;
create function public.operations_purge(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.deletion_requests; subs uuid[]; posts uuid[];
begin
 select * into r from private.deletion_requests where id=p_id for update;
 if not found then raise exception 'BF_NOT_FOUND'; end if;
 if r.status in ('purged','completed') then return jsonb_build_object('scope',r.scope,'studentId',r.student_id); end if;
 if r.status<>'approved' then raise exception 'BF_FORBIDDEN'; end if;
 perform 1 from public.profiles where id=r.student_id for update;
 if r.expires_before is not null and coalesce(private.last_student_activity(r.student_id,r.classroom_id),'infinity')>=r.expires_before then raise exception 'BF_NOT_EXPIRED'; end if;
 select coalesce(array_agg(s.id),'{}'::uuid[]) into subs from public.submissions s join public.assignments a on a.id=s.assignment_id where s.student_id=r.student_id and (r.classroom_id is null or a.classroom_id=r.classroom_id);
 select coalesce(array_agg(id),'{}'::uuid[]) into posts from public.plaza_posts where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id);
 delete from public.plaza_reactions pr where post_id=any(posts) or (pr.student_id=r.student_id and (r.classroom_id is null or exists(select 1 from public.plaza_posts p where p.id=pr.post_id and p.classroom_id=r.classroom_id)));
 delete from public.plaza_posts where id=any(posts);
 delete from public.reviews where entry_id in(select id from public.entries where submission_id=any(subs));
 delete from public.entries where submission_id=any(subs);
 delete from public.feedback where submission_id=any(subs);
 delete from public.badges where source_submission_id=any(subs);
 delete from public.drafts d where student_id=r.student_id and (r.classroom_id is null or exists(select 1 from public.assignments a where a.id=d.assignment_id and a.classroom_id=r.classroom_id));
 delete from public.submissions where id=any(subs);
 perform set_config('bookforest.purge_request',r.id::text,true);
 delete from public.economy_ledger where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id);
 delete from public.activity_events where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id);
 perform set_config('bookforest.purge_request','',true);
 delete from public.achievement_badges where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id);
 delete from public.shop_orders where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id);
 delete from public.reading_logs where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id);
 -- Replay copies can contain submitted text, including a teacher's verification result.
 delete from private.hub_requests where (actor_id=r.student_id and (r.classroom_id is null or payload->>'classroomId'=r.classroom_id::text or result->>'classroom_id'=r.classroom_id::text)) or (result->>'student_id'=r.student_id::text and (r.classroom_id is null or result->>'classroom_id'=r.classroom_id::text));
 delete from public.enrollment_requests where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id);
 delete from public.enrollments where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id);
 delete from private.managed_accounts where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id);
 delete from private.consent_requests where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id);
 if r.scope='account' then
 delete from public.character_profiles where student_id=r.student_id;
 delete from private.teacher_requests where user_id=r.student_id;
 delete from private.operation_replays where actor_id=r.student_id;
 delete from private.hub_requests where actor_id=r.student_id;
 update public.audit_events set actor_id=null where actor_id=r.student_id;
 end if;
 update private.deletion_requests set status=case when scope='account' then 'purged' else 'completed' end,completed_at=case when scope='class_records' then now() end where id=r.id;
 insert into private.operations_audit(actor_id,subject_id,classroom_id,event) values(r.decided_by,r.student_id,r.classroom_id,'records_purged');
 return jsonb_build_object('scope',r.scope,'studentId',r.student_id);
end $$;

create function public.account_job_begin(p_kind text,p_payload jsonb,p_request_id uuid,p_fingerprint text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles; j private.account_jobs; plan jsonb; item jsonb; cls uuid; target uuid; ids text[]:='{}'; r private.deletion_requests;
begin
 if not private.session_ok(p_kind='change_password') then raise exception 'BF_ACCOUNT_BLOCKED'; end if;
 if p_request_id is null or length(p_fingerprint)<>64 or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>12000 then raise exception 'BF_INVALID_INPUT'; end if;
 select * into a from public.profiles where id=auth.uid() for update;
 select * into j from private.account_jobs where actor_id=a.id and request_id=p_request_id for update;
 if found then
 if j.kind<>p_kind or j.fingerprint<>p_fingerprint then raise exception 'BF_IDEMPOTENCY_CONFLICT'; end if;
 if j.done then return to_jsonb(j); end if;
 if j.lease_until>clock_timestamp() then raise exception 'BF_BUSY'; end if;
 -- Recheck the caller's current authority on every retry.
 cls:=(j.plan->>'classroomId')::uuid; target:=(j.plan->>'studentId')::uuid;
 if p_kind='create_students' and not private.is_teacher(cls) then raise exception 'BF_FORBIDDEN'; end if;
 if p_kind='reset_password' and not private.can_manage_student(target,cls) then raise exception 'BF_FORBIDDEN'; end if;
 if p_kind='delete_account' and not private.is_operator() then raise exception 'BF_FORBIDDEN'; end if;
 update private.account_jobs set lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes' where id=j.id returning * into j;
 return to_jsonb(j);
 end if;
 cls:=nullif(p_payload->>'classroomId','')::uuid; target:=nullif(p_payload->>'studentId','')::uuid;
 case p_kind
 when 'create_students' then
 if not private.is_teacher(cls) or jsonb_typeof(p_payload->'students') is distinct from 'array' or jsonb_array_length(p_payload->'students') not between 1 and 30 then raise exception 'BF_FORBIDDEN'; end if;
 plan:=jsonb_build_object('classroomId',cls,'items','[]'::jsonb);
 for item in select value from jsonb_array_elements(p_payload->'students') loop
 if coalesce(item->>'loginId','')!~'^[a-z0-9][a-z0-9_-]{3,31}$' or length(btrim(coalesce(item->>'name',''))) not between 1 and 40 or item->>'loginId'=any(ids) then raise exception 'BF_INVALID_INPUT'; end if;
 if exists(select 1 from private.managed_accounts where login_id=item->>'loginId') then raise exception 'BF_LOGIN_TAKEN'; end if;
 ids:=array_append(ids,item->>'loginId');
 plan:=jsonb_set(plan,'{items}',(plan->'items')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'loginId',item->>'loginId','name',btrim(item->>'name'))));
 end loop;
 when 'reset_password' then
 if not private.can_manage_student(target,cls) or not exists(select 1 from public.profiles where id=target and role='student') or exists(select 1 from private.deletion_requests where student_id=target and status in ('approved','purged')) then raise exception 'BF_FORBIDDEN'; end if;
 update public.profiles set must_change_password=true,security_cutoff=clock_timestamp() where id=target;
 plan:=jsonb_build_object('studentId',target,'classroomId',cls,'items',jsonb_build_array(jsonb_build_object('id',target)));
 when 'change_password' then
 target:=a.id;
 plan:=jsonb_build_object('studentId',target,'items',jsonb_build_array(jsonb_build_object('id',target)));
 when 'delete_account' then
 if not private.is_operator() then raise exception 'BF_FORBIDDEN'; end if;
 select * into r from private.deletion_requests where id=(p_payload->>'id')::uuid and status in ('approved','purged','completed');
 if not found then raise exception 'BF_NOT_FOUND'; end if;
 plan:=jsonb_build_object('deletionId',r.id,'studentId',r.student_id,'classroomId',r.classroom_id,'items',jsonb_build_array(jsonb_build_object('id',r.student_id)));
 else raise exception 'BF_INVALID_COMMAND'; end case;
 insert into private.account_jobs(actor_id,request_id,kind,fingerprint,plan,lease,lease_until) values(a.id,p_request_id,p_kind,p_fingerprint,plan,gen_random_uuid(),clock_timestamp()+interval '2 minutes') returning * into j;
 return to_jsonb(j);
end $$;

-- Service-only finalization is called after Auth confirms its result. Client callers
-- cannot mark a password changed, approve themselves, or choose a different user ID.
create function public.account_job_finish(p_id uuid,p_lease uuid,p_index integer,p_success boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.account_jobs; item jsonb; target uuid; cls uuid; n integer; r private.deletion_requests;
begin
 select * into j from private.account_jobs where id=p_id for update;
 if not found or j.lease<>p_lease then raise exception 'BF_STALE_JOB'; end if;
 n:=jsonb_array_length(j.plan->'items');
 if p_index<0 or p_index>=n then raise exception 'BF_INVALID_INPUT'; end if;
 if j.results->>p_index::text='done' then return to_jsonb(j); end if;
 if not p_success then update private.account_jobs set lease_until=clock_timestamp() where id=j.id returning * into j; return to_jsonb(j); end if;
 item:=j.plan->'items'->p_index; target:=(item->>'id')::uuid; cls:=(j.plan->>'classroomId')::uuid;
 case j.kind
 when 'create_students' then
 if not exists(select 1 from public.classrooms c join public.profiles p on p.id=c.teacher_id where c.id=cls and c.teacher_id=j.actor_id and p.account_active and p.role='teacher') then raise exception 'BF_FORBIDDEN'; end if;
 update public.profiles set display_name=item->>'name',must_change_password=true where id=target and role='student' and consent_status='pending';
 if not found then raise exception 'BF_NOT_FOUND'; end if;
 insert into private.managed_accounts values(target,cls,item->>'loginId');
 insert into public.enrollments(classroom_id,student_id) values(cls,target);
 when 'reset_password' then null;
 when 'change_password' then update public.profiles set must_change_password=false,security_cutoff=clock_timestamp() where id=target;
 when 'delete_account' then
 select * into r from private.deletion_requests where id=(j.plan->>'deletionId')::uuid for update;
 if r.status not in ('purged','completed') then raise exception 'BF_NOT_PURGED'; end if;
 update private.deletion_requests set status='completed',completed_at=now() where id=r.id;
 end case;
 insert into private.operations_audit(actor_id,subject_id,classroom_id,event) values(j.actor_id,target,cls,j.kind);
 update private.account_jobs set results=jsonb_set(results,array[p_index::text],'"done"'),done=(select count(*)+1>=n from jsonb_each_text(results) where value='done') where id=j.id returning * into j;
 return to_jsonb(j);
end $$;

revoke all on function public.operations_state(),public.operations_command(text,jsonb,uuid),public.deletion_preview(uuid),public.account_job_begin(text,jsonb,uuid,text),public.operations_purge(uuid),public.account_job_finish(uuid,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.operations_state(),public.operations_command(text,jsonb,uuid),public.deletion_preview(uuid),public.account_job_begin(text,jsonb,uuid,text) to authenticated;
grant execute on function public.operations_purge(uuid),public.account_job_finish(uuid,uuid,integer,boolean) to service_role;
-- The first operator is deliberately assigned by the project owner, never by signup metadata.
create function public.bootstrap_operator(p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_user_id and role='teacher' and account_active and not must_change_password) then raise exception 'BF_TEACHER_REQUIRED'; end if;
 insert into private.operators(user_id) values(p_user_id) on conflict do nothing;
 insert into private.operations_audit(subject_id,event) values(p_user_id,'operator_assigned_by_owner');
end $$;
revoke all on function public.bootstrap_operator(uuid) from public,anon,authenticated;
grant execute on function public.bootstrap_operator(uuid) to service_role;
