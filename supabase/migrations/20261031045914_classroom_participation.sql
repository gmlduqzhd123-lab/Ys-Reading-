-- Additive classroom participation features. No student text enters audit or replay logs.
alter table public.assignments add column choices jsonb not null default '[]'
  check(jsonb_typeof(choices)='array' and jsonb_array_length(choices)<=3);
alter table public.assignments add column success_criteria text not null default '' check(length(success_criteria)<=2000);
create table public.mission_selections (
  assignment_id uuid references public.assignments(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  choice_key text not null check(length(choice_key) between 1 and 40),
  created_at timestamptz not null default now(), primary key(assignment_id,student_id)
);
create index mission_selections_student_idx on public.mission_selections(student_id);
create table public.feedback_presets (
  id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check(length(btrim(title)) between 1 and 80),
  body text not null check(length(btrim(body)) between 1 and 2000), created_at timestamptz not null default now()
);
create index feedback_presets_teacher_idx on public.feedback_presets(teacher_id);
create table public.lesson_packs (
  id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check(length(btrim(title)) between 2 and 80),
  description text not null check(length(btrim(description)) between 1 and 1000),
  mission_id uuid not null references public.missions(id),
  grade_band text not null check(grade_band in ('3-4','5-6')),
  theme text not null check(theme in ('courage','empathy','fairness')),
  choices jsonb not null check(jsonb_typeof(choices)='array' and jsonb_array_length(choices) between 1 and 3),
  feedback text not null check(length(btrim(feedback)) between 1 and 2000),
  criteria text not null check(length(btrim(criteria)) between 1 and 2000),
  goal_target integer not null check(goal_target between 1 and 1000),
  published boolean not null default false, source_id uuid references public.lesson_packs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index lesson_packs_teacher_idx on public.lesson_packs(teacher_id);
create index lesson_packs_mission_idx on public.lesson_packs(mission_id);
create index lesson_packs_source_idx on public.lesson_packs(source_id);
create table public.forest_goals (
  id uuid primary key default gen_random_uuid(), classroom_id uuid not null references public.classrooms(id) on delete cascade,
  title text not null check(length(btrim(title)) between 2 and 80),
  kind text not null check(kind in ('reading','mission','revision')),
  target integer not null check(target between 1 and 1000),
  starts_at timestamptz not null default now(), ends_at timestamptz not null,
  created_at timestamptz not null default now(), check(ends_at>starts_at and ends_at<=starts_at+interval '180 days')
);
create index forest_goals_class_idx on public.forest_goals(classroom_id);
create table public.forest_badges (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid not null references public.forest_goals(id) on delete cascade,
  evidence_count integer not null check(evidence_count>0), created_at timestamptz not null default now(),
  unique(student_id,goal_id)
);
create index forest_badges_goal_idx on public.forest_badges(goal_id);
create table public.exhibitions (
  id uuid primary key default gen_random_uuid(), classroom_id uuid not null references public.classrooms(id) on delete cascade,
  group_id uuid references public.grade_groups(id),
  title text not null check(length(btrim(title)) between 2 and 80),
  description text not null check(length(btrim(description)) between 1 and 2000),
  ends_at timestamptz not null, created_at timestamptz not null default now(),
  check(ends_at>created_at and ends_at<=created_at+interval '180 days')
);
create index exhibitions_class_idx on public.exhibitions(classroom_id);
create index exhibitions_group_idx on public.exhibitions(group_id);
create table public.exhibition_entries (
  id uuid primary key default gen_random_uuid(), exhibition_id uuid not null references public.exhibitions(id) on delete cascade,
  post_id uuid not null references public.plaza_posts(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','approved','withdrawn')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(exhibition_id,post_id)
);
create index exhibition_entries_post_idx on public.exhibition_entries(post_id);
create index exhibition_entries_student_idx on public.exhibition_entries(student_id);
create table public.class_jobs (
  id uuid primary key default gen_random_uuid(), classroom_id uuid not null references public.classrooms(id) on delete cascade,
  title text not null check(length(btrim(title)) between 2 and 80),
  description text not null check(length(btrim(description)) between 1 and 2000),
  reward integer not null check(reward between 1 and 1000), capacity integer not null check(capacity between 1 and 30),
  active boolean not null default true, created_at timestamptz not null default now()
);
create index class_jobs_class_idx on public.class_jobs(classroom_id);
create table public.job_applications (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.class_jobs(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','assigned','submitted','paid','declined')),
  report text not null default '' check(length(report)<=2000), updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(), unique(job_id,student_id)
);
create index job_applications_student_idx on public.job_applications(student_id);
create table public.saving_goals (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  title text not null check(length(btrim(title)) between 1 and 80), target integer not null check(target between 1 and 100000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(student_id,classroom_id)
);
create index saving_goals_class_idx on public.saving_goals(classroom_id);
create table public.shop_proposals (
  id uuid primary key default gen_random_uuid(), classroom_id uuid not null references public.classrooms(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check(length(btrim(name)) between 2 and 80),
  reason text not null check(length(btrim(reason)) between 1 and 1000), price integer not null check(price between 1 and 100000),
  status text not null default 'pending' check(status in ('pending','approved','declined')),
  item_id uuid references public.shop_items(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index shop_proposals_class_idx on public.shop_proposals(classroom_id);
create index shop_proposals_student_idx on public.shop_proposals(student_id);
create index shop_proposals_item_idx on public.shop_proposals(item_id);
create table private.participation_requests (
  actor_id uuid not null references public.profiles(id) on delete cascade, request_id uuid not null,
  fingerprint text not null, result jsonb not null, created_at timestamptz not null default now(),
  primary key(actor_id,request_id)
);
alter table private.participation_requests enable row level security;
revoke all on private.participation_requests from public,anon,authenticated;

create function private.exhibition_visible(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.data_session() and exists(select 1 from public.exhibitions e where e.id=p_id and
 (private.is_teacher(e.classroom_id) or (case when e.group_id is null then private.is_active_student(e.classroom_id) else private.in_grade(e.group_id) end)));
$$;
revoke all on function private.exhibition_visible(uuid) from public,anon;
grant execute on function private.exhibition_visible(uuid) to authenticated;
do $$ declare t text; begin
 foreach t in array array['mission_selections','feedback_presets','lesson_packs','forest_goals','forest_badges','exhibitions','exhibition_entries','class_jobs','job_applications','saving_goals','shop_proposals'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create policy selection_read on public.mission_selections for select to authenticated using(private.data_session() and student_id=(select auth.uid()));
create policy presets_read on public.feedback_presets for select to authenticated using(private.data_session() and teacher_id=(select auth.uid()));
create policy packs_read on public.lesson_packs for select to authenticated using(private.data_session() and exists(select 1 from public.profiles where id=(select auth.uid()) and role='teacher') and (teacher_id=(select auth.uid()) or published));
create policy goals_read on public.forest_goals for select to authenticated using(private.is_teacher(classroom_id) or private.is_active_student(classroom_id));
create policy forest_badges_read on public.forest_badges for select to authenticated using(private.data_session() and student_id=(select auth.uid()));
create policy exhibition_read on public.exhibitions for select to authenticated using(private.exhibition_visible(id));
create policy exhibit_read on public.exhibition_entries for select to authenticated using(private.exhibition_visible(exhibition_id) and private.plaza_visible(post_id) and
 (student_id=(select auth.uid()) or status='approved' or exists(select 1 from public.exhibitions e where e.id=exhibition_id and private.is_teacher(e.classroom_id))));
create policy jobs_read on public.class_jobs for select to authenticated using(private.is_teacher(classroom_id) or private.is_active_student(classroom_id));
create policy job_application_read on public.job_applications for select to authenticated using(private.data_session() and
 (student_id=(select auth.uid()) or exists(select 1 from public.class_jobs j where j.id=job_id and private.is_teacher(j.classroom_id))));
create policy savings_read on public.saving_goals for select to authenticated using(private.data_session() and (student_id=(select auth.uid()) or private.is_teacher(classroom_id)));
create policy proposals_read on public.shop_proposals for select to authenticated using(private.data_session() and (student_id=(select auth.uid()) or private.is_teacher(classroom_id)));

create function private.validate_choices(p_choices jsonb) returns boolean language plpgsql immutable set search_path='' as $$
 declare v jsonb; seen text[]:='{}';
 begin
 if p_choices is null or jsonb_typeof(p_choices)<>'array' or jsonb_array_length(p_choices) not between 1 and 3 then return false; end if;
 for v in select * from jsonb_array_elements(p_choices) loop
 if jsonb_typeof(v)<>'object' or coalesce(v->>'key','') !~ '^[a-z][a-z0-9_-]{0,39}$' or
 coalesce(length(btrim(v->>'label')),0) not between 1 and 80 or coalesce(length(btrim(v->>'prompt')),0) not between 1 and 1000 or v->>'key'=any(seen) then return false; end if;
 seen:=array_append(seen,v->>'key'); end loop;
 return true;
 end $$;
revoke all on function private.validate_choices(jsonb) from public,anon,authenticated;
-- Defense in depth: legacy save/submit endpoints must also enforce the selected path.
create function private.check_mission_choice() returns trigger language plpgsql security definer set search_path='' as $$
 declare options jsonb;
 begin
 select choices into options from public.assignments where id=new.assignment_id;
 if jsonb_array_length(options)>0 and not exists(
 select 1 from public.mission_selections s where s.assignment_id=new.assignment_id and s.student_id=new.student_id and exists(
 select 1 from jsonb_array_elements(options) o where o->>'key'=s.choice_key)) then raise exception 'BF_CHOICE_REQUIRED'; end if;
 return new;
 end $$;
revoke all on function private.check_mission_choice() from public,anon,authenticated;
create trigger draft_choice before insert or update on public.drafts for each row execute function private.check_mission_choice();
create trigger submission_choice before insert on public.submissions for each row execute function private.check_mission_choice();

create function public.participation_command(p_command text,p_payload jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor public.profiles; replay private.participation_requests; fingerprint text; result jsonb;
 cls uuid; target uuid; grp uuid; v jsonb; options jsonb; a public.assignments; pack public.lesson_packs; mission public.missions;
 goal public.forest_goals; ex public.exhibitions; post public.plaza_posts; entry public.exhibition_entries;
 job public.class_jobs; app public.job_applications; proposal public.shop_proposals;
 count_all integer; count_mine integer; n integer; choice text; temp_id uuid;
begin
 if not private.data_session() then raise exception 'BF_FORBIDDEN'; end if;
 if p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>50000 then raise exception 'BF_INVALID_INPUT'; end if;
 select * into actor from public.profiles where id=auth.uid() for update;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('command',p_command,'payload',p_payload)::text,'UTF8')),'hex');
 select * into replay from private.participation_requests where actor_id=actor.id and request_id=p_request_id;
 if found then
 if replay.fingerprint<>fingerprint then raise exception 'BF_IDEMPOTENCY_CONFLICT'; end if;
 return replay.result; end if;
 cls:=(p_payload->>'classroomId')::uuid; target:=(p_payload->>'id')::uuid; grp:=(p_payload->>'groupId')::uuid;
 case p_command
 when 'class_start' then
 if actor.role<>'teacher' then raise exception 'BF_FORBIDDEN'; end if;
 result:=to_jsonb(public.create_classroom(p_payload->>'name')); cls:=(result->>'id')::uuid;
 when 'assign_choices','pack_assign' then
 if not private.is_teacher(cls) then raise exception 'BF_FORBIDDEN'; end if;
 if p_command='pack_assign' then
 select * into pack from public.lesson_packs where id=target and (teacher_id=actor.id or published);
 if not found then raise exception 'BF_FORBIDDEN'; end if;
 options:=pack.choices; temp_id:=pack.mission_id;
 else options:=p_payload->'choices'; temp_id:=(p_payload->>'missionId')::uuid; end if;
 if not private.validate_choices(options) then raise exception 'BF_INVALID_INPUT'; end if;
 select * into mission from public.missions where id=temp_id;
 if not found then raise exception 'BF_INVALID_INPUT'; end if;
 if (p_payload->>'dueAt')::timestamptz<=clock_timestamp() then raise exception 'BF_INVALID_INPUT'; end if;
 insert into public.assignments(classroom_id,mission_id,mission_snapshot,due_at,choices,success_criteria)
 values(cls,mission.id,to_jsonb(mission),(p_payload->>'dueAt')::timestamptz,options,case when p_command='pack_assign' then pack.criteria else coalesce(p_payload->>'criteria','') end) returning * into a;
 if p_command='pack_assign' then
 insert into public.feedback_presets(teacher_id,title,body) values(actor.id,pack.title,pack.feedback);
 insert into public.forest_goals(classroom_id,title,kind,target,ends_at) values(cls,left(pack.title||' 함께 완성하기',80),'mission',pack.goal_target,now()+interval '30 days');
 end if;
 result:=to_jsonb(a);
 when 'choose_mission' then
 select * into a from public.assignments where id=target;
 if not found or actor.role<>'student' or not private.is_active_student(a.classroom_id) then raise exception 'BF_FORBIDDEN'; end if;
 choice:=p_payload->>'key'; cls:=a.classroom_id;
 if not exists(select 1 from jsonb_array_elements(a.choices) o where o->>'key'=choice) then raise exception 'BF_INVALID_INPUT'; end if;
 if exists(select 1 from public.mission_selections where assignment_id=target and student_id=actor.id and choice_key<>choice) and
 (exists(select 1 from public.drafts where assignment_id=target and student_id=actor.id and (title<>'' or body<>'')) or exists(select 1 from public.submissions where assignment_id=target and student_id=actor.id))
 then raise exception 'BF_CHOICE_LOCKED'; end if;
 insert into public.mission_selections(assignment_id,student_id,choice_key) values(target,actor.id,choice)
 on conflict(assignment_id,student_id) do update set choice_key=excluded.choice_key returning to_jsonb(mission_selections.*) into result;
 when 'preset_save' then
 if actor.role<>'teacher' then raise exception 'BF_FORBIDDEN'; end if;
 if (select count(*) from public.feedback_presets where teacher_id=actor.id)>=100 then raise exception 'BF_INVALID_INPUT'; end if;
 insert into public.feedback_presets(teacher_id,title,body) values(actor.id,btrim(p_payload->>'title'),btrim(p_payload->>'body')) returning to_jsonb(feedback_presets.*) into result;
 when 'review_batch' then
 if actor.role<>'teacher' or coalesce(jsonb_array_length(p_payload->'items'),0) not between 1 and 20 then raise exception 'BF_INVALID_INPUT'; end if;
 n:=0;
 for v in select * from jsonb_array_elements(p_payload->'items') loop
 if v->>'read' is distinct from 'true' then raise exception 'BF_INVALID_INPUT'; end if;
 if v->>'kind'='reading' then
 perform public.hub_command('reading_verify',jsonb_build_object('id',v->>'id'),gen_random_uuid());
 elsif v->>'kind'='writing' then
 perform public.review_work((v->>'id')::uuid,btrim(p_payload->>'body'),p_payload->>'decision');
 else raise exception 'BF_INVALID_INPUT'; end if;
 n:=n+1;
 end loop; result:=jsonb_build_object('reviewed',n);
 when 'goal_create' then
 if not private.is_teacher(cls) then raise exception 'BF_FORBIDDEN'; end if;
 insert into public.forest_goals(classroom_id,title,kind,target,ends_at) values(cls,btrim(p_payload->>'title'),p_payload->>'kind',(p_payload->>'target')::integer,(p_payload->>'endsAt')::timestamptz)
 returning to_jsonb(forest_goals.*) into result;
 when 'goal_claim' then
 select * into goal from public.forest_goals where id=target;
 if not found or actor.role<>'student' or not private.is_active_student(goal.classroom_id) then raise exception 'BF_FORBIDDEN'; end if;
 cls:=goal.classroom_id;
 select count(*),count(*) filter(where student_id=actor.id) into count_all,count_mine from public.activity_events
 where classroom_id=cls and kind=goal.kind and created_at between goal.starts_at and goal.ends_at;
 if count_all<goal.target or count_mine<1 then raise exception 'BF_GOAL_NOT_READY'; end if;
 insert into public.forest_badges(student_id,goal_id,evidence_count) values(actor.id,target,count_mine)
 on conflict(student_id,goal_id) do nothing;
 result:=jsonb_build_object('earned',true);
 when 'exhibition_create' then
 if not private.is_teacher(cls) or (grp is not null and not exists(select 1 from public.grade_members where group_id=grp and classroom_id=cls and approved)) then raise exception 'BF_FORBIDDEN'; end if;
 insert into public.exhibitions(classroom_id,group_id,title,description,ends_at) values(cls,grp,btrim(p_payload->>'title'),btrim(p_payload->>'description'),(p_payload->>'endsAt')::timestamptz)
 returning to_jsonb(exhibitions.*) into result;
 when 'exhibit_submit' then
 select * into ex from public.exhibitions where id=(p_payload->>'exhibitionId')::uuid;
 select * into post from public.plaza_posts where id=target and student_id=actor.id and status='published';
 if ex.id is null or post.id is null or not private.exhibition_visible(ex.id) or not private.is_active_student(post.classroom_id) or now()>ex.ends_at or
 not ((ex.group_id is null and post.group_id is null and ex.classroom_id=post.classroom_id) or (ex.group_id is not null and coalesce(ex.group_id=post.group_id,false)))
 then raise exception 'BF_FORBIDDEN'; end if;
 if p_payload->>'consent' is distinct from 'true' then raise exception 'BF_INVALID_INPUT'; end if;
 insert into public.exhibition_entries(exhibition_id,post_id,student_id) values(ex.id,post.id,actor.id)
 on conflict(exhibition_id,post_id) do update set status='pending',updated_at=now() returning to_jsonb(exhibition_entries.*) into result; cls:=post.classroom_id;
 when 'exhibit_decide','exhibit_withdraw' then
 select * into entry from public.exhibition_entries where id=target for update;
 select * into ex from public.exhibitions where id=entry.exhibition_id;
 if entry.id is null then raise exception 'BF_FORBIDDEN'; end if;
 if p_command='exhibit_withdraw' then
 if entry.student_id<>actor.id and not private.is_teacher(ex.classroom_id) then raise exception 'BF_FORBIDDEN'; end if;
 update public.exhibition_entries set status='withdrawn',updated_at=now() where id=target;
 else
 if not private.is_teacher(ex.classroom_id) or entry.status<>'pending' or not private.plaza_visible(entry.post_id) or not exists(select 1 from public.plaza_posts where id=entry.post_id and status='published') then raise exception 'BF_FORBIDDEN'; end if;
 update public.exhibition_entries set status=case when p_payload->>'approve'='true' then 'approved' else 'withdrawn' end,updated_at=now() where id=target;
 end if; cls:=ex.classroom_id; result:=jsonb_build_object('updated',true);
 when 'job_create' then
 if not private.is_teacher(cls) then raise exception 'BF_FORBIDDEN'; end if;
 insert into public.class_jobs(classroom_id,title,description,reward,capacity) values(cls,btrim(p_payload->>'title'),btrim(p_payload->>'description'),(p_payload->>'reward')::integer,(p_payload->>'capacity')::integer)
 returning to_jsonb(class_jobs.*) into result;
 when 'job_apply' then
 select * into job from public.class_jobs where id=target and active for update;
 if not found or actor.role<>'student' or not private.is_active_student(job.classroom_id) then raise exception 'BF_FORBIDDEN'; end if;
 insert into public.job_applications(job_id,student_id) values(target,actor.id) on conflict(job_id,student_id) do nothing;
 select to_jsonb(x) into result from public.job_applications x where job_id=target and student_id=actor.id; cls:=job.classroom_id;
 when 'job_toggle' then
 select * into job from public.class_jobs where id=target for update;
 if not found or not private.is_teacher(job.classroom_id) or jsonb_typeof(p_payload->'active') is distinct from 'boolean' then raise exception 'BF_FORBIDDEN'; end if;
 cls:=job.classroom_id;
 update public.class_jobs set active=(p_payload->>'active')::boolean where id=target returning to_jsonb(class_jobs.*) into result;
 when 'job_decide','job_report','job_pay' then
 select * into app from public.job_applications where id=target for update;
 select * into job from public.class_jobs where id=app.job_id for update;
 if app.id is null then raise exception 'BF_FORBIDDEN'; end if;
 cls:=job.classroom_id;
 if p_command='job_report' then
 if app.student_id<>actor.id or not private.is_active_student(cls) or app.status<>'assigned' then raise exception 'BF_INVALID_TRANSITION'; end if;
 if coalesce(length(btrim(p_payload->>'report')),0) not between 1 and 2000 then raise exception 'BF_INVALID_INPUT'; end if;
 update public.job_applications set report=btrim(p_payload->>'report'),status='submitted',updated_at=now() where id=target;
 else
 if not private.is_teacher(cls) or not exists(select 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.student_id=app.student_id and e.classroom_id=cls and e.active and p.account_active and p.consent_status='verified') or
 exists(select 1 from private.deletion_requests d where d.student_id=app.student_id and (d.classroom_id=cls or d.scope='account') and d.status in ('approved','purged')) then raise exception 'BF_FORBIDDEN'; end if;
 if p_command='job_decide' then
 if app.status<>'pending' then raise exception 'BF_INVALID_TRANSITION'; end if;
 if p_payload->>'approve'='true' and (select count(*) from public.job_applications where job_id=job.id and status in ('assigned','submitted','paid'))>=job.capacity then raise exception 'BF_CAPACITY'; end if;
 update public.job_applications set status=case when p_payload->>'approve'='true' then 'assigned' else 'declined' end,updated_at=now() where id=target;
 else
 if app.status<>'submitted' then raise exception 'BF_INVALID_TRANSITION'; end if;
 insert into public.economy_ledger(student_id,classroom_id,amount,reason,source_key,actor_id) values(app.student_id,cls,job.reward,'학급 역할 완료: '||job.title,'job:'||app.id,actor.id);
 update public.job_applications set status='paid',updated_at=now() where id=target;
 end if; end if;
 select to_jsonb(x) into result from public.job_applications x where id=target;
 when 'saving_save' then
 if actor.role<>'student' or not private.is_active_student(cls) then raise exception 'BF_FORBIDDEN'; end if;
 insert into public.saving_goals(student_id,classroom_id,title,target) values(actor.id,cls,btrim(p_payload->>'title'),(p_payload->>'target')::integer)
 on conflict(student_id,classroom_id) do update set title=excluded.title,target=excluded.target,updated_at=now() returning to_jsonb(saving_goals.*) into result;
 when 'proposal_create' then
 if actor.role<>'student' or not private.is_active_student(cls) then raise exception 'BF_FORBIDDEN'; end if;
 if (select count(*) from public.shop_proposals where student_id=actor.id and status='pending')>=10 then raise exception 'BF_INVALID_INPUT'; end if;
 insert into public.shop_proposals(classroom_id,student_id,name,reason,price) values(cls,actor.id,btrim(p_payload->>'name'),btrim(p_payload->>'reason'),(p_payload->>'price')::integer)
 returning to_jsonb(shop_proposals.*) into result;
 when 'proposal_decide' then
 select * into proposal from public.shop_proposals where id=target for update;
 if not found or not private.is_teacher(proposal.classroom_id) then raise exception 'BF_FORBIDDEN'; end if;
 if proposal.status<>'pending' then raise exception 'BF_INVALID_TRANSITION'; end if;
 cls:=proposal.classroom_id;
 if p_payload->>'approve'='true' then
 insert into public.shop_items(classroom_id,name,price,stock,kind) values(cls,proposal.name,(p_payload->>'price')::integer,(p_payload->>'stock')::integer,'privilege') returning id into temp_id;
 end if;
 update public.shop_proposals set status=case when p_payload->>'approve'='true' then 'approved' else 'declined' end,item_id=temp_id,updated_at=now() where id=target returning to_jsonb(shop_proposals.*) into result;
 when 'pack_visibility' then
 if actor.role<>'teacher' or jsonb_typeof(p_payload->'published') is distinct from 'boolean' then raise exception 'BF_FORBIDDEN'; end if;
 update public.lesson_packs set published=(p_payload->>'published')::boolean where id=target and teacher_id=actor.id returning to_jsonb(lesson_packs.*) into result;
 if not found then raise exception 'BF_FORBIDDEN'; end if;
 when 'pack_update' then
 if actor.role<>'teacher' or not private.validate_choices(p_payload->'choices') then raise exception 'BF_FORBIDDEN'; end if;
 select * into mission from public.missions where id=(p_payload->>'missionId')::uuid;
 if not found then raise exception 'BF_INVALID_INPUT'; end if;
 update public.lesson_packs set title=btrim(p_payload->>'title'),description=btrim(p_payload->>'description'),mission_id=mission.id,grade_band=mission.grade_band,theme=mission.theme,
 choices=p_payload->'choices',feedback=btrim(p_payload->>'feedback'),criteria=btrim(p_payload->>'criteria'),goal_target=(p_payload->>'goalTarget')::integer
 where id=target and teacher_id=actor.id returning to_jsonb(lesson_packs.*) into result;
 if not found then raise exception 'BF_FORBIDDEN'; end if;
 when 'pack_save','pack_clone' then
 if actor.role<>'teacher' then raise exception 'BF_FORBIDDEN'; end if;
 if p_command='pack_clone' then
 select * into pack from public.lesson_packs where id=target and (published or teacher_id=actor.id);
 if not found then raise exception 'BF_FORBIDDEN'; end if;
 insert into public.lesson_packs(teacher_id,title,description,mission_id,grade_band,theme,choices,feedback,criteria,goal_target,source_id)
 values(actor.id,left(pack.title||' · 나의 사본',80),pack.description,pack.mission_id,pack.grade_band,pack.theme,pack.choices,pack.feedback,pack.criteria,pack.goal_target,pack.id)
 returning to_jsonb(lesson_packs.*) into result;
 else
 if not private.validate_choices(p_payload->'choices') then raise exception 'BF_INVALID_INPUT'; end if;
 insert into public.lesson_packs(teacher_id,title,description,mission_id,grade_band,theme,choices,feedback,criteria,goal_target,published)
 select actor.id,btrim(p_payload->>'title'),btrim(p_payload->>'description'),m.id,m.grade_band,m.theme,p_payload->'choices',btrim(p_payload->>'feedback'),btrim(p_payload->>'criteria'),(p_payload->>'goalTarget')::integer,coalesce((p_payload->>'published')::boolean,false)
 from public.missions m where m.id=(p_payload->>'missionId')::uuid returning to_jsonb(lesson_packs.*) into result;
 if result is null then raise exception 'BF_INVALID_INPUT'; end if;
 end if;
 else raise exception 'BF_INVALID_INPUT';
 end case;
 -- Replays containing learning text are not retained: store only stable identifiers/counts.
 if p_command in ('review_batch','goal_claim','exhibit_decide','exhibit_withdraw') then null;
 else result:=jsonb_build_object('id',result->>'id','assignment_id',result->>'assignment_id','classroom_id',coalesce(result->>'classroom_id',cls::text),'choice_key',result->>'choice_key'); end if;
 insert into private.participation_requests(actor_id,request_id,fingerprint,result) values(actor.id,p_request_id,fingerprint,result);
 insert into public.audit_events(actor_id,classroom_id,event_type,entity_id) values(actor.id,cls,'participation_'||p_command,coalesce((result->>'id')::uuid,cls));
 return result;
end $$;
revoke all on function public.participation_command(text,jsonb,uuid) from public,anon;
grant execute on function public.participation_command(text,jsonb,uuid) to authenticated;

-- Invoker queries inherit the policies above; only aggregate class goals need privileged counting.
create function public.forest_progress(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare g public.forest_goals; total integer; mine integer;
 begin
 select * into g from public.forest_goals where id=p_id;
 if g.id is null or not (private.is_teacher(g.classroom_id) or private.is_active_student(g.classroom_id)) then raise exception 'BF_FORBIDDEN'; end if;
 select count(*),count(*) filter(where student_id=auth.uid()) into total,mine from public.activity_events where classroom_id=g.classroom_id and kind=g.kind and created_at between g.starts_at and g.ends_at;
 return to_jsonb(g)||jsonb_build_object('progress',total,'mine',mine,'claimed',exists(select 1 from public.forest_badges where goal_id=g.id and student_id=auth.uid()));
 end $$;
revoke all on function public.forest_progress(uuid) from public,anon;
grant execute on function public.forest_progress(uuid) to authenticated;
create function public.participation_state() returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.data_session() then raise exception 'BF_FORBIDDEN'; end if;
 return jsonb_build_object(
 'goals',coalesce((select jsonb_agg(public.forest_progress(id)) from (select id from public.forest_goals order by created_at desc,id limit 100) x),'[]'),
 'exhibitions',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.exhibitions order by created_at desc,id limit 100) x),'[]'),
 'exhibits',coalesce((select jsonb_agg(to_jsonb(x)) from (select e.*,p.title,p.body,p.pen_name from public.exhibition_entries e join public.plaza_posts p on p.id=e.post_id and p.status='published' order by e.created_at,e.id limit 500) x),'[]'),
 'jobs',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.class_jobs order by created_at desc,id limit 100) x),'[]'),
 'applications',coalesce((select jsonb_agg(to_jsonb(x)) from (select a.*,p.display_name from public.job_applications a join public.profiles p on p.id=a.student_id order by a.created_at desc,a.id limit 500) x),'[]'),
 'proposals',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.shop_proposals order by created_at desc,id limit 100) x),'[]'),
 'savings',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.saving_goals where student_id=auth.uid() order by created_at desc limit 100) x),'[]'),
 'packs',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.lesson_packs order by created_at desc,id limit 100) x),'[]'),
 'presets',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.feedback_presets order by created_at desc,id limit 100) x),'[]'),
 'selections',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.mission_selections where student_id=auth.uid() order by created_at desc limit 1000) x),'[]'));
end $$;
revoke all on function public.participation_state() from public,anon;
grant execute on function public.participation_state() to authenticated;

-- Include new student records in the existing approved retention/deletion workflow.
-- Guarded edits preserve its service-role-only access, locking and expiry checks.
do $$
declare definition text; needle text:='delete from public.plaza_reactions pr';
begin
 definition:=pg_get_functiondef('public.operations_purge(uuid)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'Expected purge anchor missing'; end if;
 definition:=replace(definition,needle,$extra$
 delete from public.mission_selections s where student_id=r.student_id and (r.classroom_id is null or exists(select 1 from public.assignments a where a.id=s.assignment_id and a.classroom_id=r.classroom_id));
 delete from public.forest_badges b where student_id=r.student_id and (r.classroom_id is null or exists(select 1 from public.forest_goals g where g.id=b.goal_id and g.classroom_id=r.classroom_id));
 delete from public.exhibition_entries e where student_id=r.student_id and (r.classroom_id is null or exists(select 1 from public.plaza_posts p where p.id=e.post_id and p.classroom_id=r.classroom_id));
 delete from public.job_applications a where student_id=r.student_id and (r.classroom_id is null or exists(select 1 from public.class_jobs j where j.id=a.job_id and j.classroom_id=r.classroom_id));
 delete from public.saving_goals where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id);
 delete from public.shop_proposals where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id);
 delete from private.participation_requests where actor_id=r.student_id and (r.classroom_id is null or result->>'classroom_id'=r.classroom_id::text);
 $extra$||needle);
 execute definition;
 definition:=pg_get_functiondef('private.last_student_activity(uuid,uuid)'::regprocedure);
 needle:='select created_at at from public.enrollments';
 if position(needle in definition)=0 then raise exception 'Expected activity anchor missing'; end if;
 definition:=replace(definition,needle,$extra$
 select x.updated_at at from public.job_applications x join public.class_jobs j on j.id=x.job_id where x.student_id=p_student and j.classroom_id=p_class
 union all select updated_at from public.saving_goals where student_id=p_student and classroom_id=p_class
 union all select updated_at from public.shop_proposals where student_id=p_student and classroom_id=p_class
 union all select s.created_at from public.mission_selections s join public.assignments a on a.id=s.assignment_id where s.student_id=p_student and a.classroom_id=p_class
 union all select e.updated_at from public.exhibition_entries e join public.plaza_posts p on p.id=e.post_id where e.student_id=p_student and p.classroom_id=p_class
 union all select b.created_at from public.forest_badges b join public.forest_goals g on g.id=b.goal_id where b.student_id=p_student and g.classroom_id=p_class
 union all $extra$||needle);
 execute definition;
 definition:=pg_get_functiondef('public.deletion_preview(uuid)'::regprocedure);
 needle:='''auth_account'',r.scope';
 if position(needle in definition)=0 then raise exception 'Expected deletion preview anchor missing'; end if;
 definition:=replace(definition,needle,$extra$
 'participation_records',
 (select count(*) from public.job_applications x join public.class_jobs j on j.id=x.job_id where x.student_id=r.student_id and (r.classroom_id is null or j.classroom_id=r.classroom_id))+
 (select count(*) from public.saving_goals where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id))+
 (select count(*) from public.shop_proposals where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id))+
 (select count(*) from public.exhibition_entries e join public.plaza_posts p on p.id=e.post_id where e.student_id=r.student_id and (r.classroom_id is null or p.classroom_id=r.classroom_id))+
 (select count(*) from public.mission_selections s join public.assignments a on a.id=s.assignment_id where s.student_id=r.student_id and (r.classroom_id is null or a.classroom_id=r.classroom_id))+
 (select count(*) from public.forest_badges b join public.forest_goals g on g.id=b.goal_id where b.student_id=r.student_id and (r.classroom_id is null or g.classroom_id=r.classroom_id)),
 $extra$||needle);
 execute definition;
end $$;
