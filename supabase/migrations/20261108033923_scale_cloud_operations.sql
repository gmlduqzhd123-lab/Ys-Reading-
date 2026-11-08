create index reading_class_updated_idx on public.reading_logs(classroom_id,updated_at desc,id);
create index reading_student_updated_idx on public.reading_logs(student_id,updated_at desc,id);
create index submissions_student_created_idx on public.submissions(student_id,created_at desc,id);

-- Count/filter a narrow relation. Load the long student text for the 25 page
-- rows only; source-table RLS is evaluated for selection and final loading.
create or replace function public.record_search(p_kind text default '',p_classroom uuid default null,p_student uuid default null,
p_query text default '',p_from date default null,p_to date default null,p_status text default '',p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;pattern text;begin
 if not private.data_session() then raise exception 'BF_FORBIDDEN';end if;
 if p_kind is null or p_kind not in('','reading','writing','draft') or p_status is null or p_status not in('','reading','completed','submitted','revision_requested','draft') or p_query is null or length(p_query)>100 or p_page is null or p_page not between 1 and 100000 or p_from>p_to then raise exception 'BF_INVALID_INPUT';end if;
 if p_classroom is not null and not(private.is_teacher(p_classroom) or private.is_active_student(p_classroom)) then raise exception 'BF_FORBIDDEN';end if;
 pattern:='%'||replace(replace(replace(btrim(p_query),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 with matches as materialized(select r.kind,r.id,r.recorded_on,r.updated_at from public.learning_record_index r where(p_kind='' or r.kind=p_kind) and(p_classroom is null or r.classroom_id=p_classroom) and(p_student is null or r.student_id=p_student) and(p_status='' or r.status=p_status) and(p_from is null or r.recorded_on>=p_from) and(p_to is null or r.recorded_on<=p_to) and(p_query='' or(coalesce(r.title,'')||' '||r.body||' '||r.question||' '||coalesce(r.activity,'')||' '||r.student_name) ilike pattern escape E'\\')),
 selected as(select * from matches order by recorded_on desc,updated_at desc,id,kind limit 25 offset(p_page-1)*25)
 select jsonb_build_object('total',(select count(*) from matches),'page',p_page,'pageSize',25,'rows',coalesce((select jsonb_agg(to_jsonb(x)) from(select r.* from selected s join public.learning_record_index r on r.id=s.id and r.kind=s.kind order by s.recorded_on desc,s.updated_at desc,s.id,s.kind)x),'[]')) into result;return result;
end $$;

create or replace function private.cloud_backup_tick() returns void language plpgsql security definer set search_path='' as $$
declare job uuid;cutoff timestamptz;begin
 if not pg_try_advisory_xact_lock(hashtext('bookforest:cloud-backup')) or not exists(select 1 from private.cloud_backup_config where enabled) then return;end if;
 cutoff:=(date_trunc('day',now() at time zone 'Asia/Seoul')+interval '19 hours') at time zone 'Asia/Seoul';if now()<cutoff then cutoff:=cutoff-interval '1 day';end if;
 update private.cloud_backup_jobs set status='failed',error_code='CLOUD_JOB_TIMEOUT',finished_at=now() where status in('queued','running') and created_at<now()-interval '15 minutes';
 if exists(select 1 from private.cloud_backup_jobs where purpose='backup' and((status='stored' and created_at>=cutoff) or created_at>now()-interval '15 minutes')) then return;end if;
 insert into private.cloud_backup_jobs(purpose) values('backup') returning id into job;
 perform net.http_post(url:='https://rbtqtkjnqtcnljvabisa.supabase.co/functions/v1/cloud-backup',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('job',job),timeout_milliseconds:=120000);
end $$;
create function public.cloud_archive_prune(p_commit boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare paths jsonb;begin
 select coalesce(jsonb_agg(storage_path),'[]') into paths from(select storage_path from private.cloud_backup_jobs where purpose='backup' and status='stored' order by created_at desc offset 7)x where storage_path is not null and storage_path in(select storage_path from private.cloud_backup_jobs where created_at<now()-interval '90 days');
 if p_commit then update private.cloud_backup_jobs set storage_path=null,status='failed',error_code='ARCHIVE_PRUNED' where storage_path in(select jsonb_array_elements_text(paths));end if;
 delete from private.cloud_backup_jobs where purpose='download' and created_at<now()-interval '1 day';return paths;
end $$;
revoke all on function public.cloud_archive_prune(boolean) from public,anon,authenticated;grant execute on function public.cloud_archive_prune(boolean) to service_role;
