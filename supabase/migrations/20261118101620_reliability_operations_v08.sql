-- Independent delivery metadata. It cannot certify a backup or change account permissions.
create table private.delivery_observations(
 agent_id uuid primary key references private.backup_agents(id) on delete cascade,
 observed_at timestamptz not null,run_id bigint,notified_at timestamptz,code text not null
 check(code in('OK','GITHUB_CHECK_DELAYED','GITHUB_NOTIFY_FAILED','GITHUB_STATUS_UNAVAILABLE','GITHUB_CHECK_RUNNING'))
);
alter table private.delivery_observations enable row level security;
revoke all on private.delivery_observations from public,anon,authenticated,service_role;
create function public.delivery_agent_report(p_payload text,p_signature text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v jsonb;a private.backup_agents;seq bigint;at timestamptz;finished timestamptz;run bigint;fp text;expected bytea;given bytea;difference integer:=0;i integer;
begin
 if p_payload is null or octet_length(p_payload)>2000 or p_signature is null or p_signature!~'^[a-f0-9]{64}$' then raise exception 'BF_INVALID_INPUT';end if;
 v:=p_payload::jsonb;
 if jsonb_typeof(v)<>'object' or (select count(*) from jsonb_object_keys(v))<>7 or not(v?&array['version','agent','sequence','checkedAt','runId','notifiedAt','code'])
 or v->'version'<>'3'::jsonb or jsonb_typeof(v->'sequence')<>'number' or jsonb_typeof(v->'checkedAt')<>'string' or jsonb_typeof(v->'agent')<>'string'
 or v->>'code' is null or v->>'code' not in('OK','GITHUB_CHECK_DELAYED','GITHUB_NOTIFY_FAILED','GITHUB_STATUS_UNAVAILABLE','GITHUB_CHECK_RUNNING') then raise exception 'BF_INVALID_INPUT';end if;
 seq:=(v->>'sequence')::bigint;at:=(v->>'checkedAt')::timestamptz;finished:=(v->>'notifiedAt')::timestamptz;run:=(v->>'runId')::bigint;
 if seq not between 1 and 9007199254740991 or (v->>'sequence')::numeric<>seq or at<now()-interval '10 minutes' or at>now()+interval '1 minute'
 or(run is not null and(run not between 1 and 9007199254740991 or jsonb_typeof(v->'runId')<>'number' or (v->>'runId')::numeric<>run))
 or(finished is not null and(finished>now()+interval '1 minute' or jsonb_typeof(v->'notifiedAt')<>'string')) then raise exception 'BF_INVALID_INPUT';end if;
 if v->>'code' in('OK','GITHUB_CHECK_DELAYED') and(run is null or finished is null or(v->>'code'='OK' and finished<now()-interval '60 minutes')) then raise exception 'BF_INVALID_INPUT';end if;
 select * into a from private.backup_agents where id=(v->>'agent')::uuid and active;
 if not found then raise exception 'BF_FORBIDDEN';end if;
 expected:=extensions.hmac(convert_to(p_payload,'UTF8'),a.secret,'sha256');given:=decode(p_signature,'hex');
 for i in 0..31 loop difference:=difference|(get_byte(expected,i)#get_byte(given,i));end loop;
 if difference<>0 then raise exception 'BF_FORBIDDEN';end if;
 perform 1 from private.backup_agents where id=a.id and active and secret=a.secret for update;
 if not found then raise exception 'BF_FORBIDDEN';end if;
 select * into a from private.backup_agents where id=a.id;
 fp:=encode(sha256(convert_to(p_payload,'UTF8')),'hex');
 if seq=a.last_sequence and fp=a.request_digest then return jsonb_build_object('accepted',true,'replayed',true);end if;
 if seq<=a.last_sequence then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;
 update private.backup_agents set last_sequence=seq,request_digest=fp where id=a.id;
 insert into private.delivery_observations values(a.id,at,run,finished,v->>'code')
 on conflict(agent_id) do update set observed_at=excluded.observed_at,run_id=excluded.run_id,notified_at=excluded.notified_at,code=excluded.code;
 return jsonb_build_object('accepted',true,'replayed',false);
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then raise exception 'BF_INVALID_INPUT';
end $$;
revoke all on function public.delivery_agent_report(text,text) from public;
grant execute on function public.delivery_agent_report(text,text) to anon,authenticated;
create function public.service_delivery_health() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d private.delivery_observations;code text;
begin
 select r.* into d from private.delivery_observations r join private.backup_agents a on a.id=r.agent_id and a.active order by r.observed_at desc limit 1;
 code:=case when not found then 'DELIVERY_SETUP_PENDING' when d.observed_at<now()-interval '45 minutes' or d.observed_at>now()+interval '1 minute' then 'DELIVERY_MONITOR_STALE'
 when d.code='OK' and d.notified_at<now()-interval '60 minutes' then 'GITHUB_CHECK_DELAYED' else d.code end;
 return jsonb_build_object('configured',d.agent_id is not null,'healthy',code='OK','code',code,'checkedAt',now(),'observedAt',d.observed_at,'notifiedAt',d.notified_at,'runId',d.run_id);
end $$;
revoke all on function public.service_delivery_health() from public;
grant execute on function public.service_delivery_health() to anon,authenticated;

-- Bounded legacy workspace pages. All SELECTs retain the caller's JWT and RLS.
create function public.workspace_page(p_view text default 'missions',p_classroom uuid default null,p_page integer default 1,p_assignment uuid default null,p_status text default 'all',p_entry_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb:='{"classes":[],"assignments":[],"drafts":[],"submissions":[],"feedback":[],"badges":[],"contests":[],"entries":[],"reviews":[],"gradeGroups":[],"gradeMembers":[]}'::jsonb;
 ids uuid[];linked uuid[];n bigint:=0;skip integer;teacher boolean;rows jsonb;
begin
 if auth.uid() is null or not private.session_ok(false) then raise exception 'BF_FORBIDDEN';end if;
 if p_view is null or p_view not in('missions','feedback','forest','contests','classes','work') or p_page is null or p_page not between 1 and 1000000 or p_entry_page is null or p_entry_page not between 1 and 1000000 or p_status is null or p_status not in('all','submitted','revision_requested','completed') then raise exception 'BF_INVALID_INPUT';end if;
 skip:=(p_page-1)*30;select role='teacher' into teacher from public.profiles where id=auth.uid();
 if p_classroom is not null and not exists(select 1 from public.classrooms where id=p_classroom) then raise exception 'BF_FORBIDDEN';end if;
 if not private.data_session() then return result||jsonb_build_object('pagination',jsonb_build_object('page',p_page,'total',0,'hasNext',false));end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc,c.id),'[]') into rows from public.classrooms c;
 result:=result||jsonb_build_object('classes',rows);
 if p_view in('missions','work') then
  if p_view='work' and p_assignment is null then raise exception 'BF_INVALID_INPUT';end if;
  select count(*) into n from public.assignments a where(p_classroom is null or a.classroom_id=p_classroom) and(p_assignment is null or a.id=p_assignment);
  select coalesce(array_agg(x.id),'{}'::uuid[]) into ids from(select a.id from public.assignments a where(p_classroom is null or a.classroom_id=p_classroom) and(p_assignment is null or a.id=p_assignment) order by a.created_at desc,a.id limit 30 offset case when p_view='work' then 0 else skip end)x;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id),'[]') into rows from public.assignments a where a.id=any(ids);result:=result||jsonb_build_object('assignments',rows);
  select coalesce(jsonb_agg(to_jsonb(d)),'[]') into rows from public.drafts d where d.assignment_id=any(ids) and d.student_id=auth.uid();result:=result||jsonb_build_object('drafts',rows);
  if p_view='work' then
   select count(*) into n from public.submissions s where s.assignment_id=any(ids) and s.student_id=auth.uid();
   with history as(select s.id from public.submissions s where s.assignment_id=any(ids) and s.student_id=auth.uid() order by s.version desc,s.id limit 30 offset skip),current_version as(select s.id from public.submissions s where s.assignment_id=any(ids) and s.student_id=auth.uid() order by s.version desc,s.id limit 1)
   select coalesce(jsonb_agg(to_jsonb(s) order by s.version desc,s.id),'[]'),coalesce(array_agg(s.id),'{}'::uuid[]) into rows,linked from public.submissions s where s.id in(select id from history union select id from current_version);
  else
   with latest as(select distinct on(s.assignment_id,s.student_id) s.* from public.submissions s where s.assignment_id=any(ids) order by s.assignment_id,s.student_id,s.version desc)
   select coalesce(jsonb_agg((to_jsonb(s)-'body')||jsonb_build_object('body','')),'[]') into rows from latest s;
  end if;
  result:=result||jsonb_build_object('submissions',rows);
  if p_view='work' then select coalesce(jsonb_agg(to_jsonb(f)),'[]') into rows from public.feedback f where f.submission_id=any(linked);result:=result||jsonb_build_object('feedback',rows);end if;
 elsif p_view='feedback' then
  if teacher then
   with latest as(select distinct on(s.assignment_id,s.student_id) s.* from public.submissions s join public.assignments a on a.id=s.assignment_id where(p_classroom is null or a.classroom_id=p_classroom) order by s.assignment_id,s.student_id,s.version desc)
   select count(*) into n from latest where p_status='all' or status=p_status;
   with latest as(select distinct on(s.assignment_id,s.student_id) s.* from public.submissions s join public.assignments a on a.id=s.assignment_id where(p_classroom is null or a.classroom_id=p_classroom) order by s.assignment_id,s.student_id,s.version desc),items as(select * from latest where p_status='all' or status=p_status order by created_at desc,id limit 30 offset skip)
   select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc,s.id),'[]'),coalesce(array_agg(s.id),'{}'::uuid[]),coalesce(array_agg(s.assignment_id),'{}'::uuid[]) into rows,ids,linked from items s;
   result:=result||jsonb_build_object('submissions',rows);
   select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc,f.id),'[]') into rows from public.feedback f where f.submission_id=any(ids);result:=result||jsonb_build_object('feedback',rows);
  else
   select count(*) into n from public.feedback f join public.submissions s on s.id=f.submission_id join public.assignments a on a.id=s.assignment_id where(p_classroom is null or a.classroom_id=p_classroom);
   with items as(select f.* from public.feedback f join public.submissions s on s.id=f.submission_id join public.assignments a on a.id=s.assignment_id where(p_classroom is null or a.classroom_id=p_classroom) order by f.created_at desc,f.id limit 30 offset skip)
   select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc,f.id),'[]'),coalesce(array_agg(f.submission_id),'{}'::uuid[]) into rows,ids from items f;result:=result||jsonb_build_object('feedback',rows);
   select coalesce(jsonb_agg(to_jsonb(s)),'[]'),coalesce(array_agg(s.assignment_id),'{}'::uuid[]) into rows,linked from public.submissions s where s.id=any(ids);result:=result||jsonb_build_object('submissions',rows);
  end if;
  select coalesce(jsonb_agg(to_jsonb(a)),'[]') into rows from public.assignments a where a.id=any(linked);result:=result||jsonb_build_object('assignments',rows);
 elsif p_view='forest' then
  select count(distinct(s.assignment_id,s.student_id)) into n from public.submissions s join public.assignments a on a.id=s.assignment_id where s.status='completed' and(p_classroom is null or a.classroom_id=p_classroom);
  result:=result||jsonb_build_object('progress',jsonb_build_object('completed',n,'badges',(select coalesce(jsonb_object_agg(code,total),'{}') from(select b.code,count(*) total from public.badges b group by b.code)x)));
  select coalesce(jsonb_agg(to_jsonb(b)),'[]') into rows from(select distinct on(code) * from public.badges order by code,created_at desc,id)b;result:=result||jsonb_build_object('badges',rows);
  with latest_completed as(select distinct on(s.assignment_id,s.student_id) s.* from public.submissions s join public.assignments a on a.id=s.assignment_id where s.status='completed' and(p_classroom is null or a.classroom_id=p_classroom) order by s.assignment_id,s.student_id,s.version desc),items as(select * from latest_completed order by created_at desc,id limit 30 offset skip)
  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc,s.id),'[]'),coalesce(array_agg(s.assignment_id),'{}'::uuid[]) into rows,ids from items s;result:=result||jsonb_build_object('submissions',rows);
  select coalesce(jsonb_agg(to_jsonb(a)),'[]') into rows from public.assignments a where a.id=any(ids);result:=result||jsonb_build_object('assignments',rows);
 elsif p_view='contests' then
  select count(*) into n from public.contests c where p_classroom is null or c.classroom_id=p_classroom;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc,c.id),'[]'),coalesce(array_agg(c.id),'{}'::uuid[]) into rows,ids from(select * from public.contests where p_classroom is null or classroom_id=p_classroom order by created_at desc,id limit 30 offset skip)c;result:=result||jsonb_build_object('contests',rows);
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id),'[]'),coalesce(array_agg(e.id),'{}'::uuid[]) into rows,linked from(select * from public.entries where contest_id=any(ids) order by created_at desc,id limit 30 offset case when teacher then (p_entry_page-1)*30 else 0 end)e;result:=result||jsonb_build_object('entries',rows,'entryPage',p_entry_page,'entryTotal',(select count(*) from public.entries where contest_id=any(ids)));
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from public.reviews r where r.entry_id=any(linked);result:=result||jsonb_build_object('reviews',rows);
  -- Eligible work is independently paged with the same entry page. No old
  -- eligible submission is hidden by an unrelated global 10,000-row limit.
  with latest as(select distinct on(s.assignment_id,s.student_id) s.* from public.submissions s join public.assignments a on a.id=s.assignment_id where(p_classroom is null or a.classroom_id=p_classroom) and s.student_id=auth.uid() order by s.assignment_id,s.student_id,s.version desc),items as(select * from latest where status='completed' order by created_at desc,id limit 30 offset (p_entry_page-1)*30)
  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc,s.id),'[]') into rows from items s;result:=result||jsonb_build_object('submissions',rows);
  result:=result||jsonb_build_object('eligibleTotal',(select count(*) from(select distinct on(s.assignment_id) s.status from public.submissions s join public.assignments a on a.id=s.assignment_id where s.student_id=auth.uid() and(p_classroom is null or a.classroom_id=p_classroom) order by s.assignment_id,s.version desc)x where status='completed'));
  select coalesce(jsonb_agg(to_jsonb(a)),'[]') into rows from public.assignments a where a.id in(select (x->>'assignment_id')::uuid from jsonb_array_elements(result->'submissions')x);result:=result||jsonb_build_object('assignments',rows);
 elsif p_view='classes' then
  select count(*) into n from public.classrooms;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc,c.id),'[]') into rows from(select * from public.classrooms order by created_at desc,id limit 30 offset skip)c;result:=result||jsonb_build_object('classes',rows);
 end if;
 select coalesce(jsonb_agg(to_jsonb(g)),'[]') into rows from(select id,name,owner_id,created_at from public.grade_groups)g;result:=result||jsonb_build_object('gradeGroups',rows);
 select coalesce(jsonb_agg(to_jsonb(g)),'[]') into rows from(select group_id,classroom_id,approved from public.grade_members)g;result:=result||jsonb_build_object('gradeMembers',rows);
 if p_view='missions' then result:=result||jsonb_build_object('progress',jsonb_build_object('completed',(select count(distinct(s.assignment_id,s.student_id)) from public.submissions s join public.assignments a on a.id=s.assignment_id where s.status='completed' and(p_classroom is null or a.classroom_id=p_classroom)),'badges','{}'::jsonb));end if;
 return result||jsonb_build_object('pagination',jsonb_build_object('page',p_page,'total',n,'hasNext',n>p_page*30,'classroom',p_classroom,'status',p_status));
end $$;
revoke all on function public.workspace_page(text,uuid,integer,uuid,text,integer) from public,anon;
grant execute on function public.workspace_page(text,uuid,integer,uuid,text,integer) to authenticated;

create or replace function public.operator_recovery_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.data_session() or not private.is_operator() then raise exception 'BF_FORBIDDEN';end if;
 return jsonb_build_object('asOf',now(),'operatorCount',(select count(*) from private.operators o join public.profiles p on p.id=o.user_id where p.account_active),
 'pendingEmails',coalesce((select jsonb_agg(jsonb_build_object('email',email,'expiresAt',expires_at)) from private.operator_email_invitations where claimed_at is null and expires_at>now()),'[]'),
 'rehearsals',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,target_ref,steps,revision,updated_at from private.recovery_rehearsals order by updated_at desc limit 10)x),'[]'),
 'evidence',jsonb_build_object('backup',public.service_backup_health(),'copies',public.service_copy_health(),'cloud',public.service_cloud_backup_health(),'delivery',public.service_delivery_health()));
end $$;
revoke all on function public.operator_recovery_state() from public,anon;grant execute on function public.operator_recovery_state() to authenticated;

-- Weekly aggregates use the same consent, staff and deletion-hold predicate as
-- full record search. No writing body is returned by this summary endpoint.
create index if not exists reading_weekly_class_day_idx on public.reading_logs(classroom_id,read_on,student_id);
create function public.teacher_weekly_summary(p_classroom uuid default null,p_from date default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare week date;first_at timestamptz;last_at timestamptz;result jsonb;
begin
 if not private.data_session() or not exists(select 1 from public.profiles where id=auth.uid() and role='teacher') then raise exception 'BF_FORBIDDEN';end if;
 if p_classroom is not null and not private.staff_permission(p_classroom,'read') then raise exception 'BF_FORBIDDEN';end if;
 week:=coalesce(p_from,(now() at time zone 'Asia/Seoul')::date);week:=week-((extract(isodow from week)::integer)-1);
 if week<(now() at time zone 'Asia/Seoul')::date-730 or week>(now() at time zone 'Asia/Seoul')::date+7 then raise exception 'BF_INVALID_INPUT';end if;
 first_at:=week::timestamp at time zone 'Asia/Seoul';last_at:=(week+7)::timestamp at time zone 'Asia/Seoul';
 with eligible as materialized(select m.* from private.visible_learning_members()m where(p_classroom is null or m.classroom_id=p_classroom)),
 readings as materialized(select r.id,r.student_id,r.classroom_id,r.read_on from public.reading_logs r join eligible e on e.classroom_id=r.classroom_id and e.student_id=r.student_id where r.read_on>=week-7 and r.read_on<week+7),
 writing as materialized(select s.id,s.student_id,a.classroom_id,s.created_at,s.version from public.submissions s join public.assignments a on a.id=s.assignment_id join eligible e on e.classroom_id=a.classroom_id and e.student_id=s.student_id where s.created_at>=first_at-interval '7 days' and s.created_at<last_at),
 feedbacks as materialized(select f.id,f.created_at from public.feedback f join public.submissions s on s.id=f.submission_id join public.assignments a on a.id=s.assignment_id join eligible e on e.classroom_id=a.classroom_id and e.student_id=s.student_id where f.created_at>=first_at and f.created_at<last_at),
 latest as materialized(select distinct on(s.assignment_id,s.student_id) s.id,s.assignment_id,s.student_id,s.created_at,s.status,a.classroom_id from public.submissions s join public.assignments a on a.id=s.assignment_id join eligible e on e.classroom_id=a.classroom_id and e.student_id=s.student_id order by s.assignment_id,s.student_id,s.version desc),
 waiting as materialized(select * from latest where status='submitted' and created_at<now()-interval '7 days'),
 daily as(select d::date as "day",(select count(*) from readings where read_on=d::date) reading,(select count(*) from writing where(created_at at time zone 'Asia/Seoul')::date=d::date) writing,(select count(*) from feedbacks where(created_at at time zone 'Asia/Seoul')::date=d::date) feedback from generate_series(week::timestamp,(week+6)::timestamp,interval '1 day')d)
 select jsonb_build_object('from',week,'until',week+6,'eligibleStudents',(select count(distinct student_id) from eligible),'days',(select jsonb_agg(to_jsonb(d) order by d."day") from daily d),
 'totals',jsonb_build_object('reading',(select count(*) from readings where read_on>=week),'writing',(select count(*) from writing where created_at>=first_at),'revision',(select count(*) from writing where created_at>=first_at and version>1),'feedback',(select count(*) from feedbacks),'participants',(select count(distinct student_id) from(select student_id from readings where read_on>=week union all select student_id from writing where created_at>=first_at)x)),
 'previous',jsonb_build_object('reading',(select count(*) from readings where read_on<week),'writing',(select count(*) from writing where created_at<first_at)),
 'pendingCount',(select count(*) from waiting),'pending',coalesce((select jsonb_agg(to_jsonb(x)) from(select w.id,w.student_id,w.classroom_id,p.display_name,w.created_at from waiting w join public.profiles p on p.id=w.student_id order by w.created_at,w.id limit 20)x),'[]')) into result;
 return result;
end $$;
revoke all on function public.teacher_weekly_summary(uuid,date) from public,anon;
grant execute on function public.teacher_weekly_summary(uuid,date) to authenticated;

create function public.service_operations_extensions() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('protocol',1,'deliveryMonitoring',to_regprocedure('public.delivery_agent_report(text,text)') is not null,'workspacePages',to_regprocedure('public.workspace_page(text,uuid,integer,uuid,text,integer)') is not null,'weeklySummary',to_regprocedure('public.teacher_weekly_summary(uuid,date)') is not null)
$$;
revoke all on function public.service_operations_extensions() from public;
grant execute on function public.service_operations_extensions() to anon,authenticated;
