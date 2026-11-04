alter table public.term_reports add column review_state text not null default 'draft' check(review_state in('draft','reviewed','published','withdrawn'));
alter table public.term_reports add column review_revision integer not null default 1 check(review_revision>0);
alter table public.term_reports add column source_token text not null default 'legacy';
alter table public.term_reports add column reviewed_at timestamptz;
create table private.report_review_events(id uuid primary key default gen_random_uuid(),report_id uuid not null references public.term_reports(id) on delete cascade,actor_id uuid references public.profiles(id) on delete set null,action text not null,created_at timestamptz not null default now());
create index report_review_events_report_idx on private.report_review_events(report_id,created_at);
create index report_review_events_actor_idx on private.report_review_events(actor_id);
alter table private.report_review_events enable row level security;
revoke all on private.report_review_events from public,anon,authenticated;

create function private.report_source_token(p_classroom uuid,p_student uuid,p_from date,p_until date) returns text language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object(
 'student',(select to_jsonb(p)-'created_at' from public.profiles p where id=p_student),
 'class',(select to_jsonb(c) from public.classrooms c where id=p_classroom),
 'reading',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.reading_logs r where classroom_id=p_classroom and student_id=p_student and (p_from is null or read_on between p_from and p_until)),'[]'),
 'writing',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.submissions s join public.assignments a on a.id=s.assignment_id where a.classroom_id=p_classroom and s.student_id=p_student and (p_from is null or (s.created_at at time zone 'Asia/Seoul')::date between p_from and p_until)),'[]'),
 'feedback',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from public.feedback f join public.submissions s on s.id=f.submission_id join public.assignments a on a.id=s.assignment_id where a.classroom_id=p_classroom and s.student_id=p_student),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.activity_events e where classroom_id=p_classroom and student_id=p_student and (p_from is null or (created_at at time zone 'Asia/Seoul')::date between p_from and p_until)),'[]'),
 'badges',coalesce((select jsonb_agg(to_jsonb(b) order by b.id) from public.achievement_badges b where classroom_id=p_classroom and student_id=p_student),'[]'))::text,'UTF8')),'hex');
$$;
revoke all on function private.report_source_token(uuid,uuid,date,date) from public,anon,authenticated;
alter function public.growth_report_state(uuid,uuid,date,date,integer) rename to growth_report_state_source;
alter function public.growth_report_state_source(uuid,uuid,date,date,integer) set schema private;
revoke all on function private.growth_report_state_source(uuid,uuid,date,date,integer) from public,anon,authenticated;
create function public.growth_report_state(p_classroom uuid,p_student uuid,p_from date default null,p_until date default null,p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare state jsonb;begin state:=private.growth_report_state_source(p_classroom,p_student,p_from,p_until,p_page);return state||jsonb_build_object('sourceToken',private.report_source_token(p_classroom,p_student,p_from,p_until));end $$;
revoke all on function public.growth_report_state(uuid,uuid,date,date,integer) from public,anon;grant execute on function public.growth_report_state(uuid,uuid,date,date,integer) to authenticated;
create function private.prepare_report_review() returns trigger language plpgsql security definer set search_path='' as $$begin
 new.published_at:=null;new.review_state:='draft';new.review_revision:=1;new.reviewed_at:=null;
 new.source_token:=private.report_source_token(new.classroom_id,new.student_id,(new.snapshot->>'from')::date,(new.snapshot->>'until')::date);return new;end $$;
revoke all on function private.prepare_report_review() from public,anon,authenticated;
create trigger report_prepare_review before insert on public.term_reports for each row execute function private.prepare_report_review();
create or replace function private.immutable_term_report() returns trigger language plpgsql set search_path='' as $$begin
 if (to_jsonb(old)-array['published_at','created_by','review_state','review_revision','reviewed_at']) is distinct from (to_jsonb(new)-array['published_at','created_by','review_state','review_revision','reviewed_at']) or (old.created_by is distinct from new.created_by and (new.created_by is not null or exists(select 1 from public.profiles where id=old.created_by))) then raise exception 'BF_REPORT_IMMUTABLE';end if;return new;end $$;
-- Preserve visibility of existing immutable reports; content remains unchanged.
update public.term_reports set review_state='published' where published_at is not null;
create function public.create_reviewed_report(p_classroom uuid,p_student uuid,p_from date,p_until date,p_works uuid[],p_title text,p_note text,p_expected_version integer,p_request_id uuid,p_source_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare previous private.growth_term_requests;fingerprint text;result jsonb;
begin
 if not private.data_session() or not private.is_teacher(p_classroom) then raise exception 'BF_FORBIDDEN';end if;
 perform 1 from public.profiles where id=auth.uid() for update;perform 1 from public.profiles where id=p_student for update;perform 1 from public.classrooms where id=p_classroom for update;
 if p_request_id is null then raise exception 'BF_INVALID_INPUT';end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array('checked-report',p_classroom,p_student,p_from,p_until,p_works,p_title,p_note,p_expected_version,p_source_token)::text,'UTF8')),'hex');
 select * into previous from private.growth_term_requests where actor_id=auth.uid() and request_id=p_request_id;
 if found then if previous.fingerprint<>fingerprint then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;return previous.result;end if;
 if p_source_token is null or p_source_token<>private.report_source_token(p_classroom,p_student,p_from,p_until) then raise exception 'BF_REPORT_SOURCE_CHANGED';end if;
 result:=public.create_growth_report(p_classroom,p_student,p_from,p_until,p_works,p_title,p_note,false,true,p_expected_version,md5('checked-report:'||p_request_id::text)::uuid);
 insert into private.growth_term_requests values(auth.uid(),p_request_id,fingerprint,result,now());return result;
end $$;
revoke all on function public.create_reviewed_report(uuid,uuid,date,date,uuid[],text,text,integer,uuid,text) from public,anon;grant execute on function public.create_reviewed_report(uuid,uuid,date,date,uuid[],text,text,integer,uuid,text) to authenticated;
create function public.report_review_command(p_report uuid,p_action text,p_revision integer,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.term_reports;prev private.growth_term_requests;fingerprint text;result jsonb;target text;
begin
 if not private.data_session() or p_request_id is null or p_action is null or p_action not in('review','publish','withdraw') then raise exception 'BF_FORBIDDEN';end if;
 select * into r from public.term_reports where id=p_report;
 if not found or not private.is_teacher(r.classroom_id) then raise exception 'BF_FORBIDDEN';end if;
 perform 1 from public.profiles where id=auth.uid() for update;perform 1 from public.profiles where id=r.student_id for update;perform 1 from public.classrooms where id=r.classroom_id for update;
 select * into r from public.term_reports where id=p_report for update;
 fingerprint:='report-review:'||p_report||':'||p_action||':'||p_revision;
 select * into prev from private.growth_term_requests where actor_id=auth.uid() and request_id=p_request_id;
 if found then if prev.fingerprint<>fingerprint then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;return prev.result;end if;
 if p_revision is null or r.review_revision<>p_revision then raise exception 'BF_REPORT_CONFLICT';end if;
 if p_action<>'withdraw' and r.source_token<>private.report_source_token(r.classroom_id,r.student_id,(r.snapshot->>'from')::date,(r.snapshot->>'until')::date) then raise exception 'BF_REPORT_SOURCE_CHANGED';end if;
 target:=case when p_action='review' and r.review_state in('draft','withdrawn') then 'reviewed' when p_action='publish' and r.review_state='reviewed' then 'published' when p_action='withdraw' and r.review_state='published' then 'withdrawn' end;
 if target is null then raise exception 'BF_REPORT_TRANSITION';end if;
 update public.term_reports set review_state=target,review_revision=review_revision+1,reviewed_at=case when target='reviewed' then now() else reviewed_at end,published_at=case when target='published' then now() else null end where id=p_report;
 insert into private.report_review_events(report_id,actor_id,action) values(p_report,auth.uid(),target);
 result:=jsonb_build_object('id',p_report,'state',target,'revision',p_revision+1);insert into private.growth_term_requests values(auth.uid(),p_request_id,fingerprint,result,now());return result;
end $$;
revoke all on function public.report_review_command(uuid,text,integer,uuid) from public,anon;grant execute on function public.report_review_command(uuid,text,integer,uuid) to authenticated;
create function public.batch_report_drafts(p_classroom uuid,p_from date,p_until date,p_items jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;results jsonb:='[]';value jsonb;child uuid;begin
 if not private.data_session() or not private.is_teacher(p_classroom) then raise exception 'BF_FORBIDDEN';end if;
 if p_request_id is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 30 or (select count(distinct x->>'student') from jsonb_array_elements(p_items)x)<>jsonb_array_length(p_items) then raise exception 'BF_INVALID_INPUT';end if;
 for item in select x from jsonb_array_elements(p_items)x order by x->>'student' loop
  begin
   child:=md5(p_request_id::text||':'||(item->>'student'))::uuid;
   value:=public.create_reviewed_report(p_classroom,(item->>'student')::uuid,p_from,p_until,'{}',item->>'title',coalesce(item->>'note',''),(item->>'version')::integer,child,item->>'token');
   results:=results||jsonb_build_array(jsonb_build_object('student',item->>'student','ok',true,'report',value));
  exception when others then
   if sqlerrm not in('BF_REPORT_SOURCE_CHANGED','BF_REPORT_CONFLICT','BF_FORBIDDEN','BF_IDEMPOTENCY_CONFLICT') then raise;end if;
   results:=results||jsonb_build_array(jsonb_build_object('student',item->>'student','ok',false,'code',sqlerrm));
  end;
 end loop;return results;
end $$;
revoke all on function public.batch_report_drafts(uuid,date,date,jsonb,uuid) from public,anon;grant execute on function public.batch_report_drafts(uuid,date,date,jsonb,uuid) to authenticated;
