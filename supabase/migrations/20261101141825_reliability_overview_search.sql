-- Read models retain source-table RLS. No student text is copied to notifications.
create index reading_class_day_id_idx on public.reading_logs(classroom_id,read_on desc,id);
create index submissions_student_assignment_version_idx on public.submissions(student_id,assignment_id,version desc);
create index drafts_student_updated_idx on public.drafts(student_id,updated_at desc,id);

create view public.learning_record_index with (security_invoker=true) as
select 'reading'::text kind,r.id,r.classroom_id,r.student_id,p.display_name student_name,r.created_at,r.updated_at,
 r.read_on recorded_on,r.book->>'title' title,r.thought body,r.question,r.status,r.revision version,
 null::uuid assignment_id,coalesce(r.book->>'author','') activity, r.verified_at is not null verified
from public.reading_logs r join public.profiles p on p.id=r.student_id
where p.consent_status='verified' and (r.student_id=auth.uid() or private.is_teacher(r.classroom_id))
union all
select 'writing',s.id,a.classroom_id,s.student_id,p.display_name,s.created_at,s.created_at,
 (s.created_at at time zone 'Asia/Seoul')::date,s.title,s.body,''::text,s.status,s.version,
 s.assignment_id,a.mission_snapshot->>'title',s.status='completed'
from public.submissions s join public.assignments a on a.id=s.assignment_id join public.profiles p on p.id=s.student_id
where p.consent_status='verified' and (s.student_id=auth.uid() or private.is_teacher(a.classroom_id))
union all
select 'draft',d.id,a.classroom_id,d.student_id,p.display_name,d.created_at,d.updated_at,
 (d.updated_at at time zone 'Asia/Seoul')::date,d.title,d.body,''::text,'draft',d.revision,
 d.assignment_id,a.mission_snapshot->>'title',false
from public.drafts d join public.assignments a on a.id=d.assignment_id join public.profiles p on p.id=d.student_id
where p.consent_status='verified' and (d.student_id=auth.uid() or private.is_teacher(a.classroom_id));
revoke all on public.learning_record_index from public,anon,authenticated;
grant select on public.learning_record_index to authenticated,service_role;

create function public.record_search(p_kind text default '',p_classroom uuid default null,p_student uuid default null,
 p_query text default '',p_from date default null,p_to date default null,p_status text default '',p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; pattern text;
begin
 if not private.data_session() then raise exception 'BF_FORBIDDEN'; end if;
 if p_kind is null or p_kind not in ('','reading','writing','draft') or p_status is null or p_status not in ('','reading','completed','submitted','revision_requested','draft')
 or p_query is null or length(p_query)>100 or p_page is null or p_page not between 1 and 100000 or p_from>p_to then raise exception 'BF_INVALID_INPUT'; end if;
 if p_classroom is not null and not(private.is_teacher(p_classroom) or private.is_active_student(p_classroom)) then raise exception 'BF_FORBIDDEN'; end if;
 pattern:='%'||replace(replace(replace(btrim(p_query),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 with matches as materialized (
 select r.* from public.learning_record_index r
 where (p_kind='' or r.kind=p_kind) and (p_classroom is null or r.classroom_id=p_classroom)
 and (p_student is null or r.student_id=p_student) and (p_status='' or r.status=p_status)
 and (p_from is null or r.recorded_on>=p_from) and (p_to is null or r.recorded_on<=p_to)
 and (p_query='' or (coalesce(r.title,'')||' '||r.body||' '||r.question||' '||coalesce(r.activity,'')||' '||r.student_name) ilike pattern escape E'\\')
 ) select jsonb_build_object('total',(select count(*) from matches),'page',p_page,'pageSize',25,
 'rows',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from matches order by recorded_on desc,updated_at desc,id,kind limit 25 offset (p_page-1)*25) x),'[]')) into result;
 return result;
end $$;
revoke all on function public.record_search(text,uuid,uuid,text,date,date,text,integer) from public,anon;
grant execute on function public.record_search(text,uuid,uuid,text,date,date,text,integer) to authenticated;

create view public.latest_class_work with (security_invoker=true) as
select distinct on (s.assignment_id,s.student_id) s.id,s.assignment_id,s.student_id,a.classroom_id,s.status,s.created_at,s.version
from public.submissions s join public.assignments a on a.id=s.assignment_id
order by s.assignment_id,s.student_id,s.version desc;
revoke all on public.latest_class_work from public,anon,authenticated;
grant select on public.latest_class_work to authenticated,service_role;

create table public.teacher_notice_reads(
 teacher_id uuid not null references public.profiles(id) on delete cascade,
 classroom_id uuid not null references public.classrooms(id) on delete cascade,
 seen_through timestamptz not null,primary key(teacher_id,classroom_id));
create index teacher_notice_class_idx on public.teacher_notice_reads(classroom_id);
alter table public.teacher_notice_reads enable row level security;
revoke all on public.teacher_notice_reads from public,anon,authenticated;
grant select on public.teacher_notice_reads to authenticated;
grant all on public.teacher_notice_reads to service_role;
create policy notice_read on public.teacher_notice_reads for select to authenticated
using(private.data_session() and teacher_id=(select auth.uid()) and private.is_teacher(classroom_id));

create view public.teacher_attention with (security_invoker=true) as
select 'writing'::text kind,s.id,s.classroom_id,s.student_id,s.created_at at,s.assignment_id
from public.latest_class_work s where s.status='submitted' and private.is_teacher(s.classroom_id)
union all
select 'reading',r.id,r.classroom_id,r.student_id,r.updated_at,null::uuid
from public.reading_logs r where r.status='completed' and r.verified_at is null and private.is_teacher(r.classroom_id)
union all
select 'role',j.id,t.classroom_id,j.student_id,coalesce((to_jsonb(j)->>'updated_at')::timestamptz,j.created_at),null::uuid
from public.job_applications j join public.class_jobs t on t.id=j.job_id where j.status in ('pending','submitted') and private.is_teacher(t.classroom_id)
union all
select 'plaza',p.id,p.classroom_id,p.student_id,p.created_at,null::uuid
from public.plaza_posts p where p.status='pending' and private.is_teacher(p.classroom_id)
union all
select 'exhibition',e.id,x.classroom_id,e.student_id,e.updated_at,null::uuid
from public.exhibition_entries e join public.exhibitions x on x.id=e.exhibition_id where e.status='pending' and private.is_teacher(x.classroom_id);
revoke all on public.teacher_attention from public,anon,authenticated;
grant select on public.teacher_attention to authenticated,service_role;

create function public.teacher_overview(p_classroom uuid default null,p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not private.data_session() or not exists(select 1 from public.profiles where id=auth.uid() and role='teacher') then raise exception 'BF_FORBIDDEN'; end if;
 if p_classroom is not null and not private.is_teacher(p_classroom) then raise exception 'BF_FORBIDDEN'; end if;
 if p_page is null or p_page not between 1 and 100000 then raise exception 'BF_INVALID_INPUT'; end if;
 with classes as materialized (select * from public.classrooms where teacher_id=auth.uid() and (p_classroom is null or id=p_classroom)),
 roster as materialized (select e.classroom_id,e.student_id,p.display_name,p.consent_status,p.account_active,p.must_change_password
 from public.enrollments e join public.profiles p on p.id=e.student_id join classes c on c.id=e.classroom_id where e.active),
 eligible as materialized(select * from roster where consent_status='verified' and account_active and not must_change_password),
 work as materialized(select l.* from public.latest_class_work l join eligible e using(classroom_id,student_id)),
 missing as materialized(select e.classroom_id,e.student_id,a.id,a.due_at from eligible e join public.assignments a using(classroom_id)
 where not exists(select 1 from work w where w.student_id=e.student_id and w.assignment_id=a.id)),
 attention as materialized(select a.*,p.display_name student_name,coalesce(a.at>r.seen_through,true) unread
 from public.teacher_attention a join classes c on c.id=a.classroom_id join public.profiles p on p.id=a.student_id
 left join public.teacher_notice_reads r on r.teacher_id=auth.uid() and r.classroom_id=a.classroom_id
 where p.consent_status='verified' and p.account_active),
 students as materialized(select e.*,
 (select count(*) from missing m where m.classroom_id=e.classroom_id and m.student_id=e.student_id) missing,
 (select count(*) from missing m where m.classroom_id=e.classroom_id and m.student_id=e.student_id and m.due_at<now()) overdue,
 (select count(*) from work w where w.classroom_id=e.classroom_id and w.student_id=e.student_id and w.status='revision_requested') revision,
 (select max(updated_at) from public.learning_record_index r where r.classroom_id=e.classroom_id and r.student_id=e.student_id) last_activity
 from roster e)
 select jsonb_build_object('asOf',now(),'page',p_page,'pageSize',25,'studentTotal',(select count(*) from students),
 'classes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,
 'students',(select count(*) from roster e where e.classroom_id=c.id),'ready',(select count(*) from eligible e where e.classroom_id=c.id),
 'missing',(select count(*) from missing m where m.classroom_id=c.id),'overdue',(select count(*) from missing m where m.classroom_id=c.id and m.due_at<now()),
 'submitted',(select count(*) from work w where w.classroom_id=c.id and w.status='submitted'),
 'revision',(select count(*) from work w where w.classroom_id=c.id and w.status='revision_requested'),
 'completed',(select count(*) from work w where w.classroom_id=c.id and w.status='completed'),
 'reading',(select count(*) from attention a where a.classroom_id=c.id and a.kind='reading'),
 'unread',(select count(*) from attention a where a.classroom_id=c.id and a.unread),
 'attention',(select count(*) from attention a where a.classroom_id=c.id))) from classes c),'[]'),
 'students',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from students order by overdue desc,missing desc,display_name,student_id,classroom_id limit 25 offset (p_page-1)*25) x),'[]'),
 'alertTotal',(select count(*) from attention),'unread',(select count(*) from attention where unread),
 'alerts',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from attention order by unread desc,at desc,id limit 50) x),'[]')) into result;
 return result;
end $$;
revoke all on function public.teacher_overview(uuid,integer) from public,anon;
grant execute on function public.teacher_overview(uuid,integer) to authenticated;

create function public.teacher_notices_read(p_classroom uuid,p_through timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_teacher(p_classroom) or not private.data_session() then raise exception 'BF_FORBIDDEN'; end if;
 if p_through is null or p_through>clock_timestamp() then raise exception 'BF_INVALID_INPUT'; end if;
 insert into public.teacher_notice_reads values(auth.uid(),p_classroom,p_through)
 on conflict(teacher_id,classroom_id) do update set seen_through=greatest(teacher_notice_reads.seen_through,excluded.seen_through);
end $$;
revoke all on function public.teacher_notices_read(uuid,timestamptz) from public,anon;
grant execute on function public.teacher_notices_read(uuid,timestamptz) to authenticated;

-- A portable learning archive, never a replacement for Auth/whole-database backups.
create function public.class_learning_archive(p_classroom uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; n integer;
begin
 if not private.data_session() or not private.is_teacher(p_classroom) then raise exception 'BF_FORBIDDEN'; end if;
 select count(*) into n from public.learning_record_index where classroom_id=p_classroom;
 if n>20000 then raise exception 'BF_ARCHIVE_TOO_LARGE'; end if;
 select jsonb_build_object('format','bookforest-learning-archive','version',1,'createdAt',now(),
 'classroom',(select jsonb_build_object('id',id,'name',name) from public.classrooms where id=p_classroom),
 'records',coalesce((select jsonb_agg(to_jsonb(r)) from public.learning_record_index r where classroom_id=p_classroom),'[]')) into result;
 if octet_length(result::text)>8000000 then raise exception 'BF_ARCHIVE_TOO_LARGE'; end if;
 return result;
end $$;
revoke all on function public.class_learning_archive(uuid) from public,anon;
grant execute on function public.class_learning_archive(uuid) to authenticated;

create function public.service_probe() returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='missions') and exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_search')
$$;
revoke all on function public.service_probe() from public;
grant execute on function public.service_probe() to anon,authenticated;
