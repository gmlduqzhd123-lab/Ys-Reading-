-- Classroom learning tools. Private storage; every RPC checks the live session and classroom.
create table private.reading_options(classroom_id uuid primary key references public.classrooms(id) on delete cascade,mode text not null default 'thought' check(mode in('thought','quote','both')),revision integer not null default 1);
create table private.daily_readings(log_id uuid primary key references public.reading_logs(id) on delete cascade,student_id uuid not null references public.profiles(id) on delete cascade,classroom_id uuid not null references public.classrooms(id) on delete cascade,day date not null,book_key text not null,excerpt text not null default '' check(length(excerpt)<=1000),unique(student_id,classroom_id,day,book_key));
create index daily_readings_class_idx on private.daily_readings(classroom_id,day);
create table private.activity_templates(id uuid primary key default gen_random_uuid(),teacher_id uuid not null references public.profiles(id) on delete cascade,title text not null check(length(title) between 1 and 100),instructions text not null default '' check(length(instructions)<=3000),kind text not null check(kind in('worksheet','quiz')),questions jsonb not null,revision integer not null default 1,published boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index activity_templates_owner_idx on private.activity_templates(teacher_id,updated_at desc);
create index activity_templates_gallery_idx on private.activity_templates(updated_at desc) where published;
create table private.class_activities(id uuid primary key default gen_random_uuid(),classroom_id uuid not null references public.classrooms(id) on delete cascade,template_id uuid references private.activity_templates(id) on delete set null,snapshot jsonb not null,due_at timestamptz,active boolean not null default true,created_at timestamptz not null default now());
create index class_activities_class_idx on private.class_activities(classroom_id,created_at desc);
create index class_activities_template_idx on private.class_activities(template_id);
create table private.activity_answers(id uuid primary key default gen_random_uuid(),activity_id uuid not null references private.class_activities(id) on delete cascade,student_id uuid not null references public.profiles(id) on delete cascade,version integer not null,answers jsonb not null,result jsonb not null default '{}',status text not null default 'submitted' check(status in('submitted','revision_requested','completed')),feedback text not null default '' check(length(feedback)<=2000),reviewed_at timestamptz,created_at timestamptz not null default now(),unique(activity_id,student_id,version));
create index activity_answers_student_idx on private.activity_answers(student_id,created_at desc);
create index activity_answers_latest_idx on private.activity_answers(activity_id,student_id,version desc);
create table private.paper_activity_checks(activity_id uuid not null references private.class_activities(id) on delete cascade,student_id uuid not null references public.profiles(id) on delete cascade,teacher_id uuid references public.profiles(id) on delete set null,note text not null check(length(note) between 1 and 2000),created_at timestamptz not null default now(),primary key(activity_id,student_id));
create index paper_activity_checks_student_idx on private.paper_activity_checks(student_id);
create index paper_activity_checks_teacher_idx on private.paper_activity_checks(teacher_id);
alter table private.paper_activity_checks enable row level security;
revoke all on private.paper_activity_checks from public,anon,authenticated;
create table private.reading_rhythms(classroom_id uuid not null references public.classrooms(id) on delete cascade,student_id uuid not null references public.profiles(id) on delete cascade,target integer not null check(target between 1 and 7),revision integer not null default 1,primary key(classroom_id,student_id));
create index reading_rhythms_student_idx on private.reading_rhythms(student_id);
create table private.forest_collection(classroom_id uuid not null references public.classrooms(id) on delete cascade,student_id uuid not null references public.profiles(id) on delete cascade,code text not null check(code in('seed','flower','fox','owl','bridge','lake')),created_at timestamptz not null default now(),primary key(classroom_id,student_id,code));
create index forest_collection_student_idx on private.forest_collection(student_id);
create table private.class_library(classroom_id uuid not null references public.classrooms(id) on delete cascade,isbn text not null check(isbn ~ '^[0-9X-]{10,20}$'),title text not null check(length(title) between 1 and 200),author text not null default '' check(length(author)<=200),location text not null default '' check(length(location)<=80),copies integer not null check(copies between 1 and 999),updated_at timestamptz not null default now(),primary key(classroom_id,isbn));
create table private.family_shares(id uuid primary key default gen_random_uuid(),report_id uuid not null references public.term_reports(id) on delete cascade,created_by uuid not null references public.profiles(id) on delete cascade,token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),expires_at timestamptz not null,revoked_at timestamptz,created_at timestamptz not null default now());
create index family_shares_report_idx on private.family_shares(report_id,expires_at);
create index family_shares_creator_idx on private.family_shares(created_by);
create table private.classroom_tool_requests(actor_id uuid not null references public.profiles(id) on delete cascade,request_id uuid not null,classroom_id uuid not null references public.classrooms(id) on delete cascade,fingerprint text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(actor_id,request_id));
create index classroom_tool_requests_class_idx on private.classroom_tool_requests(classroom_id);
do $$declare t text;begin foreach t in array array['reading_options','daily_readings','activity_templates','class_activities','activity_answers','reading_rhythms','forest_collection','class_library','family_shares','classroom_tool_requests'] loop execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated',t);end loop;end $$;

create function private.validate_activity(p_kind text,p_questions jsonb) returns void language plpgsql set search_path='' as $$
declare q jsonb;n integer;ids text[]:='{}';begin
 if p_kind is null or p_kind not in('worksheet','quiz') or jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) not between 1 and 10 or octet_length(p_questions::text)>20000 then raise exception 'BF_INVALID_ACTIVITY';end if;
 for q in select value from jsonb_array_elements(p_questions) loop
 if jsonb_typeof(q) is distinct from 'object' or coalesce(q->>'id','') !~ '^[a-z][a-z0-9_]{0,19}$' or q->>'id'=any(ids) or coalesce(length(btrim(q->>'label')),0) not between 1 and 500 then raise exception 'BF_INVALID_ACTIVITY';end if;
 ids:=array_append(ids,q->>'id');
 if p_kind='worksheet' then if q->>'kind' is distinct from 'text' then raise exception 'BF_INVALID_ACTIVITY';end if;
 else
 if q->>'kind' is distinct from 'choice' or jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options') not between 2 and 4 or coalesce(q->>'answer','') !~ '^[0-3]$' or coalesce(length(q->>'explanation'),0) not between 1 and 1000 then raise exception 'BF_INVALID_ACTIVITY';end if;
 n:=(q->>'answer')::integer;if n>=jsonb_array_length(q->'options') or exists(select 1 from jsonb_array_elements(q->'options') x where jsonb_typeof(x) is distinct from 'string' or length(btrim(x#>>'{}')) not between 1 and 200) then raise exception 'BF_INVALID_ACTIVITY';end if;
 end if;
 end loop;
end $$;
revoke all on function private.validate_activity(text,jsonb) from public,anon,authenticated;
create function private.immutable_activity_snapshot() returns trigger language plpgsql set search_path='' as $$begin
 if tg_table_name='class_activities' then
 if (to_jsonb(old)-array['active','template_id']) is distinct from (to_jsonb(new)-array['active','template_id']) or (old.template_id is distinct from new.template_id and (new.template_id is not null or exists(select 1 from private.activity_templates where id=old.template_id))) then raise exception 'BF_SNAPSHOT_IMMUTABLE';end if;end if;
 if tg_table_name='activity_answers' and (to_jsonb(old)-array['status','feedback','reviewed_at']) is distinct from (to_jsonb(new)-array['status','feedback','reviewed_at']) then raise exception 'BF_SNAPSHOT_IMMUTABLE';end if;return new;end $$;
create trigger class_activity_immutable before update on private.class_activities for each row execute function private.immutable_activity_snapshot();
create trigger activity_answers_immutable before update on private.activity_answers for each row execute function private.immutable_activity_snapshot();
revoke all on function private.immutable_activity_snapshot() from public,anon,authenticated;

create function public.classroom_tool_command(p_command text,p_classroom uuid,p_payload jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();teacher boolean;reviewer boolean;archived boolean;prev private.classroom_tool_requests;fp text;result jsonb:='{}';t private.activity_templates;a private.class_activities;w private.activity_answers;r public.term_reports;j jsonb;q jsonb;answers jsonb;graded jsonb:='[]';target_id uuid;ver integer;mode text;body text;bookkey text;score integer:=0;counts jsonb;code text;expected integer;begin
 if not private.data_session() then raise exception 'BF_FORBIDDEN';end if;
 select private.is_teacher(c.id),private.can_review_class(c.id),c.term_state='archived' into teacher,reviewer,archived from public.classrooms c where c.id=p_classroom;
 if teacher is null or not (teacher or private.staff_permission(p_classroom,'read') or private.is_active_student(p_classroom)) then raise exception 'BF_FORBIDDEN';end if;
 if p_command is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>64000 or p_request is null then raise exception 'BF_INVALID_INPUT';end if;
 if p_command in('options_save','template_save','template_clone','template_publish','activity_assign','activity_close','library_import','share_create','share_revoke') and not teacher then raise exception 'BF_FORBIDDEN';end if;
 if p_command in('activity_review','paper_confirm') and not reviewer then raise exception 'BF_FORBIDDEN';end if;
 if p_command in('daily_read','rhythm_save','collection_claim','activity_submit') and not private.is_active_student(p_classroom) then raise exception 'BF_FORBIDDEN';end if;
 if archived and p_command<>'share_revoke' then raise exception 'BF_CLASS_ARCHIVED';end if;
 perform pg_advisory_xact_lock(hashtextextended('classroom-tool:'||actor::text,0));
 fp:=encode(sha256(convert_to(p_command||p_classroom::text||p_payload::text,'UTF8')),'hex');select * into prev from private.classroom_tool_requests where actor_id=actor and request_id=p_request;
 if found then if prev.fingerprint<>fp then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;return prev.result;end if;
 case p_command
 when 'options_save' then
 mode:=p_payload->>'mode';expected:=(p_payload->>'revision')::integer;
 if mode is null or mode not in('thought','quote','both') or expected is null or expected<0 then raise exception 'BF_INVALID_INPUT';end if;
 insert into private.reading_options(classroom_id,mode,revision) values(p_classroom,mode,1) on conflict(classroom_id) do update set mode=excluded.mode,revision=reading_options.revision+1 where reading_options.revision=expected;
 if not found or (expected<>0 and not exists(select 1 from private.reading_options where classroom_id=p_classroom and revision=expected+1)) then raise exception 'BF_STALE';end if;
 result:=jsonb_build_object('revision',expected+1);
 when 'daily_read' then
 select o.mode into mode from private.reading_options o where classroom_id=p_classroom;mode:=coalesce(mode,'thought');
 if coalesce(length(btrim(p_payload->>'thought')),0)>1000 or coalesce(length(p_payload->>'excerpt'),0)>1000 or (mode in('thought','both') and coalesce(length(btrim(p_payload->>'thought')),0)=0) or (mode in('quote','both') and coalesce(length(btrim(p_payload->>'excerpt')),0)=0) then raise exception 'BF_READING_REQUIRED';end if;
 bookkey:=lower(coalesce(nullif(p_payload->'book'->>'isbn',''),btrim(p_payload->'book'->>'title')||':'||coalesce(p_payload->'book'->>'author','')));
 if exists(select 1 from private.daily_readings d where d.student_id=actor and d.classroom_id=p_classroom and d.day=(now() at time zone 'Asia/Seoul')::date and d.book_key=bookkey) then raise exception 'BF_DAILY_EXISTS';end if;
 body:=coalesce(nullif(btrim(p_payload->>'thought'),''),'구절 기록: '||btrim(p_payload->>'excerpt'));
 result:=public.hub_command('reading_save',jsonb_build_object('classroomId',p_classroom,'book',p_payload->'book','readOn',(now() at time zone 'Asia/Seoul')::date,'status','reading','thought',body),p_request);
 target_id:=(result->>'id')::uuid;
 insert into private.daily_readings values(target_id,actor,p_classroom,(now() at time zone 'Asia/Seoul')::date,bookkey,coalesce(p_payload->>'excerpt',''));
 when 'template_save' then
 perform private.validate_activity(p_payload->>'kind',p_payload->'questions');
 if coalesce(length(btrim(p_payload->>'title')),0) not between 1 and 100 or coalesce(length(p_payload->>'instructions'),0)>3000 then raise exception 'BF_INVALID_INPUT';end if;
 target_id:=nullif(p_payload->>'id','')::uuid;expected:=coalesce((p_payload->>'revision')::integer,0);
 if target_id is null then
 if expected<>0 then raise exception 'BF_STALE';end if;
 insert into private.activity_templates(teacher_id,title,instructions,kind,questions) values(actor,btrim(p_payload->>'title'),coalesce(p_payload->>'instructions',''),p_payload->>'kind',p_payload->'questions') returning * into t;
 else
 update private.activity_templates set title=btrim(p_payload->>'title'),instructions=coalesce(p_payload->>'instructions',''),kind=p_payload->>'kind',questions=p_payload->'questions',revision=revision+1,published=false,updated_at=now() where activity_templates.id=target_id and teacher_id=actor and revision=expected returning * into t;
 if not found then raise exception 'BF_STALE';end if;
 end if;result:=jsonb_build_object('id',t.id,'revision',t.revision);
 when 'template_clone' then
 select * into t from private.activity_templates where activity_templates.id=(p_payload->>'id')::uuid and (teacher_id=actor or published);
 if not found then raise exception 'BF_FORBIDDEN';end if;
 insert into private.activity_templates(teacher_id,title,instructions,kind,questions) values(actor,t.title,t.instructions,t.kind,t.questions) returning activity_templates.id into target_id;result:=jsonb_build_object('id',target_id);
 when 'template_publish' then
 if p_payload->>'published'='true' and p_payload->>'confirmed' is distinct from 'true' then raise exception 'BF_CONFIRM_REQUIRED';end if;
 update private.activity_templates set published=(p_payload->>'published')::boolean,revision=revision+1,updated_at=now() where activity_templates.id=(p_payload->>'id')::uuid and teacher_id=actor and revision=(p_payload->>'revision')::integer returning activity_templates.id into target_id;
 if not found then raise exception 'BF_STALE';end if;
 when 'activity_assign' then
 select * into t from private.activity_templates where activity_templates.id=(p_payload->>'template')::uuid and teacher_id=actor and revision=(p_payload->>'revision')::integer;
 if not found then raise exception 'BF_STALE';end if;
 if t.kind='quiz' and p_payload->>'confirmed' is distinct from 'true' then raise exception 'BF_CONFIRM_REQUIRED';end if;
 if nullif(p_payload->>'dueAt','')::timestamptz<=now() then raise exception 'BF_INVALID_DEADLINE';end if;
 insert into private.class_activities(classroom_id,template_id,snapshot,due_at) values(p_classroom,t.id,jsonb_build_object('title',t.title,'instructions',t.instructions,'kind',t.kind,'questions',t.questions,'revision',t.revision),nullif(p_payload->>'dueAt','')::timestamptz) returning class_activities.id into target_id;result:=jsonb_build_object('id',target_id);
 when 'activity_close' then
 update private.class_activities set active=false where class_activities.id=(p_payload->>'id')::uuid and classroom_id=p_classroom returning class_activities.id into target_id;if not found then raise exception 'BF_FORBIDDEN';end if;
 when 'activity_submit' then
 select * into a from private.class_activities where class_activities.id=(p_payload->>'id')::uuid and classroom_id=p_classroom for update;
 if not found or not a.active or a.due_at<=now() then raise exception 'BF_ACTIVITY_CLOSED';end if;
 select * into w from private.activity_answers where activity_id=a.id and student_id=actor order by version desc limit 1;
 if coalesce((p_payload->>'version')::integer,0)<>coalesce(w.version,0) or w.status in('submitted','completed') then raise exception 'BF_STALE';end if;
 answers:=p_payload->'answers';if jsonb_typeof(answers) is distinct from 'object' or octet_length(answers::text)>25000 then raise exception 'BF_INVALID_INPUT';end if;
 if (select count(*) from jsonb_object_keys(answers))<>jsonb_array_length(a.snapshot->'questions') then raise exception 'BF_INVALID_INPUT';end if;
 for q in select value from jsonb_array_elements(a.snapshot->'questions') loop
 if a.snapshot->>'kind'='worksheet' then
 if jsonb_typeof(answers->(q->>'id')) is distinct from 'string' or coalesce(length(btrim(answers->>(q->>'id'))),0) not between 1 and 2000 then raise exception 'BF_INVALID_INPUT';end if;
 else
 if jsonb_typeof(answers->(q->>'id')) is distinct from 'number' or coalesce(answers->>(q->>'id'),'') !~ '^[0-3]$' or (answers->>(q->>'id'))::integer>=jsonb_array_length(q->'options') then raise exception 'BF_INVALID_INPUT';end if;
 if answers->>(q->>'id')=q->>'answer' then score:=score+1;end if;
 graded:=graded||jsonb_build_array(jsonb_build_object('id',q->>'id','correct',answers->>(q->>'id')=q->>'answer','answer',(q->>'answer')::integer,'explanation',q->>'explanation'));
 end if;end loop;
 ver:=coalesce(w.version,0)+1;result:=case when a.snapshot->>'kind'='quiz' then jsonb_build_object('score',score,'total',jsonb_array_length(a.snapshot->'questions'),'items',graded) else '{}'::jsonb end;
 insert into private.activity_answers(activity_id,student_id,version,answers,result) values(a.id,actor,ver,answers,result) returning activity_answers.id into target_id;result:=result||jsonb_build_object('id',target_id,'version',ver);
 when 'activity_review' then
 select w0.* into w from private.activity_answers w0 join private.class_activities a0 on a0.id=w0.activity_id where w0.id=(p_payload->>'id')::uuid and a0.classroom_id=p_classroom for update of w0;
 if not found or w.status<>'submitted' or w.version<>(select max(version) from private.activity_answers where activity_id=w.activity_id and student_id=w.student_id) then raise exception 'BF_STALE';end if;
 if not exists(select 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.classroom_id=p_classroom and e.student_id=w.student_id and e.active and p.account_active and p.consent_status='verified' and not p.must_change_password) then raise exception 'BF_FORBIDDEN';end if;
 if p_payload->>'status' is null or p_payload->>'status' not in('completed','revision_requested') or coalesce(length(btrim(p_payload->>'feedback')),0) not between 1 and 2000 then raise exception 'BF_INVALID_INPUT';end if;
 update private.activity_answers set status=p_payload->>'status',feedback=btrim(p_payload->>'feedback'),reviewed_at=now() where activity_answers.id=w.id;
 if p_payload->>'status'='completed' then perform private.award_activity(w.student_id,p_classroom,'mission','class-activity:'||w.activity_id::text);if w.version>1 then perform private.award_activity(w.student_id,p_classroom,'revision','class-activity:'||w.activity_id::text);end if;end if;
 when 'paper_confirm' then
 select * into a from private.class_activities where class_activities.id=(p_payload->>'activity')::uuid and classroom_id=p_classroom;
 if not found or p_payload->>'confirmed' is distinct from 'true' or coalesce(length(btrim(p_payload->>'note')),0) not between 1 and 2000 then raise exception 'BF_CONFIRM_REQUIRED';end if;
 target_id:=(p_payload->>'student')::uuid;
 if not exists(select 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.classroom_id=p_classroom and e.student_id=target_id and e.active and p.account_active and p.consent_status='verified' and not p.must_change_password) then raise exception 'BF_FORBIDDEN';end if;
 insert into private.paper_activity_checks values(a.id,target_id,actor,btrim(p_payload->>'note'),now()) on conflict do nothing;
 if not found then raise exception 'BF_STALE';end if;
 perform private.award_activity(target_id,p_classroom,'mission','class-activity:'||a.id::text);
 when 'rhythm_save' then
 expected:=(p_payload->>'revision')::integer;ver:=(p_payload->>'target')::integer;if expected is null or expected<0 or ver is null or ver not between 1 and 7 then raise exception 'BF_INVALID_INPUT';end if;
 insert into private.reading_rhythms(classroom_id,student_id,target) values(p_classroom,actor,ver) on conflict(classroom_id,student_id) do update set target=excluded.target,revision=reading_rhythms.revision+1 where reading_rhythms.revision=expected;
 if not found or (expected<>0 and not exists(select 1 from private.reading_rhythms where classroom_id=p_classroom and student_id=actor and revision=expected+1)) then raise exception 'BF_STALE';end if;
 when 'collection_claim' then
 code:=p_payload->>'code';select jsonb_object_agg(kind,n) into counts from(select kind,count(*) n from public.activity_events where classroom_id=p_classroom and student_id=actor group by kind)x;
 if (case code when 'seed' then coalesce((counts->>'reading')::int,0)>=1 when 'flower' then coalesce((counts->>'reading')::int,0)>=3 when 'fox' then coalesce((counts->>'mission')::int,0)>=1 when 'owl' then coalesce((counts->>'mission')::int,0)>=3 when 'bridge' then coalesce((counts->>'revision')::int,0)>=1 when 'lake' then coalesce((counts->>'attendance')::int,0)>=3 else false end) is not true then raise exception 'BF_COLLECTION_NOT_READY';end if;
 insert into private.forest_collection values(p_classroom,actor,code,now()) on conflict do nothing;
 when 'library_import' then
 if jsonb_typeof(p_payload->'books') is distinct from 'array' or jsonb_array_length(p_payload->'books') not between 1 and 100 then raise exception 'BF_INVALID_INPUT';end if;
 for j in select value from jsonb_array_elements(p_payload->'books') loop
 insert into private.class_library(classroom_id,isbn,title,author,location,copies) values(p_classroom,j->>'isbn',btrim(j->>'title'),coalesce(j->>'author',''),coalesce(j->>'location',''),coalesce((j->>'copies')::integer,1)) on conflict(classroom_id,isbn) do update set title=excluded.title,author=excluded.author,location=excluded.location,copies=excluded.copies,updated_at=now();end loop;
 if (select count(*) from private.class_library where classroom_id=p_classroom)>10000 then raise exception 'BF_CAPACITY';end if;result:=jsonb_build_object('imported',jsonb_array_length(p_payload->'books'));
 when 'share_create' then
 if p_payload->>'confirmed' is distinct from 'true' or coalesce(p_payload->>'tokenHash','') !~ '^[a-f0-9]{64}$' or coalesce((p_payload->>'days')::int,0) not between 1 and 30 then raise exception 'BF_CONFIRM_REQUIRED';end if;
 select * into r from public.term_reports where term_reports.id=(p_payload->>'report')::uuid and classroom_id=p_classroom and review_state='published' and published_at is not null;
 if not found or not exists(select 1 from public.profiles p join public.enrollments e on e.student_id=p.id where p.id=r.student_id and e.classroom_id=p_classroom and e.active and p.account_active and not p.must_change_password and p.consent_status='verified') then raise exception 'BF_FORBIDDEN';end if;
 insert into private.family_shares(report_id,created_by,token_hash,expires_at) values(r.id,actor,p_payload->>'tokenHash',now()+make_interval(days=>(p_payload->>'days')::int)) returning family_shares.id into target_id;result:=jsonb_build_object('id',target_id);
 when 'share_revoke' then
 update private.family_shares s set revoked_at=now() from public.term_reports shared_report where s.id=(p_payload->>'id')::uuid and shared_report.id=s.report_id and shared_report.classroom_id=p_classroom;if not found then raise exception 'BF_FORBIDDEN';end if;
 else raise exception 'BF_INVALID_COMMAND';end case;
 insert into private.classroom_tool_requests values(actor,p_request,p_classroom,fp,result,now());return result;
end $$;
revoke all on function public.classroom_tool_command(text,uuid,jsonb,uuid) from public,anon;grant execute on function public.classroom_tool_command(text,uuid,jsonb,uuid) to authenticated;

create function public.classroom_tool_state(p_classroom uuid,p_query text default '',p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare teacher boolean;reader boolean;student boolean;actor uuid:=auth.uid();output jsonb;begin
 if not private.data_session() then raise exception 'BF_FORBIDDEN';end if;
 teacher:=private.is_teacher(p_classroom);reader:=private.staff_permission(p_classroom,'read');student:=private.is_active_student(p_classroom);
 if not (teacher or reader or student) or p_page is null or p_page not between 1 and 10000 or p_query is null or length(p_query)>100 then raise exception 'BF_FORBIDDEN';end if;
 output:=jsonb_build_object(
 'classroom',(select jsonb_build_object('id',c.id,'name',c.name,'archived',c.term_state='archived','owner',teacher,'canReview',private.can_review_class(c.id),'simple',c.simple_student_view,'guidance',c.reading_guidance) from public.classrooms c where c.id=p_classroom),
 'mode',coalesce((select mode from private.reading_options where classroom_id=p_classroom),'thought'),'optionsRevision',coalesce((select revision from private.reading_options where classroom_id=p_classroom),0),
 'books',coalesce((select jsonb_agg(book order by created_at desc) from(select * from(select distinct on(book->>'title',book->>'author') book,created_at from public.reading_logs where classroom_id=p_classroom and student_id=actor order by book->>'title',book->>'author',created_at desc)recent order by created_at desc limit 10)x),'[]'),
 'templates',case when teacher then coalesce((select jsonb_agg(to_jsonb(x)) from(select id,teacher_id=actor owned,title,instructions,kind,questions,revision,published from private.activity_templates where teacher_id=actor or published order by updated_at desc,id limit 20 offset (p_page-1)*20)x),'[]') else '[]'::jsonb end,
 'activities',coalesce((select jsonb_agg(to_jsonb(x)) from(select a.id,a.created_at,a.due_at,a.active,(a.snapshot-'questions')||jsonb_build_object('questions',case when reader or teacher then a.snapshot->'questions' else(select jsonb_agg(q-'answer'-'explanation') from jsonb_array_elements(a.snapshot->'questions')q) end) snapshot from private.class_activities a where classroom_id=p_classroom order by created_at desc,id limit 20 offset (p_page-1)*20)x),'[]'),
 'activityTotal',(select count(*) from private.class_activities where classroom_id=p_classroom),
 'papers',coalesce((select jsonb_agg(to_jsonb(x)) from(select k.activity_id,k.student_id,p.display_name student_name,a.snapshot->>'title' title,k.note,k.created_at from private.paper_activity_checks k join private.class_activities a on a.id=k.activity_id join public.profiles p on p.id=k.student_id join public.enrollments e on e.classroom_id=a.classroom_id and e.student_id=k.student_id where a.classroom_id=p_classroom and (teacher or reader or k.student_id=actor) and e.active and p.account_active and p.consent_status='verified' and not p.must_change_password order by k.created_at desc limit 100)x),'[]'),
 'answers',coalesce((select jsonb_agg(to_jsonb(x)) from(select w.*,p.display_name student_name from private.activity_answers w join private.class_activities a on a.id=w.activity_id join public.profiles p on p.id=w.student_id join public.enrollments e on e.student_id=p.id and e.classroom_id=a.classroom_id where a.classroom_id=p_classroom and e.active and p.account_active and p.consent_status='verified' and not p.must_change_password and (reader or teacher or w.student_id=actor) and w.version=(select max(v.version) from private.activity_answers v where v.activity_id=w.activity_id and v.student_id=w.student_id) order by w.created_at desc limit 100)x),'[]'),
 'today',case when teacher or reader then coalesce((select jsonb_agg(to_jsonb(x)) from(select p.id,p.display_name name, (select count(*) from public.reading_logs r where r.classroom_id=p_classroom and r.student_id=p.id and (r.created_at at time zone 'Asia/Seoul')::date=(now() at time zone 'Asia/Seoul')::date) readings,(select count(*) from private.activity_answers w join private.class_activities a on a.id=w.activity_id where a.classroom_id=p_classroom and w.student_id=p.id and (w.created_at at time zone 'Asia/Seoul')::date=(now() at time zone 'Asia/Seoul')::date) activities from public.enrollments e join public.profiles p on p.id=e.student_id where e.classroom_id=p_classroom and e.active and p.account_active and p.consent_status='verified' and not p.must_change_password order by p.display_name,p.id limit 100)x),'[]') else '[]'::jsonb end,
 'counts',coalesce((select jsonb_object_agg(kind,n) from(select kind,count(*) n from public.activity_events where student_id=actor and classroom_id=p_classroom group by kind)x),'{}'),
 'collection',coalesce((select jsonb_agg(code) from private.forest_collection where student_id=actor and classroom_id=p_classroom),'[]'),
 'rhythm',coalesce((select jsonb_build_object('target',target,'revision',revision) from private.reading_rhythms where student_id=actor and classroom_id=p_classroom),'{"target":3,"revision":0}'),
 'days',coalesce((select jsonb_agg(active_day order by active_day) from(select distinct active_day from(select (created_at at time zone 'Asia/Seoul')::date as active_day from public.reading_logs where student_id=actor and classroom_id=p_classroom union select (s.created_at at time zone 'Asia/Seoul')::date from public.submissions s join public.assignments a on a.id=s.assignment_id where s.student_id=actor and a.classroom_id=p_classroom union select (w.created_at at time zone 'Asia/Seoul')::date from private.activity_answers w join private.class_activities a on a.id=w.activity_id where w.student_id=actor and a.classroom_id=p_classroom)x where active_day>=(now() at time zone 'Asia/Seoul')::date-27)y),'[]'),
 'library',coalesce((select jsonb_agg(to_jsonb(x)) from(select isbn,title,author,location,copies,updated_at from private.class_library where classroom_id=p_classroom and position(lower(p_query) in lower(title||' '||author||' '||isbn))>0 order by title,isbn limit 50 offset (p_page-1)*50)x),'[]'),
 'libraryTotal',(select count(*) from private.class_library where classroom_id=p_classroom and position(lower(p_query) in lower(title||' '||author||' '||isbn))>0),
 'reports',case when teacher then coalesce((select jsonb_agg(to_jsonb(x)) from(select r.id,r.title,r.student_id,p.display_name student_name,r.created_at from public.term_reports r join public.profiles p on p.id=r.student_id where r.classroom_id=p_classroom and r.review_state='published' and r.published_at is not null order by r.created_at desc limit 30)x),'[]') else '[]'::jsonb end,
 'shares',case when teacher then coalesce((select jsonb_agg(to_jsonb(x)) from(select s.id,r.title,s.expires_at,s.revoked_at from private.family_shares s join public.term_reports r on r.id=s.report_id where r.classroom_id=p_classroom order by s.created_at desc limit 30)x),'[]') else '[]'::jsonb end);
 return output;
end $$;
revoke all on function public.classroom_tool_state(uuid,text,integer) from public,anon;grant execute on function public.classroom_tool_state(uuid,text,integer) to authenticated;
create function public.classroom_tool_activity(p_activity uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a private.class_activities;base jsonb;teacher boolean;begin
 select * into a from private.class_activities where id=p_activity;
 if not found then raise exception 'BF_FORBIDDEN';end if;
 base:=public.classroom_tool_state(a.classroom_id);teacher:=private.is_teacher(a.classroom_id) or private.staff_permission(a.classroom_id,'read');
 return base||jsonb_build_object('activities',jsonb_build_array(jsonb_build_object('id',a.id,'active',a.active,'due_at',a.due_at,'created_at',a.created_at,'snapshot',(a.snapshot-'questions')||jsonb_build_object('questions',case when teacher then a.snapshot->'questions' else(select jsonb_agg(q-'answer'-'explanation') from jsonb_array_elements(a.snapshot->'questions')q) end))),
 'answers',coalesce((select jsonb_agg(to_jsonb(x)) from(select w.*,p.display_name student_name from private.activity_answers w join public.profiles p on p.id=w.student_id join public.enrollments e on e.student_id=p.id and e.classroom_id=a.classroom_id where w.activity_id=a.id and (teacher or w.student_id=auth.uid()) and e.active and p.account_active and not p.must_change_password and p.consent_status='verified' and w.version=(select max(v.version) from private.activity_answers v where v.student_id=w.student_id and v.activity_id=w.activity_id) order by w.created_at desc limit 100)x),'[]'));
end $$;
revoke all on function public.classroom_tool_activity(uuid) from public,anon;grant execute on function public.classroom_tool_activity(uuid) to authenticated;

create function public.classroom_evidence(p_classroom uuid,p_student uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.data_session() or not (private.staff_permission(p_classroom,'read') or private.is_teacher(p_classroom) or (auth.uid()=p_student and private.is_active_student(p_classroom))) or not exists(select 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.classroom_id=p_classroom and e.student_id=p_student and e.active and p.consent_status='verified' and p.account_active and not p.must_change_password) then raise exception 'BF_FORBIDDEN';end if;
 return jsonb_build_object('student',p_student,'readings',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,book->>'title' title,thought,read_on,verified_at,revision from public.reading_logs where classroom_id=p_classroom and student_id=p_student order by created_at desc limit 20)x),'[]'),
 'writing',coalesce((select jsonb_agg(to_jsonb(x)) from(select s.id,s.assignment_id,s.title,s.body,s.version,s.status,s.created_at from public.submissions s join public.assignments a on a.id=s.assignment_id where a.classroom_id=p_classroom and s.student_id=p_student order by s.created_at desc limit 20)x),'[]'),
 'activities',coalesce((select jsonb_agg(to_jsonb(x)) from(select w.id,w.activity_id,a.snapshot->>'title' title,w.version,w.answers,w.feedback,w.status,w.created_at from private.activity_answers w join private.class_activities a on a.id=w.activity_id where a.classroom_id=p_classroom and w.student_id=p_student order by w.created_at desc limit 20)x),'[]'),
 'papers',coalesce((select jsonb_agg(to_jsonb(x)) from(select k.activity_id,a.snapshot->>'title' title,k.note,k.created_at from private.paper_activity_checks k join private.class_activities a on a.id=k.activity_id where a.classroom_id=p_classroom and k.student_id=p_student order by k.created_at desc limit 20)x),'[]'));
end $$;
revoke all on function public.classroom_evidence(uuid,uuid) from public,anon;grant execute on function public.classroom_evidence(uuid,uuid) to authenticated;

-- Capability is generated in the browser, kept in a URL fragment, and stored only as a hash.
create function public.family_portfolio(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.term_reports;begin
 if exists(select 1 from private.recovery_state where held) then raise exception 'BF_SHARE_UNAVAILABLE';end if;
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'BF_SHARE_UNAVAILABLE';end if;
 select r0.* into r from private.family_shares s join public.term_reports r0 on r0.id=s.report_id join public.classrooms c on c.id=r0.classroom_id join public.profiles p on p.id=r0.student_id join public.profiles t on t.id=s.created_by join public.enrollments e on e.student_id=p.id and e.classroom_id=c.id
 where s.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and s.expires_at>now() and s.revoked_at is null and c.teacher_id=s.created_by and t.role='teacher' and t.account_active and not t.must_change_password and e.active and p.account_active and not p.must_change_password and p.consent_status='verified' and r0.review_state='published' and r0.published_at is not null;
 if not found then raise exception 'BF_SHARE_UNAVAILABLE';end if;
 -- A withdrawn/deleted source must not survive in an old share snapshot.
 if exists(select 1 from jsonb_array_elements(coalesce(r.snapshot->'works','[]')) w where not exists(select 1 from public.submissions s join public.assignments a on a.id=s.assignment_id where s.id=(w->>'id')::uuid and s.student_id=r.student_id and a.classroom_id=r.classroom_id and s.status='completed')) then raise exception 'BF_SHARE_UNAVAILABLE';end if;
 return jsonb_build_object('title',r.title,'teacherNote',r.teacher_note,'version',r.version,'createdAt',r.created_at,'from',r.snapshot->'from','until',r.snapshot->'until','counts',r.snapshot->'counts','works',coalesce((select jsonb_agg(jsonb_build_object('title',w->>'title','body',w->>'body','version',w->'version')) from jsonb_array_elements(coalesce(r.snapshot->'works','[]'))w),'[]'));
end $$;
revoke all on function public.family_portfolio(text) from public;grant execute on function public.family_portfolio(text) to anon,authenticated;
create function private.revoke_family_student_access() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.consent_status<>'verified' or not new.account_active or new.must_change_password then update private.family_shares s set revoked_at=coalesce(s.revoked_at,now()) from public.term_reports r where r.id=s.report_id and r.student_id=new.id;end if;return new;end $$;
create trigger family_student_access after update of consent_status,account_active,must_change_password on public.profiles for each row execute function private.revoke_family_student_access();
create function private.revoke_family_membership_access() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='DELETE' then update private.family_shares s set revoked_at=coalesce(s.revoked_at,now()) from public.term_reports r where r.id=s.report_id and r.student_id=old.student_id and r.classroom_id=old.classroom_id;
 elsif not new.active then update private.family_shares s set revoked_at=coalesce(s.revoked_at,now()) from public.term_reports r where r.id=s.report_id and r.student_id=new.student_id and r.classroom_id=new.classroom_id;end if;return null;end $$;
create trigger family_membership_access after update of active or delete on public.enrollments for each row execute function private.revoke_family_membership_access();
create function private.revoke_family_publication_access() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_table_name='term_reports' then if new.review_state<>'published' then update private.family_shares set revoked_at=coalesce(revoked_at,now()) where report_id=new.id;end if;
 else update private.family_shares s set revoked_at=coalesce(s.revoked_at,now()) from public.term_reports r where r.id=s.report_id and r.classroom_id=new.id;end if;return new;end $$;
create trigger family_publication_access after update of review_state on public.term_reports for each row execute function private.revoke_family_publication_access();
create trigger family_handover_access after update of teacher_id on public.classrooms for each row when(old.teacher_id is distinct from new.teacher_id) execute function private.revoke_family_publication_access();
revoke all on function private.revoke_family_student_access(),private.revoke_family_membership_access(),private.revoke_family_publication_access() from public,anon,authenticated;
create table private.classroom_quiz_budget(classroom_id uuid not null references public.classrooms(id) on delete cascade,teacher_id uuid not null references public.profiles(id) on delete cascade,day date not null,count integer not null check(count between 1 and 5),primary key(classroom_id,teacher_id,day));
create index classroom_quiz_budget_teacher_idx on private.classroom_quiz_budget(teacher_id);
alter table private.classroom_quiz_budget enable row level security;
revoke all on private.classroom_quiz_budget from public,anon,authenticated;
create function public.consume_classroom_quiz_budget(p_classroom uuid) returns boolean language plpgsql security definer set search_path='' as $$begin
 if not private.data_session() or not private.is_teacher(p_classroom) or not exists(select 1 from public.classrooms where id=p_classroom and term_state<>'archived') then raise exception 'BF_FORBIDDEN';end if;
 delete from private.classroom_quiz_budget where day<(now() at time zone 'Asia/Seoul')::date-7;
 insert into private.classroom_quiz_budget values(p_classroom,auth.uid(),(now() at time zone 'Asia/Seoul')::date,1) on conflict(classroom_id,teacher_id,day) do update set count=classroom_quiz_budget.count+1 where classroom_quiz_budget.count<5;
 return found;end $$;
revoke all on function public.consume_classroom_quiz_budget(uuid) from public,anon;grant execute on function public.consume_classroom_quiz_budget(uuid) to authenticated;
-- New learning records participate in the existing approved service-only deletion path.
do $$declare d text;anchor text:='delete from public.plaza_reactions pr';begin
 d:=pg_get_functiondef('public.operations_purge(uuid)'::regprocedure);
 if position(anchor in d)=0 then raise exception 'WORKSHOP_PURGE_ANCHOR_MISSING';end if;
 d:=replace(d,anchor,$extra$
 delete from private.activity_answers w where student_id=r.student_id and (r.classroom_id is null or exists(select 1 from private.class_activities a where a.id=w.activity_id and a.classroom_id=r.classroom_id));
 delete from private.paper_activity_checks k where student_id=r.student_id and (r.classroom_id is null or exists(select 1 from private.class_activities a where a.id=k.activity_id and a.classroom_id=r.classroom_id));
 delete from private.reading_rhythms where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id);
 delete from private.forest_collection where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id);
 delete from private.classroom_tool_requests where actor_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id);
 $extra$||anchor);execute d;
 d:=pg_get_functiondef('private.last_student_activity(uuid,uuid)'::regprocedure);anchor:='select created_at at from public.enrollments';
 if position(anchor in d)=0 then raise exception 'WORKSHOP_RETENTION_ANCHOR_MISSING';end if;
 d:=replace(d,anchor,'select w.created_at at from private.activity_answers w join private.class_activities a on a.id=w.activity_id where w.student_id=p_student and (p_class is null or a.classroom_id=p_class) union all select k.created_at at from private.paper_activity_checks k join private.class_activities a on a.id=k.activity_id where k.student_id=p_student and (p_class is null or a.classroom_id=p_class) union all '||anchor);execute d;
 d:=pg_get_functiondef('public.deletion_preview(uuid)'::regprocedure);
 if position('return result;' in d)=0 then raise exception 'WORKSHOP_PREVIEW_ANCHOR_MISSING';end if;
 d:=replace(d,'return result;',$extra$result:=result||jsonb_build_object('classroom_activities',(select count(*) from private.activity_answers w join private.class_activities a on a.id=w.activity_id where w.student_id=r.student_id and (r.classroom_id is null or a.classroom_id=r.classroom_id)));return result;$extra$);execute d;
end $$;
alter function public.service_release_contract() rename to release_contract_before_workshop;
alter function public.release_contract_before_workshop() set schema private;
revoke all on function private.release_contract_before_workshop() from public,anon,authenticated;
create function public.service_release_contract() returns jsonb language sql stable security definer set search_path='' as $$select private.release_contract_before_workshop()||'{"classroomWorkshop":true}'::jsonb$$;
revoke all on function public.service_release_contract() from public;grant execute on function public.service_release_contract() to anon,authenticated;
