-- Learning hub. All mutations are authenticated, transactional and replay-safe.
create table public.grade_groups (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 80),
 owner_id uuid not null references public.profiles(id), join_code uuid not null unique default gen_random_uuid(), created_at timestamptz not null default now()
);
create index grade_groups_owner_idx on public.grade_groups(owner_id);
create table public.grade_members (
 group_id uuid not null references public.grade_groups(id), classroom_id uuid not null references public.classrooms(id),
 approved boolean not null default false, created_at timestamptz not null default now(), primary key(group_id,classroom_id)
);
create index grade_members_class_idx on public.grade_members(classroom_id);
create table public.class_invites (
 classroom_id uuid primary key references public.classrooms(id), code uuid not null unique default gen_random_uuid(), created_at timestamptz not null default now()
);
create table public.enrollment_requests (
 id uuid primary key default gen_random_uuid(), classroom_id uuid not null references public.classrooms(id),
 student_id uuid not null references public.profiles(id), display_name text not null, status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(), unique(classroom_id,student_id)
);
create index enrollment_requests_student_idx on public.enrollment_requests(student_id);
create table public.reading_logs (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id), classroom_id uuid not null references public.classrooms(id),
 book jsonb not null check(jsonb_typeof(book)='object' and length(book->>'title') between 1 and 200),
 read_on date not null, status text not null check(status in ('reading','completed')), thought text not null check(length(thought) between 1 and 10000),
 question text not null default '' check(length(question)<=2000), revision integer not null default 1 check(revision>0),
 verified_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index reading_logs_student_idx on public.reading_logs(student_id,read_on desc);
create index reading_logs_class_idx on public.reading_logs(classroom_id,created_at desc);
create table public.character_profiles (
 student_id uuid primary key references public.profiles(id), nickname text not null check(length(nickname) between 1 and 30),
 species text not null default 'rabbit' check(species in ('rabbit','fox','owl')), created_at timestamptz not null default now()
);
create table public.class_economy (
 classroom_id uuid primary key references public.classrooms(id), currency_name text not null default '책잎' check(length(currency_name) between 1 and 12),
 reward_rules jsonb not null default '{"reading":{"xp":20,"coins":5},"mission":{"xp":30,"coins":10},"revision":{"xp":20,"coins":5},"festival":{"xp":10,"coins":2},"attendance":{"xp":5,"coins":0}}',
 created_at timestamptz not null default now()
);
create table public.activity_events (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id), classroom_id uuid not null references public.classrooms(id),
 kind text not null check(kind in ('reading','mission','revision','festival','attendance')), source_key text not null,
 xp integer not null check(xp between 0 and 1000), coins integer not null check(coins between 0 and 100),
 created_at timestamptz not null default now(), unique(student_id,kind,source_key)
);
create index activity_events_class_idx on public.activity_events(classroom_id,created_at desc);
create table public.achievement_badges (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id), classroom_id uuid not null references public.classrooms(id),
 code text not null check(code in ('reader_5','mission_5','attendance_5','revision_1','reading_king','mission_king','attendance_king')),
 period_key text not null default 'all', evidence_count integer not null check(evidence_count>0), created_at timestamptz not null default now(),
 unique(student_id,classroom_id,code,period_key)
);
create index achievement_badges_class_idx on public.achievement_badges(classroom_id);
create table public.shop_items (
 id uuid primary key default gen_random_uuid(), classroom_id uuid not null references public.classrooms(id), name text not null check(length(name) between 1 and 80),
 price integer not null check(price between 1 and 100000), stock integer not null check(stock between 0 and 10000),
 kind text not null default 'privilege' check(kind in ('privilege','decoration')), active boolean not null default true, created_at timestamptz not null default now()
);
create index shop_items_class_idx on public.shop_items(classroom_id);
create table public.shop_orders (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id), classroom_id uuid not null references public.classrooms(id),
 item_id uuid not null references public.shop_items(id), item_name text not null, kind text not null, price integer not null check(price>0),
 status text not null default 'pending' check(status in ('pending','fulfilled','cancelled')), created_at timestamptz not null default now()
);
create index shop_orders_student_idx on public.shop_orders(student_id);
create index shop_orders_class_idx on public.shop_orders(classroom_id);
create index shop_orders_item_idx on public.shop_orders(item_id);
create table public.economy_ledger (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id), classroom_id uuid not null references public.classrooms(id),
 amount integer not null check(amount between -100000 and 100000 and amount<>0), reason text not null check(length(reason) between 1 and 200),
 source_key text not null, actor_id uuid references public.profiles(id), created_at timestamptz not null default now(),
 unique(student_id,classroom_id,source_key)
);
create index economy_ledger_student_idx on public.economy_ledger(student_id,classroom_id,created_at desc);
create index economy_ledger_class_idx on public.economy_ledger(classroom_id);
create index economy_ledger_actor_idx on public.economy_ledger(actor_id);
create table public.plaza_posts (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id), classroom_id uuid not null references public.classrooms(id),
 group_id uuid references public.grade_groups(id), submission_id uuid not null references public.submissions(id), title text not null, body text not null,
 pen_name text not null, status text not null default 'pending' check(status in ('pending','published','withdrawn')),
 created_at timestamptz not null default now(), unique(student_id,submission_id)
);
create index plaza_posts_class_idx on public.plaza_posts(classroom_id);
create index plaza_posts_group_idx on public.plaza_posts(group_id);
create index plaza_posts_submission_idx on public.plaza_posts(submission_id);
create table public.plaza_reactions (
 post_id uuid not null references public.plaza_posts(id), student_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('empathy','discovery')), created_at timestamptz not null default now(), primary key(post_id,student_id)
);
create index plaza_reactions_student_idx on public.plaza_reactions(student_id);
create table private.hub_requests (
 actor_id uuid not null references public.profiles(id), request_id uuid not null, command text not null, payload jsonb not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(actor_id,request_id)
);
alter table public.contests add column group_id uuid references public.grade_groups(id);
create index contests_group_idx on public.contests(group_id);

create function private.in_grade(p_group uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.grade_groups g where g.id=p_group and
 (g.owner_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher') or exists(
 select 1 from public.grade_members m where m.group_id=g.id and m.approved and (private.is_teacher(m.classroom_id) or private.is_active_student(m.classroom_id)))))
$$;
create function private.grade_teacher(p_group uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher') and
 exists(select 1 from public.grade_groups g where g.id=p_group and (g.owner_id=auth.uid() or exists(
 select 1 from public.grade_members m where m.group_id=g.id and m.approved and private.is_teacher(m.classroom_id))))
$$;
create function private.plaza_visible(p_post uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.plaza_posts p where p.id=p_post and
 (p.student_id=auth.uid() or private.is_teacher(p.classroom_id) or (p.status='published' and
 (case when p.group_id is null then private.is_active_student(p.classroom_id) else private.in_grade(p.group_id) end))))
$$;
create function private.festival_teacher(p_contest uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.contests c where c.id=p_contest and
 (private.is_teacher(c.classroom_id) or (c.group_id is not null and private.grade_teacher(c.group_id))))
$$;
revoke all on function private.in_grade(uuid),private.grade_teacher(uuid),private.plaza_visible(uuid),private.festival_teacher(uuid) from public;
grant execute on function private.in_grade(uuid),private.grade_teacher(uuid),private.plaza_visible(uuid),private.festival_teacher(uuid) to authenticated;

do $$ declare t text; begin
 foreach t in array array['grade_groups','grade_members','class_invites','enrollment_requests','reading_logs','character_profiles','class_economy','activity_events','achievement_badges','shop_items','shop_orders','economy_ledger','plaza_posts','plaza_reactions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create policy groups_read on public.grade_groups for select to authenticated using(private.in_grade(id));
-- Join codes are visible only to group teachers, never to student clients.
revoke select on public.grade_groups from authenticated;
grant select(id,name,owner_id,created_at) on public.grade_groups to authenticated;
create policy members_read on public.grade_members for select to authenticated using(private.in_grade(group_id) or private.is_teacher(classroom_id));
create policy invites_read on public.class_invites for select to authenticated using(private.is_teacher(classroom_id));
create policy enrollment_requests_read on public.enrollment_requests for select to authenticated using(student_id=auth.uid() or private.is_teacher(classroom_id));
create policy reading_logs_read on public.reading_logs for select to authenticated using(
 (student_id=auth.uid() and private.is_active_student(classroom_id)) or private.is_teacher(classroom_id));
create policy characters_read on public.character_profiles for select to authenticated using(student_id=auth.uid());
create policy economy_settings_read on public.class_economy for select to authenticated using(private.is_teacher(classroom_id) or private.is_active_student(classroom_id));
create policy activity_events_read on public.activity_events for select to authenticated using(
 (student_id=auth.uid() and private.is_active_student(classroom_id)) or private.is_teacher(classroom_id));
create policy achievements_read on public.achievement_badges for select to authenticated using(
 (student_id=auth.uid() and private.is_active_student(classroom_id)) or private.is_teacher(classroom_id));
create policy shop_items_read on public.shop_items for select to authenticated using(private.is_teacher(classroom_id) or private.is_active_student(classroom_id));
create policy shop_orders_read on public.shop_orders for select to authenticated using(
 (student_id=auth.uid() and private.is_active_student(classroom_id)) or private.is_teacher(classroom_id));
create policy ledger_read on public.economy_ledger for select to authenticated using(
 (student_id=auth.uid() and private.is_active_student(classroom_id)) or private.is_teacher(classroom_id));
create policy plaza_posts_read on public.plaza_posts for select to authenticated using(private.plaza_visible(id));
create policy reactions_read on public.plaza_reactions for select to authenticated using(private.plaza_visible(post_id));
drop policy contests_read on public.contests;
create policy contests_read on public.contests for select to authenticated using(private.is_teacher(classroom_id) or private.is_active_student(classroom_id) or (group_id is not null and private.in_grade(group_id)));
drop policy entries_read on public.entries;
create policy entries_read on public.entries for select to authenticated using(student_id=auth.uid() or private.festival_teacher(contest_id));
drop policy reviews_read on public.reviews;
create policy reviews_read on public.reviews for select to authenticated using(exists(select 1 from public.entries e join public.contests c on c.id=e.contest_id where e.id=entry_id and (private.festival_teacher(c.id) or e.student_id=auth.uid() and c.status='published')));

create function private.award_activity(p_student uuid,p_class uuid,p_kind text,p_source text) returns void
language plpgsql security definer set search_path='' as $$
declare e public.activity_events; rules jsonb; n integer; badge_code text;
begin
 perform 1 from public.profiles where id=p_student for update;
 insert into public.class_economy(classroom_id) values(p_class) on conflict do nothing;
 select reward_rules->p_kind into rules from public.class_economy where classroom_id=p_class;
 insert into public.activity_events(student_id,classroom_id,kind,source_key,xp,coins)
 values(p_student,p_class,p_kind,p_source,(rules->>'xp')::integer,(rules->>'coins')::integer)
 on conflict(student_id,kind,source_key) do nothing returning * into e;
 if not found then return; end if;
 if e.coins>0 then insert into public.economy_ledger(student_id,classroom_id,amount,reason,source_key)
 values(p_student,p_class,e.coins,'학습 활동 보상: '||p_kind,'event:'||e.id); end if;
 select count(*) into n from public.activity_events where student_id=p_student and classroom_id=p_class and kind=p_kind;
 badge_code:=case when p_kind='reading' and n>=5 then 'reader_5' when p_kind='mission' and n>=5 then 'mission_5'
 when p_kind='attendance' and n>=5 then 'attendance_5' when p_kind='revision' then 'revision_1' end;
 if badge_code is not null then insert into public.achievement_badges(student_id,classroom_id,code,evidence_count)
 values(p_student,p_class,badge_code,n) on conflict do nothing; end if;
end $$;
revoke all on function private.award_activity(uuid,uuid,text,text) from public,anon,authenticated;
create function private.hub_submission_reward() returns trigger language plpgsql security definer set search_path='' as $$
declare cls uuid;
begin
 if new.status='completed' and old.status<>'completed' then
 select classroom_id into cls from public.assignments where id=new.assignment_id;
 perform private.award_activity(new.student_id,cls,'mission',new.assignment_id::text);
 if new.version>1 and exists(select 1 from public.submissions s where s.student_id=new.student_id and s.assignment_id=new.assignment_id and s.version<new.version and s.status='revision_requested') then
 perform private.award_activity(new.student_id,cls,'revision',new.assignment_id::text); end if;
 end if; return new;
end $$;
create trigger hub_submission_reward after update on public.submissions for each row execute function private.hub_submission_reward();
create function private.hub_entry_reward() returns trigger language plpgsql security definer set search_path='' as $$
declare cls uuid; begin
 select a.classroom_id into cls from public.submissions s join public.assignments a on a.id=s.assignment_id where s.id=new.submission_id;
 perform private.award_activity(new.student_id,cls,'festival',new.contest_id::text); return new;
end $$;
create trigger hub_entry_reward after insert on public.entries for each row execute function private.hub_entry_reward();
revoke all on function private.hub_submission_reward(),private.hub_entry_reward() from public,anon,authenticated;

create function public.hub_command(p_command text,p_payload jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; replay private.hub_requests; result jsonb; cls uuid; target uuid; grp uuid;
 log public.reading_logs; item public.shop_items; ord public.shop_orders; post public.plaza_posts; sub public.submissions;
 balance bigint; n integer; k text; rules jsonb; delta integer; period text; start_at timestamptz; end_at timestamptz;
begin
 if auth.uid() is null then raise exception 'BF_UNAUTHENTICATED'; end if;
 if p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>50000 then raise exception 'BF_INVALID_INPUT'; end if;
 select * into actor from public.profiles where id=auth.uid() for update;
 if not found then raise exception 'BF_FORBIDDEN'; end if;
 if actor.role='student' and actor.consent_status<>'verified' and p_command<>'join_class' then raise exception 'BF_CONSENT_REQUIRED'; end if;
 select * into replay from private.hub_requests where actor_id=actor.id and request_id=p_request_id;
 if found then
 if replay.command<>p_command or replay.payload<>p_payload then raise exception 'BF_IDEMPOTENCY_CONFLICT'; end if;
 return replay.result; end if;
 cls:=nullif(p_payload->>'classroomId','')::uuid; target:=nullif(p_payload->>'id','')::uuid; grp:=nullif(p_payload->>'groupId','')::uuid;

 case p_command
 when 'reading_save' then
 if actor.role<>'student' or not private.is_active_student(cls) then raise exception 'BF_FORBIDDEN'; end if;
 if jsonb_typeof(p_payload->'book') is distinct from 'object' or coalesce(length(btrim(p_payload->'book'->>'title')),0) not between 1 and 200
 or length(coalesce(p_payload->'book'->>'author',''))>200 or length(coalesce(p_payload->'book'->>'publisher',''))>200
 or length(coalesce(p_payload->'book'->>'isbn',''))>40 or length(coalesce(p_payload->'book'->>'thumbnail',''))>1000
 or coalesce(p_payload->>'status','') not in ('reading','completed') or coalesce(length(btrim(p_payload->>'thought')),0) not between 1 and 10000
 or length(coalesce(p_payload->>'question',''))>2000 or nullif(p_payload->>'readOn','')::date is null
 or (p_payload->>'readOn')::date>(now() at time zone 'Asia/Seoul')::date then raise exception 'BF_INVALID_INPUT'; end if;
 if target is null then
 insert into public.reading_logs(student_id,classroom_id,book,read_on,status,thought,question)
 values(actor.id,cls,p_payload->'book',(p_payload->>'readOn')::date,p_payload->>'status',p_payload->>'thought',coalesce(p_payload->>'question','')) returning * into log;
 else
 select * into log from public.reading_logs where id=target for update;
 if not found or log.student_id<>actor.id or log.classroom_id<>cls then raise exception 'BF_FORBIDDEN'; end if;
 if log.verified_at is not null then raise exception 'BF_VERIFIED_IMMUTABLE'; end if;
 if (p_payload->>'revision')::integer is distinct from log.revision then raise exception 'BF_DRAFT_CONFLICT'; end if;
 update public.reading_logs set book=p_payload->'book',read_on=(p_payload->>'readOn')::date,status=p_payload->>'status',thought=p_payload->>'thought',
 question=coalesce(p_payload->>'question',''),revision=revision+1,updated_at=now() where id=target returning * into log;
 end if; result:=to_jsonb(log);
 when 'reading_verify' then
 select * into log from public.reading_logs where id=target for update;
 if not found or not private.is_teacher(log.classroom_id) or log.status<>'completed' then raise exception 'BF_FORBIDDEN'; end if;
 if not exists(select 1 from public.profiles where id=log.student_id and consent_status='verified') then raise exception 'BF_CONSENT_REQUIRED'; end if;
 update public.reading_logs set verified_at=coalesce(verified_at,now()) where id=target returning * into log;
 perform private.award_activity(log.student_id,log.classroom_id,'reading',log.id::text); result:=to_jsonb(log);
 when 'attendance' then
 if actor.role<>'student' or not private.is_active_student(cls) then raise exception 'BF_FORBIDDEN'; end if;
 perform private.award_activity(actor.id,cls,'attendance',(now() at time zone 'Asia/Seoul')::date::text); result:=jsonb_build_object('checked',true);
 when 'character_save' then
 if actor.role<>'student' or coalesce(length(btrim(p_payload->>'nickname')),0) not between 1 and 30 or coalesce(p_payload->>'species','') not in ('rabbit','fox','owl') then raise exception 'BF_INVALID_INPUT'; end if;
 insert into public.character_profiles(student_id,nickname,species) values(actor.id,btrim(p_payload->>'nickname'),p_payload->>'species')
 on conflict(student_id) do update set nickname=excluded.nickname,species=excluded.species returning to_jsonb(character_profiles.*) into result;
 when 'invite_create' then
 if not private.is_teacher(cls) then raise exception 'BF_FORBIDDEN'; end if;
 insert into public.class_invites(classroom_id) values(cls) on conflict(classroom_id) do update set code=gen_random_uuid() returning to_jsonb(class_invites.*) into result;
 when 'join_class' then
 if actor.role<>'student' then raise exception 'BF_FORBIDDEN'; end if;
 select classroom_id into cls from public.class_invites where code=(p_payload->>'code')::uuid;
 if not found then raise exception 'BF_INVITE_NOT_FOUND'; end if;
 insert into public.enrollment_requests(classroom_id,student_id,display_name) values(cls,actor.id,actor.display_name)
 on conflict(classroom_id,student_id) do update set status=case when enrollment_requests.status='approved' then 'approved' else 'pending' end
 returning to_jsonb(enrollment_requests.*) into result;
 when 'enrollment_decide' then
 select classroom_id,student_id into cls,target from public.enrollment_requests where id=target;
 if not found or not private.is_teacher(cls) or coalesce(p_payload->>'decision','') not in ('approved','rejected') then raise exception 'BF_FORBIDDEN'; end if;
 if p_payload->>'decision'='approved' then
 if not exists(select 1 from public.profiles where id=target and role='student' and consent_status='verified') then raise exception 'BF_CONSENT_REQUIRED'; end if;
 insert into public.enrollments(classroom_id,student_id,active) values(cls,target,true) on conflict(classroom_id,student_id) do update set active=true;
 end if;
 update public.enrollment_requests set status=p_payload->>'decision' where id=(p_payload->>'id')::uuid returning to_jsonb(enrollment_requests.*) into result;
 when 'enrollment_pause' then
 if not private.is_teacher(cls) then raise exception 'BF_FORBIDDEN'; end if;
 update public.enrollments set active=false where classroom_id=cls and student_id=target;
 result:=jsonb_build_object('paused',true);
 when 'group_create' then
 if not private.is_teacher(cls) or coalesce(length(btrim(p_payload->>'name')),0) not between 2 and 80 then raise exception 'BF_FORBIDDEN'; end if;
 insert into public.grade_groups(name,owner_id) values(btrim(p_payload->>'name'),actor.id) returning id,to_jsonb(grade_groups.*) into grp,result;
 insert into public.grade_members(group_id,classroom_id,approved) values(grp,cls,true);
 when 'group_join' then
 if not private.is_teacher(cls) then raise exception 'BF_FORBIDDEN'; end if;
 select id into grp from public.grade_groups where join_code=(p_payload->>'code')::uuid;
 if not found then raise exception 'BF_INVITE_NOT_FOUND'; end if;
 insert into public.grade_members(group_id,classroom_id) values(grp,cls) on conflict do nothing;
 result:=jsonb_build_object('requested',true);
 when 'group_approve' then
 if not exists(select 1 from public.grade_groups where id=grp and owner_id=actor.id) then raise exception 'BF_FORBIDDEN'; end if;
 update public.grade_members set approved=true where group_id=grp and classroom_id=cls returning to_jsonb(grade_members.*) into result;
 when 'group_code' then
 if not private.grade_teacher(grp) then raise exception 'BF_FORBIDDEN'; end if;
 select jsonb_build_object('code',join_code) into result from public.grade_groups where id=grp;
 when 'festival_create' then
 if not private.is_teacher(cls) or grp is not null and not exists(select 1 from public.grade_members where group_id=grp and classroom_id=cls and approved) then raise exception 'BF_FORBIDDEN'; end if;
 if coalesce(length(btrim(p_payload->>'title')),0) not between 2 and 100 or coalesce(length(btrim(p_payload->>'description')),0) not between 1 and 3000
 or nullif(p_payload->>'opensAt','')::timestamptz is null or nullif(p_payload->>'closesAt','')::timestamptz is null then raise exception 'BF_INVALID_INPUT'; end if;
 insert into public.contests(classroom_id,group_id,title,description,opens_at,closes_at)
 values(cls,grp,btrim(p_payload->>'title'),p_payload->>'description',(p_payload->>'opensAt')::timestamptz,(p_payload->>'closesAt')::timestamptz) returning to_jsonb(contests.*) into result;
 when 'plaza_share' then
 select s.* into sub from public.submissions s join public.assignments a on a.id=s.assignment_id where s.id=target and s.student_id=actor.id and s.status='completed' and private.is_active_student(a.classroom_id);
 if not found then raise exception 'BF_FORBIDDEN'; end if;
 select classroom_id into cls from public.assignments where id=sub.assignment_id;
 if grp is not null and not exists(select 1 from public.grade_members where group_id=grp and classroom_id=cls and approved) then raise exception 'BF_FORBIDDEN'; end if;
 if p_payload->>'consent' is distinct from 'true' then raise exception 'BF_EXPLICIT_SHARE_REQUIRED'; end if;
 insert into public.plaza_posts(student_id,classroom_id,group_id,submission_id,title,body,pen_name)
 values(actor.id,cls,grp,sub.id,sub.title,sub.body,coalesce((select nickname from public.character_profiles where student_id=actor.id),'책숲 작가'))
 on conflict(student_id,submission_id) do update set status='pending',group_id=excluded.group_id returning to_jsonb(plaza_posts.*) into result;
 when 'plaza_moderate' then
 select * into post from public.plaza_posts where id=target for update;
 if not found or coalesce(p_payload->>'status','') not in ('published','withdrawn') then raise exception 'BF_FORBIDDEN'; end if;
 if p_payload->>'status'='published' then
 if not private.is_teacher(post.classroom_id) or post.status<>'pending' then raise exception 'BF_FORBIDDEN'; end if;
 if not exists(select 1 from public.profiles where id=post.student_id and consent_status='verified') then raise exception 'BF_CONSENT_REQUIRED'; end if;
 elsif post.student_id<>actor.id and not private.is_teacher(post.classroom_id) then raise exception 'BF_FORBIDDEN'; end if;
 update public.plaza_posts set status=p_payload->>'status' where id=target returning to_jsonb(plaza_posts.*) into result;
 when 'plaza_react' then
 if actor.role<>'student' or not private.plaza_visible(target) or not exists(select 1 from public.plaza_posts where id=target and status='published') then raise exception 'BF_FORBIDDEN'; end if;
 if coalesce(p_payload->>'kind','') not in ('empathy','discovery') then raise exception 'BF_INVALID_INPUT'; end if;
 insert into public.plaza_reactions(post_id,student_id,kind) values(target,actor.id,p_payload->>'kind') on conflict(post_id,student_id) do update set kind=excluded.kind returning to_jsonb(plaza_reactions.*) into result;
 when 'shop_create' then
 if not private.is_teacher(cls) then raise exception 'BF_FORBIDDEN'; end if;
 insert into public.shop_items(classroom_id,name,price,stock,kind) values(cls,btrim(p_payload->>'name'),(p_payload->>'price')::integer,(p_payload->>'stock')::integer,p_payload->>'kind') returning to_jsonb(shop_items.*) into result;
 when 'shop_toggle' then
 select * into item from public.shop_items where id=target for update;
 if not found or not private.is_teacher(item.classroom_id) then raise exception 'BF_FORBIDDEN'; end if;
 update public.shop_items set active=not active where id=target returning to_jsonb(shop_items.*) into result;
 when 'shop_buy' then
 select * into item from public.shop_items where id=target for update;
 if not found or actor.role<>'student' or not private.is_active_student(item.classroom_id) or not item.active or item.stock<1 then raise exception 'BF_SHOP_UNAVAILABLE'; end if;
 select coalesce(sum(amount),0) into balance from public.economy_ledger where student_id=actor.id and classroom_id=item.classroom_id;
 if balance<item.price then raise exception 'BF_INSUFFICIENT_BALANCE'; end if;
 insert into public.shop_orders(student_id,classroom_id,item_id,item_name,kind,price) values(actor.id,item.classroom_id,item.id,item.name,item.kind,item.price) returning * into ord;
 insert into public.economy_ledger(student_id,classroom_id,amount,reason,source_key,actor_id) values(actor.id,item.classroom_id,-item.price,'구매 예약: '||item.name,'purchase:'||ord.id,actor.id);
 update public.shop_items set stock=stock-1 where id=item.id; result:=to_jsonb(ord);
 when 'order_decide' then
 select * into ord from public.shop_orders where id=target for update;
 if not found or not private.is_teacher(ord.classroom_id) or coalesce(p_payload->>'status','') not in ('fulfilled','cancelled') then raise exception 'BF_FORBIDDEN'; end if;
 if ord.status=p_payload->>'status' then result:=to_jsonb(ord);
 else
 if ord.status<>'pending' then raise exception 'BF_INVALID_TRANSITION'; end if;
 perform 1 from public.profiles where id=ord.student_id for update;
 if p_payload->>'status'='cancelled' then
 insert into public.economy_ledger(student_id,classroom_id,amount,reason,source_key,actor_id) values(ord.student_id,ord.classroom_id,ord.price,'구매 취소: '||ord.item_name,'refund:'||ord.id,actor.id);
 update public.shop_items set stock=stock+1 where id=ord.item_id;
 end if;
 update public.shop_orders set status=p_payload->>'status' where id=ord.id returning to_jsonb(shop_orders.*) into result; end if;
 when 'wallet_adjust' then
 if not private.is_teacher(cls) or not exists(select 1 from public.enrollments where classroom_id=cls and student_id=target and active) then raise exception 'BF_FORBIDDEN'; end if;
 delta:=(p_payload->>'amount')::integer;
 if delta is null or delta=0 or abs(delta)>10000 or coalesce(length(btrim(p_payload->>'reason')),0) not between 2 and 160 then raise exception 'BF_INVALID_INPUT'; end if;
 perform 1 from public.profiles where id=target for update;
 select coalesce(sum(amount),0) into balance from public.economy_ledger where student_id=target and classroom_id=cls;
 if balance+delta<0 then raise exception 'BF_INSUFFICIENT_BALANCE'; end if;
 insert into public.economy_ledger(student_id,classroom_id,amount,reason,source_key,actor_id) values(target,cls,delta,btrim(p_payload->>'reason'),'adjust:'||p_request_id,actor.id) returning to_jsonb(economy_ledger.*) into result;
 when 'economy_settings' then
 if not private.is_teacher(cls) or coalesce(length(btrim(p_payload->>'currencyName')),0) not between 1 and 12 then raise exception 'BF_FORBIDDEN'; end if;
 rules:=p_payload->'rules';
 if jsonb_typeof(rules) is distinct from 'object' then raise exception 'BF_INVALID_INPUT'; end if;
 foreach k in array array['reading','mission','revision','festival','attendance'] loop
 if coalesce((rules->k->>'xp')::numeric,-1) not between 0 and 1000 or coalesce((rules->k->>'coins')::numeric,-1) not between 0 and 100
 or (rules->k->>'xp')::numeric<>trunc((rules->k->>'xp')::numeric) or (rules->k->>'coins')::numeric<>trunc((rules->k->>'coins')::numeric) then raise exception 'BF_INVALID_INPUT'; end if;
 end loop;
 insert into public.class_economy(classroom_id,currency_name,reward_rules) values(cls,btrim(p_payload->>'currencyName'),rules)
 on conflict(classroom_id) do update set currency_name=excluded.currency_name,reward_rules=excluded.reward_rules returning to_jsonb(class_economy.*) into result;
 when 'monthly_awards' then
 if not private.is_teacher(cls) then raise exception 'BF_FORBIDDEN'; end if;
 period:=p_payload->>'period';
 if period is null or period!~'^\d{4}-\d{2}$' or period>to_char(now() at time zone 'Asia/Seoul','YYYY-MM') then raise exception 'BF_INVALID_INPUT'; end if;
 start_at:=(period||'-01')::timestamp at time zone 'Asia/Seoul'; end_at:=start_at+interval '1 month';
 insert into public.achievement_badges(student_id,classroom_id,code,period_key,evidence_count)
 select student_id,cls,kind||'_king',period,counts.n from (
 select student_id,case kind when 'reading' then 'reading' when 'mission' then 'mission' else 'attendance' end as kind,count(*)::integer n,
 dense_rank() over(partition by kind order by count(*) desc) place from public.activity_events
 where classroom_id=cls and kind in ('reading','mission','attendance') and created_at>=start_at and created_at<end_at group by student_id,kind
 ) counts where place=1 on conflict do nothing;
 get diagnostics n=row_count; result:=jsonb_build_object('awarded',n);
 else raise exception 'BF_UNKNOWN_COMMAND';
 end case;
 if result is null then raise exception 'BF_NOT_FOUND'; end if;
 insert into private.hub_requests(actor_id,request_id,command,payload,result) values(actor.id,p_request_id,p_command,p_payload,result);
 return result;
end $$;
revoke all on function public.hub_command(text,jsonb,uuid) from public,anon;
grant execute on function public.hub_command(text,jsonb,uuid) to authenticated;
-- Currency, experience and accepted snapshots are append-only for all clients.
create trigger ledger_immutable before update or delete on public.economy_ledger for each row execute function private.protect_snapshot();
create trigger activity_immutable before update or delete on public.activity_events for each row execute function private.protect_snapshot();

create function public.hub_summary() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'xp',coalesce((select sum(xp) from public.activity_events where student_id=auth.uid()),0),
 'balances',coalesce((select jsonb_object_agg(classroom_id,amount) from (
 select classroom_id,sum(amount) amount from public.economy_ledger where student_id=auth.uid() group by classroom_id
 ) totals),'{}'::jsonb))
$$;
revoke all on function public.hub_summary() from public,anon;
grant execute on function public.hub_summary() to authenticated;

-- Shared, teacher-approved grade writing activities.
create or replace function public.enter_contest(p_contest_id uuid,p_submission_id uuid,p_request_id uuid) returns public.entries
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
  if not found or not (private.is_active_student(v_contest.classroom_id) or (v_contest.group_id is not null and private.in_grade(v_contest.group_id) and exists(select 1 from public.profiles where id=auth.uid() and role='student' and consent_status='verified'))) then raise exception 'BF_FORBIDDEN'; end if;
  v_accepted_at := clock_timestamp();
  if v_contest.status<>'open' or v_accepted_at>=v_contest.closes_at then raise exception 'BF_CONTEST_CLOSED'; end if;
  if v_accepted_at<v_contest.opens_at then raise exception 'BF_CONTEST_NOT_OPEN'; end if;
  if exists(select 1 from public.entries where contest_id=p_contest_id and student_id=auth.uid()) then raise exception 'BF_ALREADY_ENTERED'; end if;
  select * into v_submission from public.submissions where id=p_submission_id and student_id=auth.uid();
  if not found or v_submission.status<>'completed' then raise exception 'BF_COMPLETED_WORK_REQUIRED'; end if;
  select * into v_assignment from public.assignments where id=v_submission.assignment_id;
  if not private.is_active_student(v_assignment.classroom_id) or (v_contest.group_id is null and v_assignment.classroom_id<>v_contest.classroom_id) or (v_contest.group_id is not null and not exists(select 1 from public.grade_members where group_id=v_contest.group_id and classroom_id=v_assignment.classroom_id and approved)) then raise exception 'BF_FORBIDDEN'; end if;
  insert into public.entries(contest_id,student_id,submission_id,title,body,request_id,created_at)
  values(p_contest_id,auth.uid(),p_submission_id,v_submission.title,v_submission.body,p_request_id,v_accepted_at) returning * into v_result;
  insert into public.audit_events(actor_id,classroom_id,event_type,entity_id) values(auth.uid(),v_contest.classroom_id,'contest_entered',v_result.id);
  return v_result;
end;
$$;
create or replace function public.submit_review(p_entry_id uuid,p_scores jsonb,p_comment text) returns public.reviews
language plpgsql security definer set search_path='' as $$
declare v_entry public.entries; v_contest public.contests; v_result public.reviews; v_key text; v_max integer;
begin
  select * into v_entry from public.entries where id=p_entry_id;
  if not found then raise exception 'BF_FORBIDDEN'; end if;
  select * into v_contest from public.contests where id=v_entry.contest_id for update;
  if not private.festival_teacher(v_contest.id) then raise exception 'BF_FORBIDDEN'; end if;
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
create or replace function public.publish_contest(p_contest_id uuid) returns public.contests
language plpgsql security definer set search_path='' as $$
declare v_result public.contests;
begin
  select * into v_result from public.contests where id=p_contest_id for update;
  if not found or not private.festival_teacher(v_result.id) then raise exception 'BF_FORBIDDEN'; end if;
  if v_result.status='published' then return v_result; end if;
  if clock_timestamp()<v_result.closes_at then raise exception 'BF_CONTEST_STILL_OPEN'; end if;
  if not exists(select 1 from public.entries where contest_id=p_contest_id) then raise exception 'BF_NO_ENTRIES'; end if;
  if exists(select 1 from public.entries e where e.contest_id=p_contest_id and not exists(select 1 from public.reviews r where r.entry_id=e.id)) then raise exception 'BF_REVIEWS_INCOMPLETE'; end if;
  update public.contests set status='published' where id=p_contest_id returning * into v_result;
  insert into public.audit_events(actor_id,classroom_id,event_type,entity_id) values(auth.uid(),v_result.classroom_id,'contest_published',v_result.id);
  return v_result;
end;
$$;
