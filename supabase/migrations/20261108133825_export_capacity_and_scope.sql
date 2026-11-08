alter table private.export_batches add column source_bytes integer not null default 0;
alter table private.export_batches add column discarded boolean not null default false;
update private.export_batches b set source_bytes=coalesce((select sum(pg_column_size(entry)) from private.export_snapshots where batch_id=b.id),0);
create table private.export_requests(owner_id uuid not null references public.profiles(id) on delete cascade,request_id uuid not null,fingerprint text not null,batch_id uuid not null references private.export_batches(id) on delete cascade,created_at timestamptz not null default now(),primary key(owner_id,request_id));
alter table private.export_requests enable row level security;
revoke all on private.export_requests from public,anon,authenticated,service_role;
create function private.export_capacity(p_bytes integer default 0) returns void language plpgsql security definer set search_path='' as $$
declare active_count integer;daily_count integer;used bigint;begin
 if not private.data_session() or p_bytes<0 or p_bytes is null then raise exception 'BF_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('export:'||auth.uid()::text,0));
 select count(*) filter(where not discarded),count(*) filter(where created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),coalesce(sum(source_bytes) filter(where not discarded),0) into active_count,daily_count,used from private.export_batches where owner_id=auth.uid() and created_at>now()-interval '7 days';
 if p_bytes=0 and(active_count>=10 or daily_count>=20) then raise exception 'BF_EXPORT_QUOTA';end if;
 if used+p_bytes>67108864 then raise exception 'BF_EXPORT_STORAGE_QUOTA';end if;
end $$;
revoke all on function private.export_capacity(integer) from public,anon,service_role;grant execute on function private.export_capacity(integer) to authenticated;
create or replace function private.store_export_batch(p_title text,p_kind text,p_format text,p_names boolean,p_ids jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare batch_id uuid;requests jsonb;begin
 perform private.export_capacity(0);
 if p_title is null or length(btrim(p_title)) not between 1 and 100 or p_kind not in('reading','writing','draft') or p_format not in('docx','csv','google-docs','google-sheets') or p_names is null or jsonb_typeof(p_ids)<>'array' or jsonb_array_length(p_ids) not between 1 and 10000 then raise exception 'BF_INVALID_INPUT';end if;
 if p_format like 'google-%' and not exists(select 1 from public.profiles where id=auth.uid() and role='teacher') then raise exception 'BF_FORBIDDEN';end if;
 select jsonb_agg(gen_random_uuid()) into requests from generate_series(1,(jsonb_array_length(p_ids)+24)/25);
 delete from private.export_batches where owner_id=auth.uid() and created_at<now()-interval '7 days';
 insert into private.export_batches(owner_id,title,kind,format,include_names,ids,requests) values(auth.uid(),btrim(p_title),p_kind,p_format,p_names,p_ids,requests) returning id into batch_id;return batch_id;
end $$;
create function private.commit_export_size(p_id uuid,p_bytes integer) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.export_capacity(p_bytes);
 update private.export_batches set source_bytes=p_bytes where id=p_id and owner_id=auth.uid() and source_bytes=0 and not discarded;
 if not found then raise exception 'BF_FORBIDDEN';end if;
end $$;
revoke all on function private.commit_export_size(uuid,integer) from public,anon,service_role;grant execute on function private.commit_export_size(uuid,integer) to authenticated;
-- Filter class/date before materializing text. Latest version checks still see
-- all authorized versions of the selected mission, including outside the dates.
do $$declare d text;begin
 d:=pg_get_functiondef('public.start_export_snapshot(text,text,text,boolean,uuid,date,date,text)'::regprocedure);
 d:=replace(d,'with visible as materialized(select * from public.learning_record_index where kind=p_kind)','with visible as not materialized(select * from public.learning_record_index where kind=p_kind)');
 d:=replace(d,'if not private.data_session() or p_from>p_to','perform private.export_capacity(0); if not private.data_session() or p_from>p_to');
 d:=replace(d,'batch:=private.store_export_batch(p_title,p_kind,p_format,p_names,ids);','batch:=private.store_export_batch(p_title,p_kind,p_format,p_names,ids); perform private.commit_export_size(batch,pg_column_size(rows));');
 execute d;
end $$;
create function private.export_request(p_request uuid,p_fingerprint text,p_batch uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare old private.export_requests;begin
 if not private.data_session() or p_request is null then raise exception 'BF_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('export:'||auth.uid()::text,0));
 select * into old from private.export_requests where owner_id=auth.uid() and request_id=p_request;
 if found then
 if old.fingerprint<>p_fingerprint then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;
 if not exists(select 1 from private.export_batches where id=old.batch_id and not discarded and created_at>now()-interval '7 days') then raise exception 'BF_BATCH_EXPIRED';end if;
 return old.batch_id;end if;
 if p_batch is not null then
 if not exists(select 1 from private.export_batches where id=p_batch and owner_id=auth.uid() and not discarded) then raise exception 'BF_FORBIDDEN';end if;
 insert into private.export_requests values(auth.uid(),p_request,p_fingerprint,p_batch,now());end if;return p_batch;
end $$;
revoke all on function private.export_request(uuid,text,uuid) from public,anon,service_role;grant execute on function private.export_request(uuid,text,uuid) to authenticated;
create function public.create_export_batch(p_title text,p_kind text,p_format text,p_names boolean,p_classroom uuid,p_from date,p_to date,p_selection text,p_request uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare fingerprint text;existing uuid;begin
 fingerprint:=md5(jsonb_build_array(p_title,p_kind,p_format,p_names,p_classroom,p_from,p_to,p_selection)::text);
 existing:=private.export_request(p_request,fingerprint);
 if existing is not null then return existing;end if;
 existing:=public.start_export_snapshot(p_title,p_kind,p_format,p_names,p_classroom,p_from,p_to,p_selection);
 return private.export_request(p_request,fingerprint,existing);
end $$;
revoke all on function public.create_export_batch(text,text,text,boolean,uuid,date,date,text,uuid) from public,anon;grant execute on function public.create_export_batch(text,text,text,boolean,uuid,date,date,text,uuid) to authenticated;
create or replace function private.owns_export_batch(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.data_session() and exists(select 1 from private.export_batches where id=p_id and owner_id=auth.uid() and not discarded and created_at>now()-interval '7 days')
$$;
do $$declare d text;begin
 d:=pg_get_functiondef('public.export_batch_state(uuid,integer,boolean,text)'::regprocedure);
 d:=replace(d,'where owner_id=auth.uid() and created_at>','where owner_id=auth.uid() and not discarded and created_at>');
 d:=replace(d,'where id=p_id and owner_id=auth.uid() and created_at>','where id=p_id and owner_id=auth.uid() and not discarded and created_at>');execute d;
end $$;
create function public.discard_export_batch(p_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if not private.owns_export_batch(p_id) then raise exception 'BF_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('export:'||auth.uid()::text,0));
 update private.export_batches set discarded=true,source_bytes=0,ids='[]',requests='[]',completed='{}' where id=p_id;
 delete from private.export_snapshots where batch_id=p_id;
end $$;
revoke all on function public.discard_export_batch(uuid) from public,anon;grant execute on function public.discard_export_batch(uuid) to authenticated;
create table private.export_api_budget(owner_id uuid primary key references public.profiles(id) on delete cascade,minute timestamptz not null,total integer not null);
alter table private.export_api_budget enable row level security;revoke all on private.export_api_budget from public,anon,authenticated,service_role;
create function public.consume_export_budget() returns boolean language plpgsql security definer set search_path='' as $$declare n integer;begin
 if not private.data_session() then raise exception 'BF_FORBIDDEN';end if;
 insert into private.export_api_budget values(auth.uid(),date_trunc('minute',now()),1) on conflict(owner_id) do update set total=case when export_api_budget.minute=excluded.minute then export_api_budget.total+1 else 1 end,minute=excluded.minute returning total into n;
 return n<=60;end $$;
revoke all on function public.consume_export_budget() from public,anon;grant execute on function public.consume_export_budget() to authenticated;
-- One permission-filtered activity aggregation replaces a history scan per
-- student. Existing class, consent and delegated-teacher predicates stay intact.
do $$declare d text;begin
 d:=pg_get_functiondef('public.teacher_overview(uuid,integer)'::regprocedure);
 if position('students as materialized(select e.*,' in d)=0 or position('(select max(updated_at) from public.learning_record_index r where r.classroom_id=e.classroom_id and r.student_id=e.student_id) last_activity' in d)=0 then raise exception 'Overview activity anchor missing';end if;
 d:=replace(d,'students as materialized(select e.*,','recent_activity as materialized(select r.classroom_id,r.student_id,max(r.updated_at) last_activity from public.learning_record_index r join classes c on c.id=r.classroom_id group by r.classroom_id,r.student_id), students as materialized(select e.*,');
 d:=replace(d,'(select max(updated_at) from public.learning_record_index r where r.classroom_id=e.classroom_id and r.student_id=e.student_id) last_activity','ra.last_activity');
 d:=replace(d,'from roster e)','from roster e left join recent_activity ra using(classroom_id,student_id))');execute d;
end $$;
create index reading_class_student_activity_idx on public.reading_logs(classroom_id,student_id,updated_at desc);
create index reading_review_queue_idx on public.reading_logs(classroom_id,created_at desc,id) where status='completed' and verified_at is null;
