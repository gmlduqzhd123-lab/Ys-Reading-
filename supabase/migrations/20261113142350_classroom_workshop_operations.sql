-- Private, versioned drafts; published/submitted snapshots remain immutable.
create table private.classroom_work_drafts(owner_id uuid not null references public.profiles(id) on delete cascade,classroom_id uuid not null references public.classrooms(id) on delete cascade,scope text not null check(scope in('quick','answer','template','feedback')),context jsonb not null,payload jsonb,revision integer not null,request_id uuid,fingerprint text,updated_at timestamptz not null default now(),primary key(owner_id,classroom_id,scope,context));
create index classroom_work_drafts_class_idx on private.classroom_work_drafts(classroom_id);
alter table private.classroom_work_drafts enable row level security;
revoke all on private.classroom_work_drafts from public,anon,authenticated,service_role;
create function public.classroom_work_draft(p_action text,p_scope text,p_context jsonb,p_payload jsonb default null,p_revision integer default 0,p_request uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare cls uuid:=(p_context->>'classroom')::uuid;old private.classroom_work_drafts;fp text;allowed boolean:=false;begin
 if not private.data_session() or p_action is null or p_action not in('get','save','discard') or p_scope is null or p_scope not in('quick','answer','template','feedback') or jsonb_typeof(p_context)<>'object' or octet_length(p_context::text)>1000 then raise exception 'BF_FORBIDDEN';end if;
 if p_scope='quick' then allowed:=private.is_active_student(cls);
 elsif p_scope='template' then allowed:=private.is_teacher(cls);
 elsif p_scope='answer' then allowed:=private.is_active_student(cls) and exists(select 1 from private.class_activities a where a.id=(p_context->>'activity')::uuid and a.classroom_id=cls);
 else allowed:=private.can_review_class(cls) and exists(select 1 from private.activity_answers w join private.class_activities a on a.id=w.activity_id where w.id=(p_context->>'answer')::uuid and a.classroom_id=cls and private.staff_learning_visible(w.student_id,cls));end if;
 if not coalesce(allowed,false) then raise exception 'BF_FORBIDDEN';end if;
 if p_action='save' and exists(select 1 from public.classrooms where id=cls and term_state='archived') then raise exception 'BF_CLASS_ARCHIVED';end if;
 perform pg_advisory_xact_lock(hashtextextended('workshop-draft:'||auth.uid()::text,0));
 delete from private.classroom_work_drafts where owner_id=auth.uid() and updated_at<now()-interval '7 days';
 select * into old from private.classroom_work_drafts where owner_id=auth.uid() and classroom_id=cls and scope=p_scope and context=p_context for update;
 if p_action='get' then return jsonb_build_object('revision',coalesce(old.revision,0),'payload',old.payload,'updatedAt',old.updated_at);end if;
 if p_request is null or p_revision is null or p_revision<0 or(p_action='save' and (jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>96000)) then raise exception 'BF_INVALID_INPUT';end if;
 fp:=md5(jsonb_build_array(p_action,p_payload)::text);
 if old.request_id=p_request then if old.fingerprint<>fp then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;return jsonb_build_object('revision',old.revision);end if;
 if coalesce(old.revision,0)<>p_revision then raise exception 'BF_STALE_REVISION';end if;
 if old.owner_id is null and(select count(*) from private.classroom_work_drafts where owner_id=auth.uid())>=200 then raise exception 'BF_DRAFT_QUOTA';end if;
 insert into private.classroom_work_drafts values(auth.uid(),cls,p_scope,p_context,case when p_action='save' then p_payload else null end,p_revision+1,p_request,fp,now()) on conflict(owner_id,classroom_id,scope,context) do update set payload=excluded.payload,revision=excluded.revision,request_id=excluded.request_id,fingerprint=excluded.fingerprint,updated_at=excluded.updated_at;
 return jsonb_build_object('revision',p_revision+1,'updatedAt',now());
end $$;
revoke all on function public.classroom_work_draft(text,text,jsonb,jsonb,integer,uuid) from public,anon;grant execute on function public.classroom_work_draft(text,text,jsonb,jsonb,integer,uuid) to authenticated;

-- Independent, counted lists. No latest-N truncation masquerading as full history.
create function public.classroom_workshop_query(p_classroom uuid,p_kind text,p_page integer default 1,p_filters jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare teacher boolean;reader boolean;student boolean;items jsonb;total integer;rows jsonb;output jsonb;q text:=lower(coalesce(p_filters->>'q',''));state_filter text:=coalesce(p_filters->>'status','all');sid uuid:=nullif(p_filters->>'student','')::uuid;aid uuid:=nullif(p_filters->>'activity','')::uuid;ids uuid[]:='{}';since date:=nullif(p_filters->>'from','')::date;until_date date:=nullif(p_filters->>'until','')::date;begin
 teacher:=private.is_teacher(p_classroom);reader:=private.staff_permission(p_classroom,'read');student:=private.is_active_student(p_classroom);
 if not private.data_session() or not(teacher or reader or student) or p_page is null or p_page not between 1 and 10000 or p_kind is null or p_kind not in('shares','reports','answers','evidence','activities','library','templates') or jsonb_typeof(p_filters) is distinct from 'object' or octet_length(p_filters::text)>1500 or length(q)>100 or length(state_filter)>30 or (since is not null and until_date is not null and(since>until_date or until_date-since>1096)) then raise exception 'BF_FORBIDDEN';end if;
 ids:=array(select value::uuid from jsonb_array_elements_text(coalesce(p_filters->'activities','[]')));if cardinality(ids)>30 then raise exception 'BF_INVALID_INPUT';end if;
 if p_kind in('shares','reports','templates') and not teacher then raise exception 'BF_FORBIDDEN';end if;
 if student then if sid is not null and sid<>auth.uid() then raise exception 'BF_FORBIDDEN';end if;sid:=auth.uid();end if;
 if sid is not null and not(student or private.staff_learning_visible(sid,p_classroom)) then raise exception 'BF_FORBIDDEN';end if;
 if p_kind='shares' then
 with filtered as materialized (
select * from (select s.id,r.id report_id,r.title,r.version,r.student_id,p.display_name student_name,s.created_at,s.expires_at,s.revoked_at from private.family_shares s join public.term_reports r on r.id=s.report_id join public.profiles p on p.id=r.student_id where r.classroom_id=p_classroom and(sid is null or r.student_id=sid) and position(q in lower(r.title||' '||p.display_name))>0 and(state_filter='all' or state_filter='active' and s.revoked_at is null and s.expires_at>now() or state_filter='expired' and s.revoked_at is null and s.expires_at<=now() or state_filter='revoked' and s.revoked_at is not null))x)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from(select * from filtered order by created_at desc,id limit 30 offset(p_page-1)*30)page),'[]'),'total',(select count(*) from filtered),'page',p_page,'size',30) into output;
 elsif p_kind='reports' then
 with filtered as materialized (
select * from (select r.id,r.title,r.version,r.student_id,p.display_name student_name,r.created_at from public.term_reports r join public.profiles p on p.id=r.student_id where r.classroom_id=p_classroom and r.review_state='published' and r.published_at is not null and private.staff_learning_visible(r.student_id,p_classroom) and(sid is null or r.student_id=sid) and position(q in lower(r.title||' '||p.display_name))>0)x)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from(select * from filtered order by created_at desc,id limit 30 offset(p_page-1)*30)page),'[]'),'total',(select count(*) from filtered),'page',p_page,'size',30) into output;
 elsif p_kind='answers' then
 with filtered as materialized (
select * from (select w.*,p.display_name student_name,a.snapshot activity_snapshot from private.activity_answers w join private.class_activities a on a.id=w.activity_id join public.profiles p on p.id=w.student_id where a.classroom_id=p_classroom and(sid is null or w.student_id=sid) and(aid is null or a.id=aid) and(cardinality(ids)=0 or a.id=any(ids)) and((student and w.student_id=auth.uid()) or private.staff_learning_visible(w.student_id,p_classroom)) and(state_filter='all' or w.status=state_filter) and(since is null or(w.created_at at time zone 'Asia/Seoul')::date>=since) and(until_date is null or(w.created_at at time zone 'Asia/Seoul')::date<=until_date) and position(q in lower(p.display_name||' '||(a.snapshot->>'title')))>0 and w.version=(select max(v.version) from private.activity_answers v where v.activity_id=w.activity_id and v.student_id=w.student_id))x)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from(select * from filtered order by case when status='submitted' then 0 when status='revision_requested' then 1 else 2 end,created_at,id limit 30 offset(p_page-1)*30)page),'[]'),'total',(select count(*) from filtered),'page',p_page,'size',30) into output;
 -- Student quiz answers are stripped from activity snapshots until submission results.
 if student then select coalesce(jsonb_agg(v-'activity_snapshot'),'[]') into rows from jsonb_array_elements(output->'items')v;output:=jsonb_set(output,'{items}',rows);end if;
 elsif p_kind='activities' then
 with filtered as materialized (
select * from (select a.id,a.created_at,a.due_at,a.active,(a.snapshot-'questions')||jsonb_build_object('questions',case when teacher or reader then a.snapshot->'questions' else(select jsonb_agg(j-'answer'-'explanation') from jsonb_array_elements(a.snapshot->'questions')j) end) snapshot,a.revision from private.class_activities a where a.classroom_id=p_classroom and(aid is null or a.id=aid) and position(q in lower(a.snapshot->>'title'))>0 and(state_filter='all' or state_filter='active' and a.active and(a.due_at is null or a.due_at>now()) or state_filter='closed' and(not a.active or a.due_at<=now())))x)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from(select * from filtered order by created_at desc,id limit 30 offset(p_page-1)*30)page),'[]'),'total',(select count(*) from filtered),'page',p_page,'size',30) into output;
 elsif p_kind='library' then
 with filtered as materialized (
select * from (select isbn,title,author,location,copies,updated_at,revision from private.class_library where classroom_id=p_classroom and position(q in lower(title||' '||author||' '||isbn||' '||location))>0)x)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from(select * from filtered order by title,isbn limit 30 offset(p_page-1)*30)page),'[]'),'total',(select count(*) from filtered),'page',p_page,'size',30) into output;
 elsif p_kind='templates' then
 with filtered as materialized (
select * from (select id,teacher_id=auth.uid() owned,title,instructions,kind,questions,revision,published,updated_at from private.activity_templates where(teacher_id=auth.uid() or published) and position(q in lower(title))>0)x)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from(select * from filtered order by updated_at desc,id limit 30 offset(p_page-1)*30)page),'[]'),'total',(select count(*) from filtered),'page',p_page,'size',30) into output;
 else
 if sid is null then raise exception 'BF_INVALID_INPUT';end if;
 with filtered as materialized (
select * from (
 select r.id,'reading'::text kind,r.book->>'title' title,r.thought body,r.revision version,r.created_at,r.status,null::uuid activity_id from public.reading_logs r where r.classroom_id=p_classroom and r.student_id=sid
 union all select w.id,'writing',w.title,w.body,w.version,w.created_at,w.status,null::uuid from public.submissions w join public.assignments a on a.id=w.assignment_id where a.classroom_id=p_classroom and w.student_id=sid
 union all select w.id,'answer',a.snapshot->>'title',(select string_agg((j->>'label')||': '||case when jsonb_typeof(w.answers->(j->>'id'))='number' then (j->'options'->>((w.answers->>(j->>'id'))::integer)) else w.answers->>(j->>'id') end,E'\n' order by n) from jsonb_array_elements(a.snapshot->'questions') with ordinality qj(j,n))||case when w.feedback<>'' then E'\n선생님 피드백: '||w.feedback else '' end,w.version,w.created_at,w.status,a.id from private.activity_answers w join private.class_activities a on a.id=w.activity_id where a.classroom_id=p_classroom and w.student_id=sid
 union all select a.id,'paper',a.snapshot->>'title',k.note,1,k.created_at,'completed',a.id from private.paper_activity_checks k join private.class_activities a on a.id=k.activity_id where a.classroom_id=p_classroom and k.student_id=sid
 )x where(state_filter='all' or kind=state_filter) and position(q in lower(title||' '||body))>0 and(since is null or(created_at at time zone 'Asia/Seoul')::date>=since) and(until_date is null or(created_at at time zone 'Asia/Seoul')::date<=until_date))
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from(select * from filtered order by created_at desc,kind,id limit 30 offset(p_page-1)*30)page),'[]'),'total',(select count(*) from filtered),'page',p_page,'size',30) into output;
 end if;
 return output;
end $$;
revoke all on function public.classroom_workshop_query(uuid,text,integer,jsonb) from public,anon;grant execute on function public.classroom_workshop_query(uuid,text,integer,jsonb) to authenticated;
alter table private.class_activities add column revision integer not null default 1;
alter table private.class_library add column revision integer not null default 1;
create table private.activity_schedule_events(id uuid primary key default gen_random_uuid(),activity_id uuid not null references private.class_activities(id) on delete cascade,actor_id uuid references public.profiles(id) on delete set null,before_state jsonb not null,after_state jsonb not null,created_at timestamptz not null default now());
create index activity_schedule_events_activity_idx on private.activity_schedule_events(activity_id,created_at);
create index activity_schedule_events_actor_idx on private.activity_schedule_events(actor_id);
alter table private.activity_schedule_events enable row level security;
revoke all on private.activity_schedule_events from public,anon,authenticated,service_role;
create function private.workshop_revision() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_table_name='class_activities' then
 if (old.active,old.due_at) is distinct from(new.active,new.due_at) then new.revision:=old.revision+1;insert into private.activity_schedule_events(activity_id,actor_id,before_state,after_state) values(old.id,auth.uid(),jsonb_build_object('active',old.active,'dueAt',old.due_at,'revision',old.revision),jsonb_build_object('active',new.active,'dueAt',new.due_at,'revision',new.revision));else new.revision:=old.revision;end if;
 else new.revision:=old.revision+1;end if;return new;end $$;
revoke all on function private.workshop_revision() from public,anon,authenticated,service_role;
create trigger activity_schedule_revision before update on private.class_activities for each row execute function private.workshop_revision();
create trigger library_revision before update on private.class_library for each row execute function private.workshop_revision();
do $$declare d text;begin d:=pg_get_functiondef('private.immutable_activity_snapshot()'::regprocedure);d:=replace(d,'array[''active'',''template_id'']','array[''active'',''template_id'',''due_at'',''revision'']');execute d;end $$;

alter function public.classroom_tool_command(text,uuid,jsonb,uuid) rename to classroom_tool_command_v06;
alter function public.classroom_tool_command_v06(text,uuid,jsonb,uuid) set schema private;
revoke all on function private.classroom_tool_command_v06(text,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
create function public.classroom_tool_command(p_command text,p_classroom uuid,p_payload jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare old private.classroom_tool_requests;fp text;result jsonb;target uuid;amount integer;begin
 if p_command not in('activity_schedule','library_update','library_delete','share_revoke_student') then result:=private.classroom_tool_command_v06(p_command,p_classroom,p_payload,p_request);if p_command='activity_review' then delete from private.classroom_work_drafts where owner_id=auth.uid() and classroom_id=p_classroom and scope='feedback' and context->>'answer'=p_payload->>'id' and btrim(payload->>'feedback')=p_payload->>'feedback';end if;return result;end if;
 if not private.data_session() or not private.is_teacher(p_classroom) or p_request is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>5000 then raise exception 'BF_FORBIDDEN';end if;
 if p_command<>'share_revoke_student' and exists(select 1 from public.classrooms where id=p_classroom and term_state='archived') then raise exception 'BF_CLASS_ARCHIVED';end if;
 perform pg_advisory_xact_lock(hashtextextended('classroom-tool:'||auth.uid()::text,0));
 fp:=encode(sha256(convert_to(p_command||p_classroom::text||p_payload::text,'UTF8')),'hex');
 select * into old from private.classroom_tool_requests where actor_id=auth.uid() and request_id=p_request;
 if found then if old.fingerprint<>fp then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;return old.result;end if;
 if p_command='activity_schedule' then
 if p_payload->>'confirmed' is distinct from 'true' then raise exception 'BF_CONFIRM_REQUIRED';end if;
 if jsonb_typeof(p_payload->'active') is distinct from 'boolean' or(p_payload->>'active')::boolean and nullif(p_payload->>'dueAt','')::timestamptz<=now() then raise exception 'BF_INVALID_INPUT';end if;
 update private.class_activities set active=(p_payload->>'active')::boolean,due_at=nullif(p_payload->>'dueAt','')::timestamptz where id=(p_payload->>'id')::uuid and classroom_id=p_classroom and revision=(p_payload->>'revision')::integer returning jsonb_build_object('revision',revision) into result;
 if not found then raise exception 'BF_STALE';end if;
 elsif p_command='share_revoke_student' then
 if p_payload->>'confirmed' is distinct from 'true' or p_payload->>'student' is null then raise exception 'BF_CONFIRM_REQUIRED';end if;
 update private.family_shares s set revoked_at=now() from public.term_reports r where r.id=s.report_id and r.classroom_id=p_classroom and r.student_id=(p_payload->>'student')::uuid and s.revoked_at is null and s.expires_at>now();get diagnostics amount=row_count;result:=jsonb_build_object('revoked',amount);
 elsif p_command='library_delete' then
 if p_payload->>'confirmed' is distinct from 'true' then raise exception 'BF_CONFIRM_REQUIRED';end if;
 delete from private.class_library where classroom_id=p_classroom and isbn=p_payload->>'isbn' and revision=(p_payload->>'revision')::integer;
 if not found then raise exception 'BF_STALE';end if;result:=jsonb_build_object('deleted',true);
 else
 if length(btrim(coalesce(p_payload->>'title',''))) not between 1 and 200 or length(coalesce(p_payload->>'author',''))>200 or length(coalesce(p_payload->>'location',''))>80 or coalesce((p_payload->>'copies')::integer,0) not between 1 and 999 then raise exception 'BF_INVALID_INPUT';end if;
 update private.class_library set title=btrim(p_payload->>'title'),author=coalesce(p_payload->>'author',''),location=coalesce(p_payload->>'location',''),copies=(p_payload->>'copies')::integer,updated_at=now() where classroom_id=p_classroom and isbn=p_payload->>'isbn' and revision=(p_payload->>'revision')::integer returning jsonb_build_object('revision',revision) into result;
 if not found then raise exception 'BF_STALE';end if;
 end if;
 insert into private.classroom_tool_requests values(auth.uid(),p_request,p_classroom,fp,result,now());return result;
end $$;
revoke all on function public.classroom_tool_command(text,uuid,jsonb,uuid) from public,anon;grant execute on function public.classroom_tool_command(text,uuid,jsonb,uuid) to authenticated;

-- Source freshness includes new learning records. Every report still freezes its own content.
alter function private.report_source_token(uuid,uuid,date,date) rename to report_source_token_v06;
create function private.report_source_token(p_classroom uuid,p_student uuid,p_from date,p_until date) returns text language sql stable security definer set search_path='' as $$
select encode(sha256(convert_to(jsonb_build_array(private.report_source_token_v06(p_classroom,p_student,p_from,p_until),
coalesce((select jsonb_agg(to_jsonb(w) order by w.id) from private.activity_answers w join private.class_activities a on a.id=w.activity_id where a.classroom_id=p_classroom and w.student_id=p_student and(p_from is null or(w.created_at at time zone 'Asia/Seoul')::date between p_from and p_until)),'[]'),
coalesce((select jsonb_agg(to_jsonb(k) order by k.activity_id) from private.paper_activity_checks k join private.class_activities a on a.id=k.activity_id where a.classroom_id=p_classroom and k.student_id=p_student and(p_from is null or(k.created_at at time zone 'Asia/Seoul')::date between p_from and p_until)),'[]'))::text,'UTF8')),'hex') $$;
revoke all on function private.report_source_token(uuid,uuid,date,date) from public,anon,authenticated,service_role;
create function public.classroom_report_candidates(p_classroom uuid,p_student uuid,p_from date default null,p_until date default null,p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare data jsonb;begin
 if not private.data_session() or not private.staff_permission(p_classroom,'read') or not private.staff_learning_visible(p_student,p_classroom) or p_page is null or p_page not between 1 and 10000 or(p_from is null)<>(p_until is null) or p_from>p_until or p_until-p_from>1096 then raise exception 'BF_FORBIDDEN';end if;
 with choices as materialized(
 select 'answer:'||w.id key,a.snapshot->>'title' title,w.version,w.created_at,'answer' kind,
 (select string_agg((j->>'label')||': '||case when jsonb_typeof(w.answers->(j->>'id'))='number' then j->'options'->>((w.answers->>(j->>'id'))::integer) else w.answers->>(j->>'id') end,E'\n' order by n) from jsonb_array_elements(a.snapshot->'questions') with ordinality q(j,n))||case when w.feedback<>'' then E'\n선생님 피드백: '||w.feedback else '' end body
 from private.activity_answers w join private.class_activities a on a.id=w.activity_id where a.classroom_id=p_classroom and w.student_id=p_student and w.status='completed' and(p_from is null or(w.created_at at time zone 'Asia/Seoul')::date between p_from and p_until)
 union all select 'paper:'||k.activity_id,a.snapshot->>'title',1,k.created_at,'paper',k.note from private.paper_activity_checks k join private.class_activities a on a.id=k.activity_id where a.classroom_id=p_classroom and k.student_id=p_student and(p_from is null or(k.created_at at time zone 'Asia/Seoul')::date between p_from and p_until))
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from choices order by created_at desc,key limit 30 offset(p_page-1)*30)x),'[]'),'total',(select count(*) from choices),'page',p_page,'size',30) into data;return data;
end $$;
revoke all on function public.classroom_report_candidates(uuid,uuid,date,date,integer) from public,anon;grant execute on function public.classroom_report_candidates(uuid,uuid,date,date,integer) to authenticated;
create function public.create_classroom_report(p_classroom uuid,p_student uuid,p_from date,p_until date,p_works uuid[],p_title text,p_note text,p_expected_version integer,p_request_id uuid,p_source_token text,p_sources text[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare prev private.growth_term_requests;fp text;state jsonb;works jsonb;sources jsonb;key text;v jsonb;rid uuid;result jsonb;begin
 if not private.data_session() or not private.is_teacher(p_classroom) or not private.staff_learning_visible(p_student,p_classroom) or exists(select 1 from public.classrooms where id=p_classroom and term_state='archived') then raise exception 'BF_FORBIDDEN';end if;
 if p_request_id is null or p_expected_version is null or p_expected_version<0 or p_title is null or length(btrim(p_title)) not between 1 and 100 or p_note is null or length(p_note)>2000 or p_works is null or cardinality(p_works)>3 or p_sources is null or cardinality(p_sources)>3 or(select count(distinct x) from unnest(p_works)x)<>cardinality(p_works) or(select count(distinct x) from unnest(p_sources)x)<>cardinality(p_sources) then raise exception 'BF_INVALID_INPUT';end if;
 perform 1 from public.profiles where id=auth.uid() for update;perform 1 from public.profiles where id=p_student for update;perform 1 from public.classrooms where id=p_classroom for update;
 fp:=encode(sha256(convert_to(jsonb_build_array('classroom-report',p_classroom,p_student,p_from,p_until,p_works,p_title,p_note,p_expected_version,p_source_token,p_sources)::text,'UTF8')),'hex');select * into prev from private.growth_term_requests where actor_id=auth.uid() and request_id=p_request_id;
 if found then if prev.fingerprint<>fp then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;return prev.result;end if;
 if p_source_token is null or p_source_token<>private.report_source_token(p_classroom,p_student,p_from,p_until) then raise exception 'BF_REPORT_SOURCE_CHANGED';end if;
 state:=public.growth_report_state(p_classroom,p_student,p_from,p_until,1);
 if(state->>'latestVersion')::integer<>p_expected_version then raise exception 'BF_REPORT_CONFLICT';end if;
 if(select count(*) from public.submissions s join public.assignments a on a.id=s.assignment_id where s.id=any(p_works) and s.student_id=p_student and a.classroom_id=p_classroom and s.status='completed' and(p_from is null or(s.created_at at time zone 'Asia/Seoul')::date between p_from and p_until))<>cardinality(p_works) then raise exception 'BF_FORBIDDEN';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'body',s.body,'version',s.version,'created_at',s.created_at,'firstTitle',first.title,'firstBody',first.body,'firstDate',first.created_at) order by picked.n),'[]') into works from unnest(p_works) with ordinality picked(id,n) join public.submissions s on s.id=picked.id left join lateral(select title,body,created_at from public.submissions where assignment_id=s.assignment_id and student_id=p_student order by version limit 1)first on true;
 sources:='[]';foreach key in array p_sources loop
 if key !~ '^(answer|paper):[0-9a-f-]{36}$' then raise exception 'BF_INVALID_INPUT';end if;
 -- Find selected evidence directly, independent of the candidate page currently shown.
 if split_part(key,':',1)='answer' then
 select jsonb_build_object('key',key,'kind','answer','title',a.snapshot->>'title','version',w.version,'created_at',w.created_at,'body',(select string_agg((j->>'label')||': '||case when jsonb_typeof(w.answers->(j->>'id'))='number' then j->'options'->>((w.answers->>(j->>'id'))::integer) else w.answers->>(j->>'id') end,E'\n' order by n) from jsonb_array_elements(a.snapshot->'questions') with ordinality q(j,n))||case when w.feedback<>'' then E'\n선생님 피드백: '||w.feedback else '' end) into v from private.activity_answers w join private.class_activities a on a.id=w.activity_id where w.id=split_part(key,':',2)::uuid and a.classroom_id=p_classroom and w.student_id=p_student and w.status='completed' and(p_from is null or(w.created_at at time zone 'Asia/Seoul')::date between p_from and p_until);
 else select jsonb_build_object('key',key,'kind','paper','title',a.snapshot->>'title','version',1,'created_at',k.created_at,'body',k.note) into v from private.paper_activity_checks k join private.class_activities a on a.id=k.activity_id where k.activity_id=split_part(key,':',2)::uuid and a.classroom_id=p_classroom and k.student_id=p_student and(p_from is null or(k.created_at at time zone 'Asia/Seoul')::date between p_from and p_until);end if;
 if v is null then raise exception 'BF_FORBIDDEN';end if;sources:=sources||jsonb_build_array(v);v:=null;end loop;
 state:=(state-'works'-'candidateTotal'-'latestVersion'-'page')||jsonb_build_object('works',works,'sources',sources);
 insert into public.term_reports(classroom_id,student_id,created_by,title,teacher_note,snapshot,version) values(p_classroom,p_student,auth.uid(),btrim(p_title),p_note,state,p_expected_version+1) returning id into rid;
 result:=jsonb_build_object('id',rid,'version',p_expected_version+1);insert into private.growth_term_requests values(auth.uid(),p_request_id,fp,result,now());return result;
end $$;
revoke all on function public.create_classroom_report(uuid,uuid,date,date,uuid[],text,text,integer,uuid,text,text[]) from public,anon;grant execute on function public.create_classroom_report(uuid,uuid,date,date,uuid[],text,text,integer,uuid,text,text[]) to authenticated;

-- Extend the existing public share only with teacher-selected frozen evidence.
do $$declare d text;begin d:=pg_get_functiondef('public.family_portfolio(text)'::regprocedure);
d:=replace(d,'''counts'',r.snapshot->''counts''','''counts'',r.snapshot->''counts'',''sources'',coalesce(r.snapshot->''sources'',''[]''::jsonb)');execute d;end $$;
do $$declare d text;begin d:=pg_get_functiondef('private.purge_operations()'::regprocedure);d:=replace(d,'begin','begin delete from private.classroom_work_drafts where updated_at<now()-interval ''7 days'';');execute d;
d:=pg_get_functiondef('public.operations_purge(uuid)'::regprocedure);if position('delete from public.submissions where id=any(subs);' in d)=0 then raise exception 'Draft purge anchor missing';end if;d:=replace(d,'delete from public.submissions where id=any(subs);','delete from private.classroom_work_drafts where owner_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id);delete from public.submissions where id=any(subs);');execute d;end $$;
alter function public.service_release_contract() rename to release_contract_before_workshop_operations;alter function public.release_contract_before_workshop_operations() set schema private;revoke all on function private.release_contract_before_workshop_operations() from public,anon,authenticated;
create function public.service_release_contract() returns jsonb language sql stable security definer set search_path='' as $$select private.release_contract_before_workshop_operations()||'{"classroomWorkshopOperations":true}'::jsonb$$;revoke all on function public.service_release_contract() from public;grant execute on function public.service_release_contract() to anon,authenticated;

do $$declare d text;begin d:=pg_get_functiondef('public.family_portfolio(text)'::regprocedure);
d:=replace(d,'''sources'',coalesce(r.snapshot->''sources'',''[]''::jsonb)','''sources'',coalesce((select jsonb_agg(jsonb_build_object(''title'',v->>''title'',''body'',v->>''body'',''version'',v->''version'',''kind'',v->>''kind'')) from jsonb_array_elements(coalesce(r.snapshot->''sources'',''[]''::jsonb))v),''[]''::jsonb)');
d:=replace(d,'return jsonb_build_object(', $body$if exists(select 1 from jsonb_array_elements(coalesce(r.snapshot->'sources','[]'))v where (v->>'kind'='answer' and not exists(select 1 from private.activity_answers w join private.class_activities a on a.id=w.activity_id where w.id=split_part(v->>'key',':',2)::uuid and w.student_id=r.student_id and a.classroom_id=r.classroom_id and w.status='completed')) or(v->>'kind'='paper' and not exists(select 1 from private.paper_activity_checks k join private.class_activities a on a.id=k.activity_id where k.activity_id=split_part(v->>'key',':',2)::uuid and k.student_id=r.student_id and a.classroom_id=r.classroom_id))) then raise exception 'BF_SHARE_UNAVAILABLE';end if;return jsonb_build_object($body$);execute d;
d:=pg_get_functiondef('public.operations_purge(uuid)'::regprocedure);d:=replace(d,'delete from private.activity_answers w where student_id=r.student_id', 'delete from private.classroom_work_drafts d where (r.classroom_id is null or d.classroom_id=r.classroom_id) and(d.owner_id=r.student_id or d.scope=''feedback'' and exists(select 1 from private.activity_answers aw where aw.id::text=d.context->>''answer'' and aw.student_id=r.student_id));delete from private.activity_answers w where student_id=r.student_id');execute d;end $$;
