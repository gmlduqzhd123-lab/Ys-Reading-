-- Bounded server reads retain the caller's RLS, including withdrawn membership.
create index reading_review_pending_idx on public.reading_logs(classroom_id,created_at desc,id) where status='completed' and verified_at is null;
create function public.review_queue_state(p_classroom uuid default null,p_kind text default 'writing',p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not private.data_session() or not exists(select 1 from public.profiles where id=auth.uid() and role='teacher') then raise exception 'BF_FORBIDDEN'; end if;
 if p_kind is null or p_kind not in ('reading','writing') or p_page is null or p_page not between 1 and 100000 then raise exception 'BF_INVALID_INPUT'; end if;
 if p_classroom is not null and not private.is_teacher(p_classroom) then raise exception 'BF_FORBIDDEN'; end if;
 with classes as materialized(select * from public.classrooms where teacher_id=auth.uid() and term_state='open' and (p_classroom is null or id=p_classroom)),
 latest as materialized(select distinct on(s.assignment_id,s.student_id) s.*,a.classroom_id,p.display_name student_name from public.submissions s join public.assignments a on a.id=s.assignment_id join classes c on c.id=a.classroom_id join public.enrollments e on e.classroom_id=c.id and e.student_id=s.student_id and e.active join public.profiles p on p.id=s.student_id and p.account_active and p.consent_status='verified' and not p.must_change_password order by s.assignment_id,s.student_id,s.version desc),
 waiting as materialized(select 'writing'::text kind,id,classroom_id,student_id,student_name,title,body,version,created_at from latest where status='submitted'
 union all select 'reading',r.id,r.classroom_id,r.student_id,p.display_name,r.book->>'title',r.thought||case when coalesce(r.question,'')='' then '' else E'\n더 생각해 볼 질문: '||r.question end,0,r.created_at from public.reading_logs r join classes c on c.id=r.classroom_id join public.enrollments e on e.classroom_id=c.id and e.student_id=r.student_id and e.active join public.profiles p on p.id=r.student_id and p.account_active and p.consent_status='verified' and not p.must_change_password where r.status='completed' and r.verified_at is null)
 select jsonb_build_object('asOf',now(),'kind',p_kind,'page',p_page,'classroom',p_classroom,'total',(select count(*) from waiting where kind=p_kind),
 'totals',jsonb_build_object('writing',(select count(*) from waiting where kind='writing'),'reading',(select count(*) from waiting where kind='reading'),'revision',(select count(*) from latest where status='revision_requested')),
 'rows',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from waiting where kind=p_kind order by created_at,id limit 20 offset (p_page-1)*20)x),'[]'),
 'presets',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,title,body from public.feedback_presets where teacher_id=auth.uid() order by created_at desc,id limit 100)x),'[]')) into result;
 return result;
end $$;
revoke all on function public.review_queue_state(uuid,text,integer) from public,anon;
grant execute on function public.review_queue_state(uuid,text,integer) to authenticated;

create function public.student_today_state(p_page integer default 1) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not private.data_session() or not exists(select 1 from public.profiles where id=auth.uid() and role='student') then raise exception 'BF_FORBIDDEN'; end if;
 if p_page is null or p_page not between 1 and 100000 then raise exception 'BF_INVALID_INPUT'; end if;
 with tasks as materialized(select a.id,a.classroom_id,a.mission_snapshot,a.due_at,a.created_at,s.version,
 case when s.status='revision_requested' then 'revision' when s.status='submitted' then 'waiting'
 when d.id is not null and (length(btrim(d.title))>0 or length(btrim(d.body))>0) and (s.id is null or (d.updated_at>s.created_at and (btrim(d.title)<>btrim(s.title) or btrim(d.body)<>btrim(s.body)))) then 'draft'
 when s.status='completed' then 'completed' else 'new' end state
 from public.assignments a join public.classrooms c on c.id=a.classroom_id and c.term_state='open'
 left join lateral(select * from public.submissions where assignment_id=a.id and student_id=auth.uid() order by version desc limit 1) s on true
 left join public.drafts d on d.assignment_id=a.id and d.student_id=auth.uid())
 select jsonb_build_object('asOf',now(),'page',p_page,'total',(select count(*) from tasks),
 'pendingClasses',(select count(*) from public.promotion_memberships where student_id=auth.uid() and activated_at is null),
 'tasks',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from tasks order by case state when 'revision' then 1 when 'draft' then 2 when 'new' then 3 when 'waiting' then 4 else 5 end,due_at nulls last,created_at,id limit 8 offset (p_page-1)*8)x),'[]')) into result;
 return result;
end $$;
revoke all on function public.student_today_state(integer) from public,anon;
grant execute on function public.student_today_state(integer) to authenticated;

-- Lock all students in a stable order before the class, preserving the existing
-- consent, recovery-authority and active-password-job checks on every member.
create function public.activate_term_batch(p_classroom uuid,p_members uuid[],p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); fingerprint text; previous private.growth_term_requests; member uuid; result jsonb;
begin
 if not private.data_session() or not private.is_teacher(p_classroom) then raise exception 'BF_FORBIDDEN'; end if;
 if p_request_id is null or coalesce(cardinality(p_members),0) not between 1 and 100 or (select count(distinct x) from unnest(p_members)x)<>cardinality(p_members) then raise exception 'BF_INVALID_INPUT'; end if;
 perform 1 from public.profiles where id=actor for update;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('command','activate_batch','classroom',p_classroom,'members',(select jsonb_agg(x order by x) from unnest(p_members)x))::text,'UTF8')),'hex');
 select * into previous from private.growth_term_requests where actor_id=actor and request_id=p_request_id;
 if found then if previous.fingerprint<>fingerprint then raise exception 'BF_IDEMPOTENCY_CONFLICT'; end if;return previous.result;end if;
 if (select count(*) from public.promotion_memberships where id=any(p_members) and target_classroom_id=p_classroom)<>cardinality(p_members) then raise exception 'BF_FORBIDDEN'; end if;
 perform 1 from public.profiles where id in(select student_id from public.promotion_memberships where id=any(p_members)) order by id for update;
 perform 1 from public.classrooms where id=p_classroom and term_state='open' for update;
 if not found then raise exception 'BF_CLASS_ARCHIVED'; end if;
 for member in select x from unnest(p_members)x order by x loop
 perform public.growth_term_command('activate',jsonb_build_object('classroomId',p_classroom,'id',member),md5(p_request_id::text||':activate:'||member::text)::uuid);
 end loop;
 result:=jsonb_build_object('count',cardinality(p_members));insert into private.growth_term_requests values(actor,p_request_id,fingerprint,result,now());return result;
end $$;
revoke all on function public.activate_term_batch(uuid,uuid[],uuid) from public,anon;
grant execute on function public.activate_term_batch(uuid,uuid[],uuid) to authenticated;

create table private.handover_requests(
 id uuid primary key default gen_random_uuid(),classroom_id uuid not null references public.classrooms(id) on delete cascade,
 requested_by uuid references public.profiles(id) on delete set null,note text not null check(length(note)<=200),
 status text not null default 'pending' check(status in ('pending','completed','cancelled')),
 accepted_by uuid references public.profiles(id) on delete set null,created_at timestamptz not null default now(),completed_at timestamptz);
create unique index handover_one_pending_idx on private.handover_requests(classroom_id) where status='pending';
create index handover_requester_idx on private.handover_requests(requested_by);
create index handover_acceptor_idx on private.handover_requests(accepted_by);
create index handover_classroom_idx on private.handover_requests(classroom_id);
alter table private.handover_requests enable row level security;
revoke all on private.handover_requests from public,anon,authenticated;
grant all on private.handover_requests to service_role;

create function public.operations_scale_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.data_session() or not exists(select 1 from public.profiles where id=auth.uid() and role='teacher') then raise exception 'BF_FORBIDDEN';end if;
 return jsonb_build_object('operator',private.is_operator(),'requests',coalesce((select jsonb_agg(to_jsonb(x)) from(
 select r.id,r.classroom_id,c.name,r.note,r.created_at,r.completed_at,
 case when r.status='pending' and c.teacher_id is distinct from r.requested_by then 'completed' else r.status end status,
 p.display_name current_teacher,r.requested_by=auth.uid() own_request
 from private.handover_requests r join public.classrooms c on c.id=r.classroom_id join public.profiles p on p.id=c.teacher_id
 where private.is_operator() or r.requested_by=auth.uid() or c.teacher_id=auth.uid() order by r.created_at desc,r.id limit 100)x),'[]'));
end $$;
revoke all on function public.operations_scale_state() from public,anon;grant execute on function public.operations_scale_state() to authenticated;

create function public.operations_scale_command(p_command text,p_payload jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();cls uuid; fingerprint text;previous private.growth_term_requests;request private.handover_requests;result jsonb;ids uuid[];item uuid;
begin
 if not private.data_session() then raise exception 'BF_FORBIDDEN';end if;
 if p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>12000 then raise exception 'BF_INVALID_INPUT';end if;
 cls:=(p_payload->>'classroomId')::uuid;
 if p_command='handover_request' and not private.is_teacher(cls) then raise exception 'BF_FORBIDDEN';end if;
 if p_command in ('handover_accept','consent_batch') and not private.is_operator() then raise exception 'BF_FORBIDDEN';end if;
 perform 1 from public.profiles where id=actor for update;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('scale',p_command,'payload',p_payload)::text,'UTF8')),'hex');
 select * into previous from private.growth_term_requests where actor_id=actor and request_id=p_request_id;
 if found then if previous.fingerprint<>fingerprint then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;return previous.result;end if;
 case p_command
 when 'handover_request' then
 perform 1 from public.classrooms where id=cls for update;
 update private.handover_requests r set status='completed',completed_at=now() where classroom_id=cls and status='pending' and requested_by is distinct from actor;
 if length(btrim(coalesce(p_payload->>'note',''))) not between 1 and 200 then raise exception 'BF_INVALID_INPUT';end if;
 insert into private.handover_requests(classroom_id,requested_by,note) values(cls,actor,btrim(p_payload->>'note')) on conflict(classroom_id) where status='pending' do update set note=excluded.note returning jsonb_build_object('id',id) into result;
 when 'handover_accept' then
 select * into request from private.handover_requests where id=(p_payload->>'id')::uuid for update;
 if not found or request.status<>'pending' then raise exception 'BF_INVALID_TRANSITION';end if;
 perform 1 from public.classrooms where id=request.classroom_id and teacher_id=request.requested_by for update;
 if not found then raise exception 'BF_HANDOVER_CHANGED';end if;
 perform public.operations_command('class_handover',jsonb_build_object('classroomId',request.classroom_id,'teacherId',p_payload->>'teacherId'),md5(p_request_id::text||':handover')::uuid);
 update private.handover_requests set status='completed',accepted_by=actor,completed_at=now() where id=request.id;result:=jsonb_build_object('id',request.id);
 when 'consent_batch' then
 if p_payload->>'evidenceChecked' is distinct from 'true' or jsonb_typeof(p_payload->'ids') is distinct from 'array' then raise exception 'BF_EVIDENCE_REQUIRED';end if;
 select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_payload->'ids');
 if coalesce(cardinality(ids),0) not between 1 and 100 or (select count(distinct x) from unnest(ids)x)<>cardinality(ids) then raise exception 'BF_INVALID_INPUT';end if;
 perform 1 from private.consent_requests where id=any(ids) order by id for update;
 if (select count(*) from private.consent_requests where id=any(ids) and status='pending')<>cardinality(ids) then raise exception 'BF_INVALID_TRANSITION';end if;
 perform 1 from public.profiles where id in(select student_id from private.consent_requests where id=any(ids)) order by id for update;
 for item in select x from unnest(ids)x order by x loop
 perform public.operations_command('consent_decide',jsonb_build_object('id',item,'approve',true,'evidenceChecked',true),md5(p_request_id::text||':consent:'||item::text)::uuid);
 end loop;result:=jsonb_build_object('count',cardinality(ids));
 else raise exception 'BF_INVALID_COMMAND';end case;
 insert into private.growth_term_requests values(actor,p_request_id,fingerprint,result,now());return result;
end $$;
revoke all on function public.operations_scale_command(text,jsonb,uuid) from public,anon;grant execute on function public.operations_scale_command(text,jsonb,uuid) to authenticated;

-- Only the project-scoped operator CLI writes verified encrypted-backup receipts.
create table private.backup_runs(id uuid primary key,created_at timestamptz not null,verified_at timestamptz not null,
 file_name text not null check(file_name ~ '^[0-9TZ.-]+\.bfbak$'),bytes bigint not null check(bytes>0),table_count integer not null check(table_count>0),row_count bigint not null check(row_count>=0),snapshot_digest text not null check(snapshot_digest ~ '^[0-9a-f]{64}$'));
alter table private.backup_runs enable row level security;
revoke all on private.backup_runs from public,anon,authenticated;grant all on private.backup_runs to service_role;
create function public.operator_backup_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.session_ok(false) or not private.is_operator() then raise exception 'BF_FORBIDDEN';end if;
 return jsonb_build_object('asOf',now(),'runs',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from private.backup_runs order by created_at desc,id limit 10)x),'[]'));
end $$;
revoke all on function public.operator_backup_state() from public,anon;grant execute on function public.operator_backup_state() to authenticated;

create function public.term_roster_page(p_classroom uuid,p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.data_session() or not private.is_teacher(p_classroom) then raise exception 'BF_FORBIDDEN';end if;
 if p_page is null or p_page not between 1 and 100000 then raise exception 'BF_INVALID_INPUT';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from(
 select e.student_id,p.display_name,e.active,p.account_active,p.consent_status,p.must_change_password,m.id membership_id,
 exists(select 1 from private.consent_requests r where r.student_id=p.id and r.classroom_id=p_classroom and r.status='approved') consent_ready,
 private.promoted_ready(p_classroom,p.id) confirmed,
 exists(select 1 from private.deletion_requests d where d.student_id=p.id and (d.classroom_id=p_classroom or d.scope='account') and d.status in ('approved','purged')) deletion_pending
 from public.enrollments e join public.profiles p on p.id=e.student_id left join public.promotion_memberships m on m.target_classroom_id=e.classroom_id and m.student_id=e.student_id
 where e.classroom_id=p_classroom order by p.display_name,p.id limit 50 offset (p_page-1)*50)x),'[]');
end $$;
revoke all on function public.term_roster_page(uuid,integer) from public,anon;grant execute on function public.term_roster_page(uuid,integer) to authenticated;
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.term_state(uuid)'::regprocedure);
 if position('order by p.display_name,p.id limit 200' in definition)=0 then raise exception 'Term roster anchor missing';end if;
 definition:=replace(definition,'order by p.display_name,p.id limit 200','order by p.display_name,p.id limit 50');execute definition;
end $$;

create function public.append_term_students(p_source uuid,p_target uuid,p_students uuid[],p_revision integer,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();source public.classrooms;target public.classrooms;promotion uuid;previous private.growth_term_requests;fingerprint text;result jsonb;
begin
 if not private.data_session() or not private.is_teacher(p_source) or not private.is_teacher(p_target) then raise exception 'BF_FORBIDDEN';end if;
 if p_request_id is null or coalesce(cardinality(p_students),0) not between 1 and 100 or (select count(distinct id) from unnest(p_students)id)<>cardinality(p_students) then raise exception 'BF_INVALID_INPUT';end if;
 perform 1 from public.profiles where id=actor for update;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('append',p_source,'target',p_target,'revision',p_revision,'students',(select jsonb_agg(id order by id) from unnest(p_students)id))::text,'UTF8')),'hex');
 select * into previous from private.growth_term_requests where actor_id=actor and request_id=p_request_id;
 if found then if previous.fingerprint<>fingerprint then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;return previous.result;end if;
 perform 1 from public.profiles where id=any(p_students) order by id for update;
 select * into source from public.classrooms where id=p_source for update;
 select * into target from public.classrooms where id=p_target for update;
 if source.term_state<>'archived' then raise exception 'BF_ARCHIVE_FIRST';end if;
 if target.term_state<>'open' then raise exception 'BF_CLASS_ARCHIVED';end if;
 if p_revision is distinct from source.term_revision then raise exception 'BF_TERM_CONFLICT';end if;
 select id into promotion from public.term_promotions where source_classroom_id=p_source and target_classroom_id=p_target;
 if promotion is null or target.academic_year*2+target.semester<=source.academic_year*2+source.semester then raise exception 'BF_FORBIDDEN';end if;
 if exists(select 1 from unnest(p_students)id where not exists(select 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.classroom_id=p_source and e.student_id=id and e.active and p.role='student' and p.account_active) or exists(select 1 from private.deletion_requests d where d.student_id=id and (d.classroom_id=p_source or d.scope='account') and d.status in ('approved','purged'))) then raise exception 'BF_FORBIDDEN';end if;
 if exists(select 1 from public.promotion_memberships where source_classroom_id=p_source and student_id=any(p_students) and academic_year=target.academic_year and semester=target.semester) or exists(select 1 from public.enrollments where classroom_id=p_target and student_id=any(p_students)) then raise exception 'BF_ALREADY_PROMOTED';end if;
 insert into public.promotion_memberships(promotion_id,source_classroom_id,target_classroom_id,student_id,academic_year,semester) select promotion,p_source,p_target,id,target.academic_year,target.semester from unnest(p_students)id;
 insert into public.enrollments(classroom_id,student_id,active) select p_target,id,false from unnest(p_students)id;
 update public.classrooms set term_revision=term_revision+1 where id=p_source;
 insert into public.class_term_events(classroom_id,actor_id,kind) values(p_source,actor,'promoted');
 result:=jsonb_build_object('targetClassId',p_target,'count',cardinality(p_students));insert into private.growth_term_requests values(actor,p_request_id,fingerprint,result,now());return result;
end $$;
revoke all on function public.append_term_students(uuid,uuid,uuid[],integer,uuid) from public,anon;grant execute on function public.append_term_students(uuid,uuid,uuid[],integer,uuid) to authenticated;
