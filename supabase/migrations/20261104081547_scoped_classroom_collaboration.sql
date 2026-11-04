create table private.schools(id uuid primary key default gen_random_uuid(),name text not null check(length(btrim(name)) between 1 and 80),created_by uuid references public.profiles(id),created_at timestamptz not null default now());
alter table public.classrooms add column school_id uuid references private.schools(id);
create index classrooms_school_idx on public.classrooms(school_id);
create table private.school_staff(school_id uuid not null references private.schools(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,active boolean not null default true,expires_at timestamptz not null,revision integer not null default 1,primary key(school_id,user_id));
create index school_staff_user_idx on private.school_staff(user_id,school_id) where active;
create table private.classroom_staff(classroom_id uuid not null references public.classrooms(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,permissions text[] not null check(cardinality(permissions) between 1 and 3 and permissions<@array['read','review','students']),active boolean not null default true,expires_at timestamptz not null,revision integer not null default 1,primary key(classroom_id,user_id));
create index classroom_staff_user_idx on private.classroom_staff(user_id,classroom_id) where active;
create table private.staff_invitations(id uuid primary key default gen_random_uuid(),kind text not null check(kind in('classroom','school','operator')),classroom_id uuid references public.classrooms(id) on delete cascade,school_id uuid references private.schools(id) on delete cascade,target_id uuid not null references public.profiles(id) on delete cascade,invited_by uuid not null references public.profiles(id),permissions text[] not null default '{}',token_hash text not null unique,expires_at timestamptz not null,accepted_at timestamptz,revoked_at timestamptz,created_at timestamptz not null default now());
create index staff_invitations_owner_idx on private.staff_invitations(invited_by,created_at desc);
create index staff_invitations_target_idx on private.staff_invitations(target_id,created_at desc);
create table private.school_class_requests(classroom_id uuid primary key references public.classrooms(id) on delete cascade,school_id uuid not null references private.schools(id) on delete cascade,requested_by uuid not null references public.profiles(id),created_at timestamptz not null default now());
create table private.class_handover_proposals(classroom_id uuid primary key references public.classrooms(id) on delete cascade,from_id uuid not null references public.profiles(id),to_id uuid not null references public.profiles(id),expires_at timestamptz not null);
create index schools_creator_idx on private.schools(created_by);
create index staff_invitations_class_idx on private.staff_invitations(classroom_id);
create index staff_invitations_school_idx on private.staff_invitations(school_id);
create index school_class_requests_school_idx on private.school_class_requests(school_id);
create index school_class_requests_actor_idx on private.school_class_requests(requested_by);
create index class_handover_from_idx on private.class_handover_proposals(from_id);
create index class_handover_to_idx on private.class_handover_proposals(to_id);
alter table private.schools enable row level security;alter table private.school_staff enable row level security;alter table private.classroom_staff enable row level security;alter table private.staff_invitations enable row level security;alter table private.school_class_requests enable row level security;alter table private.class_handover_proposals enable row level security;
revoke all on private.schools,private.school_staff,private.classroom_staff,private.staff_invitations,private.school_class_requests,private.class_handover_proposals from public,anon,authenticated;

create function private.school_admin_for(p_actor uuid,p_school uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.school_staff s join public.profiles p on p.id=s.user_id where s.school_id=p_school and s.user_id=p_actor and s.active and s.expires_at>now() and p.role='teacher' and p.account_active and not p.must_change_password);
$$;
create function private.staff_permission_for(p_actor uuid,p_class uuid,p_permission text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.classrooms c join public.profiles p on p.id=p_actor where c.id=p_class and p.role='teacher' and p.account_active and not p.must_change_password and
 (c.teacher_id=p_actor or (p_permission='students' and private.school_admin_for(p_actor,c.school_id)) or exists(select 1 from private.classroom_staff s where s.classroom_id=c.id and s.user_id=p_actor and s.active and s.expires_at>now() and (p_permission=any(s.permissions) or (p_permission='read' and 'review'=any(s.permissions))))));
$$;
create function private.staff_permission(p_class uuid,p_permission text) returns boolean language sql stable security definer set search_path='' as $$
 select private.data_session() and private.staff_permission_for(auth.uid(),p_class,p_permission);
$$;
create function private.can_review_class(p_class uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.staff_permission(p_class,'review') $$;
create function private.can_admin_students(p_class uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.staff_permission(p_class,'students') $$;
revoke all on function private.school_admin_for(uuid,uuid),private.staff_permission_for(uuid,uuid,text),private.staff_permission(uuid,text),private.can_review_class(uuid),private.can_admin_students(uuid) from public,anon,authenticated;
grant execute on function private.staff_permission(uuid,text),private.can_review_class(uuid),private.can_admin_students(uuid) to authenticated;
-- Add only read permissions. Ownership remains the authority for economy, terms, deletion and class settings.
create policy staff_class_read on public.classrooms for select to authenticated using(private.staff_permission(id,'read') or private.staff_permission(id,'students'));
create policy staff_enrollment_read on public.enrollments for select to authenticated using(private.staff_permission(classroom_id,'read') or private.staff_permission(classroom_id,'students'));
create policy staff_profile_read on public.profiles for select to authenticated using(exists(select 1 from public.enrollments e where e.student_id=profiles.id and (private.staff_permission(e.classroom_id,'read') or private.staff_permission(e.classroom_id,'students'))));
create policy staff_assignment_read on public.assignments for select to authenticated using(private.staff_permission(classroom_id,'read'));
create policy staff_submission_read on public.submissions for select to authenticated using(private.data_session() and exists(select 1 from public.assignments a where a.id=submissions.assignment_id and private.staff_permission(a.classroom_id,'read')));
create policy staff_feedback_read on public.feedback for select to authenticated using(private.data_session() and exists(select 1 from public.submissions s join public.assignments a on a.id=s.assignment_id where s.id=feedback.submission_id and private.staff_permission(a.classroom_id,'read')));
create policy staff_reading_read on public.reading_logs for select to authenticated using(private.staff_permission(classroom_id,'read'));
create policy staff_report_read on public.term_reports for select to authenticated using(private.staff_permission(classroom_id,'read'));
-- Existing guards and idempotency are retained, with narrowly scoped authority substitutions.
do $$declare signature text;definition text;branch_start integer;branch_end integer;begin
 foreach signature in array array['private.legacy_review_work(uuid,text,text)','public.review_queue_state(uuid,text,integer)','public.create_growth_report(uuid,uuid,date,date,uuid[],text,text,boolean,boolean,integer,uuid)','public.create_reviewed_report(uuid,uuid,date,date,uuid[],text,text,integer,uuid,text)','public.report_review_command(uuid,text,integer,uuid)','public.batch_report_drafts(uuid,date,date,jsonb,uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('private.is_teacher(' in definition)=0 then raise exception 'Review permission anchor missing: %',signature;end if;
  definition:=replace(definition,'private.is_teacher(','private.can_review_class(');
  if signature='public.review_queue_state(uuid,text,integer)' then definition:=replace(definition,'where teacher_id=auth.uid() and term_state=', 'where private.can_review_class(id) and term_state=');end if;
  execute definition;
 end loop;
 definition:=pg_get_functiondef('private.growth_report_state_source(uuid,uuid,date,date,integer)'::regprocedure);
 execute replace(definition,'private.is_teacher(p_classroom)','private.staff_permission(p_classroom,''read'')');
 definition:=pg_get_functiondef('private.legacy_hub_command(text,jsonb,uuid)'::regprocedure);
 if position('private.is_teacher(log.classroom_id) or log.status' in definition)=0 then raise exception 'Reading review anchor missing';end if;
 branch_start:=position('when ''reading_verify'' then' in definition);branch_end:=position('when ''attendance'' then' in definition);
 if branch_start=0 or branch_end<=branch_start then raise exception 'Reading review branch missing';end if;
 execute substring(definition from 1 for branch_start-1)||replace(substring(definition from branch_start for branch_end-branch_start),'private.is_teacher(log.classroom_id)','private.can_review_class(log.classroom_id)')||substring(definition from branch_end);
 foreach signature in array array['public.account_job_begin(text,jsonb,uuid,text)','public.resume_issuance_job(jsonb,uuid,text)','public.issuance_jobs(uuid,integer)','public.check_roster_logins(uuid,text[])','public.start_roster_state(uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('private.is_teacher(' in definition)=0 then raise exception 'Student admin anchor missing: %',signature;end if;
  execute replace(definition,'private.is_teacher(','private.can_admin_students(');
 end loop;
 definition:=pg_get_functiondef('private.can_manage_student(uuid,uuid)'::regprocedure);
 execute replace(definition,'private.is_teacher(','private.can_admin_students(');
 definition:=pg_get_functiondef('public.account_job_finish(uuid,uuid,integer,boolean)'::regprocedure);
 if position('not exists(select 1 from public.classrooms c join public.profiles p on p.id=c.teacher_id where c.id=cls and c.teacher_id=j.actor_id and p.account_active and p.role=''teacher'')' in definition)=0 then raise exception 'Account finish permission anchor missing';end if;
 execute replace(definition,'not exists(select 1 from public.classrooms c join public.profiles p on p.id=c.teacher_id where c.id=cls and c.teacher_id=j.actor_id and p.account_active and p.role=''teacher'')','not private.staff_permission_for(j.actor_id,cls,''students'')');
end $$;

create function public.collaboration_state(p_classroom uuid default null,p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();begin
 if not private.data_session() or not exists(select 1 from public.profiles where id=actor and role='teacher') then raise exception 'BF_FORBIDDEN';end if;
 if p_page is null or p_page not between 1 and 100000 then raise exception 'BF_INVALID_INPUT';end if;
 if p_classroom is not null and not (private.staff_permission(p_classroom,'read') or private.staff_permission(p_classroom,'students')) then raise exception 'BF_FORBIDDEN';end if;
 return jsonb_build_object('actor',actor,'operator',private.is_operator(),
 'classes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'teacher_id',c.teacher_id,'created_at',c.created_at,'owner',c.teacher_id=actor,'read',private.staff_permission(c.id,'read'),'review',private.can_review_class(c.id),'students',private.can_admin_students(c.id),'school',c.school_id)) from public.classrooms c where private.staff_permission(c.id,'read') or private.can_admin_students(c.id)),'[]'),
 'staff',coalesce((select jsonb_agg(jsonb_build_object('id',s.user_id,'name',p.display_name,'permissions',s.permissions,'active',s.active,'expiresAt',s.expires_at,'revision',s.revision)) from private.classroom_staff s join public.profiles p on p.id=s.user_id where s.classroom_id=p_classroom and private.is_teacher(s.classroom_id)),'[]'),
 'students',coalesce((select jsonb_agg(to_jsonb(x)) from(select p.id,p.display_name,p.consent_status,p.account_active,e.active,m.login_id,(m.classroom_id=p_classroom and private.can_admin_students(p_classroom)) can_reset from public.enrollments e join public.profiles p on p.id=e.student_id left join private.managed_accounts m on m.student_id=p.id where e.classroom_id=p_classroom order by p.display_name,p.id limit 30 offset (p_page-1)*30)x),'[]'),
 'total',(select count(*) from public.enrollments where classroom_id=p_classroom),
 'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'kind',i.kind,'target',p.display_name,'expiresAt',i.expires_at)) from private.staff_invitations i join public.profiles p on p.id=i.target_id where (i.invited_by=actor or i.target_id=actor) and i.revoked_at is null and i.accepted_at is null and i.expires_at>now()),'[]'),
 'schools',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'admin',private.school_admin_for(actor,s.id))) from private.schools s where private.is_operator() or private.school_admin_for(actor,s.id) or exists(select 1 from public.classrooms c where c.school_id=s.id and c.teacher_id=actor)),'[]'),
 'schoolRequests',coalesce((select jsonb_agg(jsonb_build_object('classroom',r.classroom_id,'name',c.name,'school',r.school_id)) from private.school_class_requests r join public.classrooms c on c.id=r.classroom_id where private.school_admin_for(actor,r.school_id) or r.requested_by=actor),'[]'),
 'handovers',coalesce((select jsonb_agg(jsonb_build_object('classroom',h.classroom_id,'name',c.name,'recipient',h.to_id,'expiresAt',h.expires_at)) from private.class_handover_proposals h join public.classrooms c on c.id=h.classroom_id where (h.from_id=actor or h.to_id=actor) and h.expires_at>now()),'[]'),
 'schoolAdmins',coalesce((select jsonb_agg(jsonb_build_object('school',s.school_id,'id',s.user_id,'name',p.display_name,'active',s.active,'revision',s.revision)) from private.school_staff s join public.profiles p on p.id=s.user_id where private.is_operator()),'[]'),
 'operators',coalesce((select jsonb_agg(jsonb_build_object('id',o.user_id,'name',p.display_name)) from private.operators o join public.profiles p on p.id=o.user_id where private.is_operator()),'[]'));
end $$;
revoke all on function public.collaboration_state(uuid,integer) from public,anon;grant execute on function public.collaboration_state(uuid,integer) to authenticated;
create function public.collaboration_command(p_command text,p_payload jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();target uuid;cls uuid;school uuid;permissions text[];kind text;code text;inv private.staff_invitations;receipt private.growth_term_requests;result jsonb;fingerprint text;handover private.class_handover_proposals;begin
 if not private.data_session() or not exists(select 1 from public.profiles where id=actor and role='teacher') then raise exception 'BF_FORBIDDEN';end if;
 if p_request_id is null or p_command is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>4000 then raise exception 'BF_INVALID_INPUT';end if;
 perform 1 from public.profiles where id=actor for update;
 fingerprint:=encode(sha256(convert_to('collaboration:'||p_command||p_payload::text,'UTF8')),'hex');
 select * into receipt from private.growth_term_requests where actor_id=actor and request_id=p_request_id;
 if found then if receipt.fingerprint<>fingerprint then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;return receipt.result;end if;
 cls:=nullif(p_payload->>'classroom','')::uuid;school:=nullif(p_payload->>'school','')::uuid;target:=nullif(p_payload->>'target','')::uuid;
 if target is null and p_payload ? 'email' then select id into target from auth.users where lower(email)=lower(btrim(p_payload->>'email'));end if;
 case p_command
 when 'school_create' then
  perform private.require_operator_step_up();
  if length(btrim(coalesce(p_payload->>'name',''))) not between 1 and 80 then raise exception 'BF_INVALID_INPUT';end if;
  insert into private.schools(name,created_by) values(btrim(p_payload->>'name'),actor) returning id into school;result:=jsonb_build_object('school',school);
 when 'invite' then
  kind:=p_payload->>'kind';
  if target is null or target=actor or not exists(select 1 from public.profiles where id=target and role='teacher' and account_active and consent_status='verified' and not must_change_password) then raise exception 'BF_TEACHER_REQUIRED';end if;
  if kind='classroom' then
   perform 1 from public.classrooms where id=cls for update;
   if not private.is_teacher(cls) then raise exception 'BF_FORBIDDEN';end if;
   select array_agg(distinct x) into permissions from jsonb_array_elements_text(p_payload->'permissions')x;
   if coalesce(cardinality(permissions),0) not between 1 and 3 or not permissions<@array['read','review','students'] then raise exception 'BF_INVALID_INPUT';end if;
  elsif kind in('school','operator') then
   perform private.require_operator_step_up();permissions:='{}';
   if kind='school' and not exists(select 1 from private.schools where id=school) then raise exception 'BF_NOT_FOUND';end if;
  else raise exception 'BF_INVALID_INPUT';end if;
  code:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into private.staff_invitations(kind,classroom_id,school_id,target_id,invited_by,permissions,token_hash,expires_at) values(kind,case when kind='classroom' then cls end,case when kind='school' then school end,target,actor,permissions,encode(sha256(convert_to(code,'UTF8')),'hex'),now()+interval '24 hours') returning * into inv;
  result:=jsonb_build_object('id',inv.id,'code',code,'expiresAt',inv.expires_at);
 when 'accept' then
  code:=p_payload->>'code';
  if code is null or code!~'^[a-f0-9]{64}$' then raise exception 'BF_INVITE_NOT_FOUND';end if;
  select * into inv from private.staff_invitations where token_hash=encode(sha256(convert_to(code,'UTF8')),'hex') for update;
  if not found or inv.target_id<>actor or inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at<=now() then raise exception 'BF_INVITE_NOT_FOUND';end if;
  if inv.kind='classroom' then
   if not exists(select 1 from public.classrooms where id=inv.classroom_id and teacher_id=inv.invited_by) then raise exception 'BF_FORBIDDEN';end if;
   insert into private.classroom_staff(classroom_id,user_id,permissions,expires_at) values(inv.classroom_id,actor,inv.permissions,now()+interval '180 days') on conflict(classroom_id,user_id) do update set permissions=excluded.permissions,expires_at=excluded.expires_at,active=true,revision=classroom_staff.revision+1;
  else
   if not exists(select 1 from private.operators o join public.profiles p on p.id=o.user_id where o.user_id=inv.invited_by and p.account_active and p.role='teacher') then raise exception 'BF_FORBIDDEN';end if;
   if inv.kind='operator' then
    if not private.operator_step_up_recent() then raise exception 'BF_MFA_REQUIRED';end if;
    insert into private.operators(user_id) values(actor) on conflict do nothing;
   else insert into private.school_staff(school_id,user_id,expires_at) values(inv.school_id,actor,now()+interval '365 days') on conflict(school_id,user_id) do update set active=true,expires_at=excluded.expires_at,revision=school_staff.revision+1;
   end if;
  end if;
  update private.staff_invitations set accepted_at=now() where id=inv.id;result:=jsonb_build_object('accepted',true);
 when 'revoke_invitation' then
  select * into inv from private.staff_invitations where id=(p_payload->>'id')::uuid for update;
  if not found or inv.invited_by<>actor then raise exception 'BF_FORBIDDEN';end if;
  update private.staff_invitations set revoked_at=now() where id=inv.id;result:='{"revoked":true}';
 when 'revoke_staff' then
  perform 1 from public.classrooms where id=cls for update;
  if not private.is_teacher(cls) then raise exception 'BF_FORBIDDEN';end if;
  update private.classroom_staff set active=false,revision=revision+1 where classroom_id=cls and user_id=target and revision=(p_payload->>'revision')::integer;
  if not found then raise exception 'BF_REVISION_CONFLICT';end if;result:='{"revoked":true}';
 when 'school_link_request' then
  if not private.is_teacher(cls) or not exists(select 1 from private.schools where id=school) then raise exception 'BF_FORBIDDEN';end if;
  insert into private.school_class_requests(classroom_id,school_id,requested_by) values(cls,school,actor) on conflict(classroom_id) do update set school_id=excluded.school_id,requested_by=excluded.requested_by,created_at=now();result:='{"requested":true}';
 when 'school_link_accept' then
  if not exists(select 1 from private.school_class_requests r join public.classrooms c on c.id=r.classroom_id where r.classroom_id=cls and r.school_id=school and r.requested_by=c.teacher_id and private.school_admin_for(actor,school)) then raise exception 'BF_FORBIDDEN';end if;
  update public.classrooms set school_id=school where id=cls;delete from private.school_class_requests where classroom_id=cls;result:='{"linked":true}';
 when 'handover_propose' then
  if not private.is_teacher(cls) or target=actor or not private.staff_permission_for(target,cls,'read') then raise exception 'BF_FORBIDDEN';end if;
  insert into private.class_handover_proposals values(cls,actor,target,now()+interval '7 days') on conflict(classroom_id) do update set from_id=excluded.from_id,to_id=excluded.to_id,expires_at=excluded.expires_at;result:='{"requested":true}';
 when 'handover_accept' then
  perform 1 from public.classrooms where id=cls for update;
  select * into handover from private.class_handover_proposals where classroom_id=cls for update;
  if not found or handover.to_id<>actor or handover.expires_at<=now() or not private.staff_permission_for(actor,cls,'read') or not exists(select 1 from public.classrooms where id=cls and teacher_id=handover.from_id) then raise exception 'BF_FORBIDDEN';end if;
  update public.classrooms set teacher_id=actor where id=cls;
  delete from private.classroom_staff where classroom_id=cls and user_id in(actor,handover.from_id);
  update private.staff_invitations set revoked_at=now() where classroom_id=cls and accepted_at is null and revoked_at is null;
  delete from private.class_handover_proposals where classroom_id=cls;result:='{"transferred":true}';
 when 'revoke_school_admin' then
  perform private.require_operator_step_up();update private.school_staff set active=false,revision=revision+1 where school_id=school and user_id=target and revision=(p_payload->>'revision')::integer;if not found then raise exception 'BF_REVISION_CONFLICT';end if;result:='{"revoked":true}';
 when 'revoke_operator' then
  perform private.require_operator_step_up();if target=actor or target is null then raise exception 'BF_FORBIDDEN';end if;delete from private.operators where user_id=target;result:='{"revoked":true}';
 else raise exception 'BF_INVALID_COMMAND';end case;
 perform private.ops_audit('collaboration_'||p_command,target,cls);
 insert into private.growth_term_requests values(actor,p_request_id,fingerprint,result,now());return result;
end $$;
revoke all on function public.collaboration_command(text,jsonb,uuid) from public,anon;grant execute on function public.collaboration_command(text,jsonb,uuid) to authenticated;

create function public.staff_security_state() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.data_session() or not exists(select 1 from public.profiles where id=auth.uid() and role='teacher') then raise exception 'BF_FORBIDDEN';end if;
 return jsonb_build_object('recent',private.operator_step_up_recent(),'asOf',now());end $$;
revoke all on function public.staff_security_state() from public,anon;grant execute on function public.staff_security_state() to authenticated;
create function private.staff_learning_visible(p_student uuid,p_classroom uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.staff_permission(p_classroom,'read') and exists(select 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.classroom_id=p_classroom and e.student_id=p_student and e.active and p.account_active and p.consent_status='verified' and not p.must_change_password)
 and not exists(select 1 from private.deletion_requests d where d.student_id=p_student and (d.classroom_id=p_classroom or d.scope='account') and d.status in('approved','purged','completed'));
$$;
revoke all on function private.staff_learning_visible(uuid,uuid) from public,anon;grant execute on function private.staff_learning_visible(uuid,uuid) to authenticated;
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.growth_report_state(uuid,uuid,date,date,integer)'::regprocedure);
 if position('state:=private.growth_report_state_source' in definition)=0 then raise exception 'Report visibility anchor missing';end if;
 execute replace(definition,'state:=private.growth_report_state_source','if not private.is_teacher(p_classroom) and not private.staff_learning_visible(p_student,p_classroom) then raise exception ''BF_FORBIDDEN'';end if;state:=private.growth_report_state_source');
end $$;
drop policy staff_submission_read on public.submissions;drop policy staff_feedback_read on public.feedback;drop policy staff_reading_read on public.reading_logs;drop policy staff_report_read on public.term_reports;
create policy staff_submission_read on public.submissions for select to authenticated using(exists(select 1 from public.assignments a where a.id=submissions.assignment_id and private.staff_learning_visible(submissions.student_id,a.classroom_id)));
create policy staff_feedback_read on public.feedback for select to authenticated using(exists(select 1 from public.submissions s join public.assignments a on a.id=s.assignment_id where s.id=feedback.submission_id and private.staff_learning_visible(s.student_id,a.classroom_id)));
create policy staff_reading_read on public.reading_logs for select to authenticated using(private.staff_learning_visible(student_id,classroom_id));
create policy staff_report_read on public.term_reports for select to authenticated using(private.staff_learning_visible(student_id,classroom_id));
create function public.collaboration_records(p_classroom uuid,p_kind text default 'reading',p_page integer default 1) returns jsonb language plpgsql stable security invoker set search_path='' as $$begin
 if not private.staff_permission(p_classroom,'read') then raise exception 'BF_FORBIDDEN';end if;
 if p_kind is null or p_kind not in('reading','writing') or p_page is null or p_page not between 1 and 100000 then raise exception 'BF_INVALID_INPUT';end if;
 if p_kind='reading' then return coalesce((select jsonb_agg(to_jsonb(x)) from(select r.id,r.book->>'title' title,r.thought body,p.display_name student_name from public.reading_logs r join public.profiles p on p.id=r.student_id where r.classroom_id=p_classroom and private.staff_learning_visible(r.student_id,p_classroom) order by r.created_at desc,r.id limit 20 offset (p_page-1)*20)x),'[]');end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from(select s.id,s.title,s.body,p.display_name student_name from public.submissions s join public.assignments a on a.id=s.assignment_id join public.profiles p on p.id=s.student_id where a.classroom_id=p_classroom and private.staff_learning_visible(s.student_id,p_classroom) order by s.created_at desc,s.id limit 20 offset (p_page-1)*20)x),'[]');
end $$;
revoke all on function public.collaboration_records(uuid,text,integer) from public,anon;grant execute on function public.collaboration_records(uuid,text,integer) to authenticated;
