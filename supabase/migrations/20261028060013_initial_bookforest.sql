-- Bookforest v0.1: apply only to a fresh Supabase project.
-- All exposed tables use RLS. Client mutations enter through narrowly granted RPCs.
-- SECURITY DEFINER is intentional: snapshots and rewards have no client write grant.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  role text not null default 'student' check (role in ('student','teacher')),
  consent_status text not null default 'pending' check (consent_status in ('pending','verified')),
  created_at timestamptz not null default now()
);
create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  teacher_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index classrooms_teacher_idx on public.classrooms(teacher_id);
create table public.enrollments (
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(classroom_id,student_id)
);
create index enrollments_student_idx on public.enrollments(student_id,classroom_id) where active;
create table public.missions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  theme text not null check(theme in ('courage','empathy','fairness')),
  grade_band text not null check(grade_band in ('3-4','5-6')),
  prompt text not null,
  description text not null,
  minutes integer not null check(minutes between 1 and 120),
  requires_revision boolean not null default false,
  steps text[] not null default '{}',
  kind text not null default 'writing' check(kind in ('question','writing','revision')),
  created_at timestamptz not null default now()
);
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id),
  mission_id uuid not null references public.missions(id),
  mission_snapshot jsonb not null,
  due_at timestamptz,
  created_at timestamptz not null default now()
);
create index assignments_classroom_idx on public.assignments(classroom_id);
create index assignments_mission_idx on public.assignments(mission_id);
create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id),
  student_id uuid not null references public.profiles(id),
  title text not null default '' check(char_length(title)<=100),
  body text not null default '' check(char_length(body)<=10000),
  revision integer not null default 1 check(revision>=1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assignment_id,student_id)
);
create index drafts_student_idx on public.drafts(student_id);
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id),
  student_id uuid not null references public.profiles(id),
  title text not null check(char_length(btrim(title))>=1 and char_length(title)<=100),
  body text not null check(char_length(btrim(body))>=1 and char_length(body)<=10000),
  version integer not null check(version>=1),
  status text not null default 'submitted' check(status in ('submitted','revision_requested','completed')),
  is_late boolean not null default false,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique(assignment_id,student_id,version),
  unique(student_id,request_id)
);
create index submissions_student_assignment_idx on public.submissions(student_id,assignment_id,version desc);
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions(id),
  teacher_id uuid not null references public.profiles(id),
  body text not null check(char_length(btrim(body))>=1 and char_length(body)<=2000),
  decision text not null check(decision in ('revision_requested','completed')),
  created_at timestamptz not null default now()
);
create index feedback_teacher_idx on public.feedback(teacher_id);
create table public.badges (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  code text not null check(code in ('first_mission','first_revision','three_themes')),
  source_submission_id uuid not null references public.submissions(id),
  created_at timestamptz not null default now(),
  unique(student_id,code)
);
create index badges_source_idx on public.badges(source_submission_id);
create table public.contests (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id),
  title text not null check(char_length(btrim(title))>=1 and char_length(title)<=100),
  description text not null check(char_length(description)<=4000),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  status text not null default 'open' check(status in ('open','reviewing','published')),
  rubric jsonb not null default '[{"key":"thought","label":"자기 생각","max":30},{"key":"evidence","label":"근거","max":30},{"key":"structure","label":"구성","max":25},{"key":"expression","label":"표현","max":15}]',
  created_at timestamptz not null default now(),
  check(closes_at>opens_at)
);
create index contests_classroom_idx on public.contests(classroom_id);
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id),
  student_id uuid not null references public.profiles(id),
  submission_id uuid not null references public.submissions(id),
  title text not null,
  body text not null,
  receipt text not null unique default ('BF-' || upper(replace(gen_random_uuid()::text,'-',''))),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique(contest_id,student_id),
  unique(student_id,request_id)
);
create index entries_student_idx on public.entries(student_id);
create index entries_submission_idx on public.entries(submission_id);
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null unique references public.entries(id),
  teacher_id uuid not null references public.profiles(id),
  scores jsonb not null,
  comment text not null check(char_length(btrim(comment))>=1 and char_length(comment)<=2000),
  created_at timestamptz not null default now()
);
create index reviews_teacher_idx on public.reviews(teacher_id);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  classroom_id uuid references public.classrooms(id),
  event_type text not null,
  entity_id uuid,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_classroom_idx on public.audit_events(classroom_id,created_at desc);
create index audit_actor_idx on public.audit_events(actor_id);

-- No role or consent claim is taken from user-editable auth metadata.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,display_name,role,consent_status)
  values(new.id,coalesce(nullif(left(btrim(new.raw_user_meta_data->>'display_name'),40),''),'새싹 독자'),'student','pending');
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

-- Authorization helpers avoid recursive policies and expose only booleans about the caller.
create function private.is_teacher(p_classroom_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.classrooms c join public.profiles p on p.id=c.teacher_id
    where c.id=p_classroom_id and c.teacher_id=auth.uid() and p.role='teacher');
$$;
create function private.is_active_student(p_classroom_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.enrollments e join public.profiles p on p.id=e.student_id
    where e.classroom_id=p_classroom_id and e.student_id=auth.uid() and e.active
      and p.role='student' and p.consent_status='verified');
$$;
create function private.can_read_profile(p_student_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (p_student_id=auth.uid() or exists(
    select 1 from public.enrollments e join public.classrooms c on c.id=e.classroom_id
    join public.profiles p on p.id=c.teacher_id
    where e.student_id=p_student_id and e.active and c.teacher_id=auth.uid() and p.role='teacher'));
$$;
create function private.can_read_submission(p_submission_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.submissions s join public.assignments a on a.id=s.assignment_id
    where s.id=p_submission_id and (s.student_id=auth.uid() or private.is_teacher(a.classroom_id)));
$$;
revoke all on function private.is_teacher(uuid),private.is_active_student(uuid),private.can_read_profile(uuid),private.can_read_submission(uuid) from public;
grant execute on function private.is_teacher(uuid),private.is_active_student(uuid),private.can_read_profile(uuid),private.can_read_submission(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.classrooms enable row level security;
alter table public.enrollments enable row level security;
alter table public.missions enable row level security;
alter table public.assignments enable row level security;
alter table public.drafts enable row level security;
alter table public.submissions enable row level security;
alter table public.feedback enable row level security;
alter table public.badges enable row level security;
alter table public.contests enable row level security;
alter table public.entries enable row level security;
alter table public.reviews enable row level security;
alter table public.audit_events enable row level security;
revoke all on public.profiles,public.classrooms,public.enrollments,public.missions,public.assignments,public.drafts,public.submissions,public.feedback,public.badges,public.contests,public.entries,public.reviews,public.audit_events from anon,authenticated;
grant select on public.profiles,public.classrooms,public.enrollments,public.missions,public.assignments,public.drafts,public.submissions,public.feedback,public.badges,public.contests,public.entries,public.reviews,public.audit_events to authenticated;
grant all on public.profiles,public.classrooms,public.enrollments,public.missions,public.assignments,public.drafts,public.submissions,public.feedback,public.badges,public.contests,public.entries,public.reviews,public.audit_events to service_role;
create policy profiles_read on public.profiles for select to authenticated using(private.can_read_profile(id));
create policy classrooms_read on public.classrooms for select to authenticated using(private.is_teacher(id) or private.is_active_student(id));
create policy enrollments_read on public.enrollments for select to authenticated using(student_id=(select auth.uid()) or private.is_teacher(classroom_id));
create policy missions_read on public.missions for select to authenticated using(true);
create policy assignments_read on public.assignments for select to authenticated using(private.is_teacher(classroom_id) or private.is_active_student(classroom_id));
create policy drafts_read on public.drafts for select to authenticated using(student_id=(select auth.uid()));
create policy submissions_read on public.submissions for select to authenticated using(private.can_read_submission(id));
create policy feedback_read on public.feedback for select to authenticated using(private.can_read_submission(submission_id));
create policy badges_read on public.badges for select to authenticated using(private.can_read_profile(student_id));
create policy contests_read on public.contests for select to authenticated using(private.is_teacher(classroom_id) or private.is_active_student(classroom_id));
create policy entries_read on public.entries for select to authenticated using(student_id=(select auth.uid()) or exists(select 1 from public.contests c where c.id=contest_id and private.is_teacher(c.classroom_id)));
create policy reviews_read on public.reviews for select to authenticated using(exists(
  select 1 from public.entries e join public.contests c on c.id=e.contest_id
  where e.id=entry_id and (private.is_teacher(c.classroom_id) or (e.student_id=(select auth.uid()) and c.status='published'))));
create policy audit_read on public.audit_events for select to authenticated using(private.is_teacher(classroom_id));

-- Database guards also protect snapshots from accidental privileged application writes.
create function private.protect_submission() returns trigger language plpgsql set search_path='' as $$
begin
  if (new.id,new.assignment_id,new.student_id,new.title,new.body,new.version,new.request_id,new.created_at,new.is_late)
    is distinct from (old.id,old.assignment_id,old.student_id,old.title,old.body,old.version,old.request_id,old.created_at,old.is_late) then
    raise exception 'BF_IMMUTABLE_SUBMISSION';
  end if;
  if new.status<>old.status and not(old.status='submitted' and new.status in ('revision_requested','completed')) then
    raise exception 'BF_INVALID_TRANSITION';
  end if;
  return new;
end;
$$;
create trigger submission_immutable before update on public.submissions for each row execute function private.protect_submission();
create function private.protect_snapshot() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'BF_IMMUTABLE_SNAPSHOT'; end;
$$;
create trigger entry_immutable before update on public.entries for each row execute function private.protect_snapshot();
create trigger assignment_immutable before update on public.assignments for each row execute function private.protect_snapshot();
create trigger feedback_immutable before update on public.feedback for each row execute function private.protect_snapshot();
create trigger review_immutable before update on public.reviews for each row execute function private.protect_snapshot();
revoke all on function private.protect_submission(),private.protect_snapshot() from public;

create function public.create_classroom(p_name text) returns public.classrooms
language plpgsql security definer set search_path='' as $$
declare v_result public.classrooms;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='teacher') then raise exception 'BF_FORBIDDEN'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'BF_INVALID_INPUT'; end if;
  insert into public.classrooms(name,teacher_id) values(btrim(p_name),auth.uid()) returning * into v_result;
  insert into public.audit_events(actor_id,classroom_id,event_type,entity_id) values(auth.uid(),v_result.id,'classroom_created',v_result.id);
  return v_result;
end;
$$;
create function public.assign_mission(p_classroom_id uuid,p_mission_id uuid,p_due_at timestamptz default null) returns public.assignments
language plpgsql security definer set search_path='' as $$
declare v_result public.assignments; v_mission public.missions;
begin
  if not private.is_teacher(p_classroom_id) then raise exception 'BF_FORBIDDEN'; end if;
  select * into v_mission from public.missions where id=p_mission_id;
  if not found then raise exception 'BF_NOT_FOUND'; end if;
  if p_due_at is not null and p_due_at<=clock_timestamp() then raise exception 'BF_INVALID_DEADLINE'; end if;
  insert into public.assignments(classroom_id,mission_id,mission_snapshot,due_at)
  values(p_classroom_id,p_mission_id,to_jsonb(v_mission),p_due_at) returning * into v_result;
  insert into public.audit_events(actor_id,classroom_id,event_type,entity_id) values(auth.uid(),p_classroom_id,'mission_assigned',v_result.id);
  return v_result;
end;
$$;
create function public.save_draft(p_assignment_id uuid,p_title text,p_body text,p_expected_revision integer) returns public.drafts
language plpgsql security definer set search_path='' as $$
declare v_assignment public.assignments; v_draft public.drafts;
begin
  if auth.uid() is null then raise exception 'BF_UNAUTHENTICATED'; end if;
  perform 1 from public.profiles where id=auth.uid() for update;
  select * into v_assignment from public.assignments where id=p_assignment_id;
  if not found or not private.is_active_student(v_assignment.classroom_id) then raise exception 'BF_FORBIDDEN'; end if;
  if p_title is null or p_body is null or char_length(p_title)>100 or char_length(p_body)>10000 or p_expected_revision is null or p_expected_revision<0 then raise exception 'BF_INVALID_INPUT'; end if;
  select * into v_draft from public.drafts where assignment_id=p_assignment_id and student_id=auth.uid() for update;
  if found then
    if v_draft.revision<>p_expected_revision then raise exception 'BF_DRAFT_CONFLICT'; end if;
    update public.drafts set title=p_title,body=p_body,revision=revision+1,updated_at=clock_timestamp() where id=v_draft.id returning * into v_draft;
  else
    if p_expected_revision<>0 then raise exception 'BF_DRAFT_CONFLICT'; end if;
    insert into public.drafts(assignment_id,student_id,title,body) values(p_assignment_id,auth.uid(),p_title,p_body) returning * into v_draft;
  end if;
  return v_draft;
end;
$$;
create function public.submit_work(p_assignment_id uuid,p_title text,p_body text,p_request_id uuid) returns public.submissions
language plpgsql security definer set search_path='' as $$
declare v_assignment public.assignments; v_result public.submissions; v_latest public.submissions; v_accepted_at timestamptz;
begin
  if auth.uid() is null then raise exception 'BF_UNAUTHENTICATED'; end if;
  if p_assignment_id is null or p_request_id is null or p_title is null or p_body is null or char_length(btrim(p_title))<1 or char_length(p_title)>100 or char_length(btrim(p_body))<1 or char_length(p_body)>10000 then raise exception 'BF_INVALID_INPUT'; end if;
  perform 1 from public.profiles where id=auth.uid() for update;
  select * into v_result from public.submissions where student_id=auth.uid() and request_id=p_request_id;
  if found then
    if v_result.assignment_id<>p_assignment_id or v_result.title<>p_title or v_result.body<>p_body then raise exception 'BF_IDEMPOTENCY_CONFLICT'; end if;
    return v_result;
  end if;
  select * into v_assignment from public.assignments where id=p_assignment_id;
  if not found or not private.is_active_student(v_assignment.classroom_id) then raise exception 'BF_FORBIDDEN'; end if;
  -- Classroom learning continues after its target date; contests use a hard deadline.
  v_accepted_at := clock_timestamp();
  select * into v_latest from public.submissions where assignment_id=p_assignment_id and student_id=auth.uid() order by version desc limit 1 for update;
  if found and v_latest.status not in ('revision_requested','completed') then raise exception 'BF_REVISION_NOT_REQUESTED'; end if;
  if v_latest.id is not null and p_title=v_latest.title and p_body=v_latest.body then raise exception 'BF_REVISION_UNCHANGED'; end if;
  insert into public.submissions(assignment_id,student_id,title,body,version,request_id,created_at,is_late)
  values(p_assignment_id,auth.uid(),p_title,p_body,coalesce(v_latest.version,0)+1,p_request_id,v_accepted_at,
    v_assignment.due_at is not null and v_accepted_at>=v_assignment.due_at) returning * into v_result;
  insert into public.audit_events(actor_id,classroom_id,event_type,entity_id) values(auth.uid(),v_assignment.classroom_id,'work_submitted',v_result.id);
  return v_result;
end;
$$;
create function public.review_work(p_submission_id uuid,p_body text,p_decision text) returns public.submissions
language plpgsql security definer set search_path='' as $$
declare v_result public.submissions; v_assignment public.assignments; v_feedback public.feedback;
begin
  if p_body is null or char_length(btrim(p_body))<1 or char_length(p_body)>2000 or p_decision is null or p_decision not in ('revision_requested','completed') then raise exception 'BF_INVALID_INPUT'; end if;
  select * into v_result from public.submissions where id=p_submission_id;
  if not found then raise exception 'BF_FORBIDDEN'; end if;
  select * into v_assignment from public.assignments where id=v_result.assignment_id;
  if not private.is_teacher(v_assignment.classroom_id) then raise exception 'BF_FORBIDDEN'; end if;
  -- Same lock as student submissions prevents a stale review racing a revision.
  perform 1 from public.profiles where id=v_result.student_id for update;
  select * into v_result from public.submissions where id=p_submission_id for update;
  if exists(select 1 from public.submissions where assignment_id=v_result.assignment_id and student_id=v_result.student_id and version>v_result.version) then raise exception 'BF_STALE_SUBMISSION'; end if;
  select * into v_feedback from public.feedback where submission_id=p_submission_id;
  if found then
    if v_feedback.body=p_body and v_feedback.decision=p_decision and v_feedback.teacher_id=auth.uid() then return v_result; end if;
    raise exception 'BF_ALREADY_REVIEWED';
  end if;
  if v_result.status<>'submitted' then raise exception 'BF_INVALID_TRANSITION'; end if;
  if p_decision='completed' and coalesce((v_assignment.mission_snapshot->>'requires_revision')::boolean,false)
    and not exists(select 1 from public.submissions where assignment_id=v_result.assignment_id and student_id=v_result.student_id and version<v_result.version and status='revision_requested') then raise exception 'BF_REVISION_REQUIRED'; end if;
  insert into public.feedback(submission_id,teacher_id,body,decision) values(p_submission_id,auth.uid(),p_body,p_decision);
  update public.submissions set status=p_decision where id=p_submission_id returning * into v_result;
  if p_decision='completed' then
    insert into public.badges(student_id,code,source_submission_id) values(v_result.student_id,'first_mission',v_result.id) on conflict(student_id,code) do nothing;
    if v_result.version>1 then insert into public.badges(student_id,code,source_submission_id) values(v_result.student_id,'first_revision',v_result.id) on conflict(student_id,code) do nothing; end if;
    if (select count(distinct a.mission_snapshot->>'theme') from public.submissions s join public.assignments a on a.id=s.assignment_id
      where s.student_id=v_result.student_id and s.status='completed' and a.mission_snapshot->>'theme' in ('courage','empathy','fairness'))=3 then
      insert into public.badges(student_id,code,source_submission_id) values(v_result.student_id,'three_themes',v_result.id) on conflict(student_id,code) do nothing;
    end if;
  end if;
  insert into public.audit_events(actor_id,classroom_id,event_type,entity_id,detail) values(auth.uid(),v_assignment.classroom_id,'work_reviewed',v_result.id,jsonb_build_object('decision',p_decision));
  return v_result;
end;
$$;
create function public.create_contest(p_classroom_id uuid,p_title text,p_description text,p_opens_at timestamptz,p_closes_at timestamptz) returns public.contests
language plpgsql security definer set search_path='' as $$
declare v_result public.contests;
begin
  if not private.is_teacher(p_classroom_id) then raise exception 'BF_FORBIDDEN'; end if;
  if p_title is null or char_length(btrim(p_title))<1 or char_length(p_title)>100 or p_description is null or char_length(p_description)>4000
    or p_opens_at is null or p_closes_at is null or p_closes_at<=p_opens_at or p_closes_at<=clock_timestamp() then raise exception 'BF_INVALID_INPUT'; end if;
  insert into public.contests(classroom_id,title,description,opens_at,closes_at) values(p_classroom_id,p_title,p_description,p_opens_at,p_closes_at) returning * into v_result;
  insert into public.audit_events(actor_id,classroom_id,event_type,entity_id) values(auth.uid(),p_classroom_id,'contest_created',v_result.id);
  return v_result;
end;
$$;
create function public.enter_contest(p_contest_id uuid,p_submission_id uuid,p_request_id uuid) returns public.entries
language plpgsql security definer set search_path='' as $$
declare v_contest public.contests; v_submission public.submissions; v_assignment public.assignments; v_result public.entries; v_accepted_at timestamptz;
begin
  if auth.uid() is null then raise exception 'BF_UNAUTHENTICATED'; end if;
  if p_request_id is null or p_contest_id is null or p_submission_id is null then raise exception 'BF_INVALID_INPUT'; end if;
  perform 1 from public.profiles where id=auth.uid() for update;
  select * into v_result from public.entries where student_id=auth.uid() and request_id=p_request_id;
  if found then
    if v_result.contest_id<>p_contest_id or v_result.submission_id<>p_submission_id then raise exception 'BF_IDEMPOTENCY_CONFLICT'; end if;
    return v_result;
  end if;
  select * into v_contest from public.contests where id=p_contest_id for update;
  if not found or not private.is_active_student(v_contest.classroom_id) then raise exception 'BF_FORBIDDEN'; end if;
  v_accepted_at := clock_timestamp();
  if v_contest.status<>'open' or v_accepted_at>=v_contest.closes_at then raise exception 'BF_CONTEST_CLOSED'; end if;
  if v_accepted_at<v_contest.opens_at then raise exception 'BF_CONTEST_NOT_OPEN'; end if;
  if exists(select 1 from public.entries where contest_id=p_contest_id and student_id=auth.uid()) then raise exception 'BF_ALREADY_ENTERED'; end if;
  select * into v_submission from public.submissions where id=p_submission_id and student_id=auth.uid();
  if not found or v_submission.status<>'completed' then raise exception 'BF_COMPLETED_WORK_REQUIRED'; end if;
  select * into v_assignment from public.assignments where id=v_submission.assignment_id;
  if v_assignment.classroom_id<>v_contest.classroom_id then raise exception 'BF_FORBIDDEN'; end if;
  insert into public.entries(contest_id,student_id,submission_id,title,body,request_id,created_at)
  values(p_contest_id,auth.uid(),p_submission_id,v_submission.title,v_submission.body,p_request_id,v_accepted_at) returning * into v_result;
  insert into public.audit_events(actor_id,classroom_id,event_type,entity_id) values(auth.uid(),v_contest.classroom_id,'contest_entered',v_result.id);
  return v_result;
end;
$$;
create function public.submit_review(p_entry_id uuid,p_scores jsonb,p_comment text) returns public.reviews
language plpgsql security definer set search_path='' as $$
declare v_entry public.entries; v_contest public.contests; v_result public.reviews; v_key text; v_max integer;
begin
  select * into v_entry from public.entries where id=p_entry_id;
  if not found then raise exception 'BF_FORBIDDEN'; end if;
  select * into v_contest from public.contests where id=v_entry.contest_id for update;
  if not private.is_teacher(v_contest.classroom_id) then raise exception 'BF_FORBIDDEN'; end if;
  if p_comment is null or char_length(btrim(p_comment))<1 or char_length(p_comment)>2000 or p_scores is null or jsonb_typeof(p_scores)<>'object' then raise exception 'BF_INVALID_INPUT'; end if;
  if (select count(*) from jsonb_object_keys(p_scores))<>4 then raise exception 'BF_INVALID_SCORES'; end if;
  for v_key,v_max in select * from (values('thought',30),('evidence',30),('structure',25),('expression',15)) as r(k,m) loop
    if not(p_scores ? v_key) or jsonb_typeof(p_scores->v_key)<>'number' or (p_scores->>v_key)::numeric<>trunc((p_scores->>v_key)::numeric) or (p_scores->>v_key)::numeric not between 0 and v_max then raise exception 'BF_INVALID_SCORES'; end if;
  end loop;
  select * into v_result from public.reviews where entry_id=p_entry_id;
  if found then
    if v_result.scores=p_scores and v_result.comment=p_comment and v_result.teacher_id=auth.uid() then return v_result; end if;
    raise exception 'BF_ALREADY_REVIEWED';
  end if;
  if v_contest.status='published' then raise exception 'BF_RESULTS_PUBLISHED'; end if;
  if clock_timestamp()<v_contest.closes_at then raise exception 'BF_CONTEST_STILL_OPEN'; end if;
  update public.contests set status='reviewing' where id=v_contest.id and status='open';
  insert into public.reviews(entry_id,teacher_id,scores,comment) values(p_entry_id,auth.uid(),p_scores,p_comment) returning * into v_result;
  insert into public.audit_events(actor_id,classroom_id,event_type,entity_id) values(auth.uid(),v_contest.classroom_id,'contest_reviewed',v_entry.id);
  return v_result;
end;
$$;
create function public.publish_contest(p_contest_id uuid) returns public.contests
language plpgsql security definer set search_path='' as $$
declare v_result public.contests;
begin
  select * into v_result from public.contests where id=p_contest_id for update;
  if not found or not private.is_teacher(v_result.classroom_id) then raise exception 'BF_FORBIDDEN'; end if;
  if v_result.status='published' then return v_result; end if;
  if clock_timestamp()<v_result.closes_at then raise exception 'BF_CONTEST_STILL_OPEN'; end if;
  if not exists(select 1 from public.entries where contest_id=p_contest_id) then raise exception 'BF_NO_ENTRIES'; end if;
  if exists(select 1 from public.entries e where e.contest_id=p_contest_id and not exists(select 1 from public.reviews r where r.entry_id=e.id)) then raise exception 'BF_REVIEWS_INCOMPLETE'; end if;
  update public.contests set status='published' where id=p_contest_id returning * into v_result;
  insert into public.audit_events(actor_id,classroom_id,event_type,entity_id) values(auth.uid(),v_result.classroom_id,'contest_published',v_result.id);
  return v_result;
end;
$$;

-- Explicit opt-in execution: PostgreSQL's default PUBLIC execute is removed.
revoke all on function public.create_classroom(text),public.assign_mission(uuid,uuid,timestamptz),public.save_draft(uuid,text,text,integer),public.submit_work(uuid,text,text,uuid),public.review_work(uuid,text,text),public.create_contest(uuid,text,text,timestamptz,timestamptz),public.enter_contest(uuid,uuid,uuid),public.submit_review(uuid,jsonb,text),public.publish_contest(uuid) from public,anon;
grant execute on function public.create_classroom(text),public.assign_mission(uuid,uuid,timestamptz),public.save_draft(uuid,text,text,integer),public.submit_work(uuid,text,text,uuid),public.review_work(uuid,text,text),public.create_contest(uuid,text,text,timestamptz,timestamptz),public.enter_contest(uuid,uuid,uuid),public.submit_review(uuid,jsonb,text),public.publish_contest(uuid) to authenticated;
