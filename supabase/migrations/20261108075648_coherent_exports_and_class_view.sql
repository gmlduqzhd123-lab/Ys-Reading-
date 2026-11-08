-- Frozen export content remains subject to the live source RLS on every read.
create function private.owns_export_batch(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.data_session() and exists(select 1 from private.export_batches where id=p_id and owner_id=auth.uid() and created_at>now()-interval '7 days')
$$;
revoke all on function private.owns_export_batch(uuid) from public,anon,service_role;grant execute on function private.owns_export_batch(uuid) to authenticated;
create table private.export_snapshots(batch_id uuid not null references private.export_batches(id) on delete cascade,kind text not null,record_id uuid not null,entry jsonb not null,primary key(batch_id,record_id));
alter table private.export_snapshots enable row level security;
revoke all on private.export_snapshots from public,anon,authenticated,service_role;
grant select,insert on private.export_snapshots to authenticated;
create policy export_snapshot_read on private.export_snapshots for select to authenticated using(private.owns_export_batch(batch_id) and exists(select 1 from public.learning_record_index r where r.kind=export_snapshots.kind and r.id=record_id));
create policy export_snapshot_insert on private.export_snapshots for insert to authenticated with check(private.owns_export_batch(batch_id) and exists(select 1 from public.learning_record_index r where r.kind=export_snapshots.kind and r.id=record_id));

create function public.start_export_snapshot(p_title text,p_kind text,p_format text,p_names boolean,p_classroom uuid default null,p_from date default null,p_to date default null,p_selection text default 'all') returns uuid language plpgsql security invoker set search_path='' as $$
declare rows jsonb;ids jsonb;batch uuid;begin
 if not private.data_session() or p_from>p_to or p_selection is null or p_selection not in('all','latest','completed') then raise exception 'BF_INVALID_INPUT';end if;
 with visible as materialized(select * from public.learning_record_index where kind=p_kind), selected as (
 select r.* from visible r where (p_classroom is null or r.classroom_id=p_classroom) and(p_from is null or r.recorded_on>=p_from) and(p_to is null or r.recorded_on<=p_to)
 and (p_selection<>'completed' or r.verified)
 and(p_selection<>'latest' or p_kind<>'writing' or not exists(select 1 from visible v where v.student_id=r.student_id and v.assignment_id=r.assignment_id and v.version>r.version))
 order by r.recorded_on,r.id limit 10001)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'entry',jsonb_build_object('title',coalesce(nullif(title,''),'작성 중인 글'),'body',body,'question',question,'meta',case when p_names then student_name||' · ' else '' end||recorded_on||' · '||case when p_kind='reading' then coalesce((select concat_ws(' · ',l.book->>'author',l.book->>'publisher',l.book->>'isbn') from public.reading_logs l where l.id=selected.id),'') else coalesce(activity,'') end||case when p_kind='writing' then ' · '||version||'번째 글' when p_kind='draft' then ' · 작성 중인 초안' else '' end)) order by recorded_on,id),'[]') into rows from selected;
 if pg_column_size(rows)>16000000 then raise exception 'BF_EXPORT_TOO_LARGE';end if;
 select coalesce(jsonb_agg(v->'id'),'[]') into ids from jsonb_array_elements(rows) v;
 batch:=private.store_export_batch(p_title,p_kind,p_format,p_names,ids);
 insert into private.export_snapshots(batch_id,kind,record_id,entry) select batch,p_kind,(v->>'id')::uuid,v->'entry' from jsonb_array_elements(rows) v;
 return batch;
end $$;
revoke all on function public.start_export_snapshot(text,text,text,boolean,uuid,date,date,text) from public,anon;grant execute on function public.start_export_snapshot(text,text,text,boolean,uuid,date,date,text) to authenticated;
create function public.export_batch_content(p_id uuid,p_part integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare b jsonb;entries jsonb;begin
 b:=public.export_batch_state(p_id,p_part);
 select jsonb_agg(s.entry order by ids.ordinality) into entries from jsonb_array_elements_text(b->'ids') with ordinality ids(id,ordinality) join private.export_snapshots s on s.batch_id=p_id and s.record_id=ids.id::uuid;
 if coalesce(jsonb_array_length(entries),0)<>jsonb_array_length(b->'ids') then raise exception 'BF_EXPORT_ACCESS_CHANGED';end if;
 return jsonb_build_object('kind',b->'kind','format',b->'format','requestId',b->'requestId','includeNames',b->'includeNames','ids',b->'ids','bundle',jsonb_build_object('title',left(b->>'title',80)||' ('||(p_part+1)||'-'||(b->>'parts')||')','entries',entries));
end $$;
revoke all on function public.export_batch_content(uuid,integer) from public,anon;grant execute on function public.export_batch_content(uuid,integer) to authenticated;
create function public.check_export_part_access(p_id uuid,p_part integer) returns boolean language plpgsql security invoker set search_path='' as $$begin perform public.export_batch_content(p_id,p_part);return true;end $$;
revoke all on function public.check_export_part_access(uuid,integer) from public,anon;grant execute on function public.check_export_part_access(uuid,integer) to authenticated;

-- Display preferences change navigation, never database authorization.
alter table public.classrooms add column simple_student_view boolean not null default false;
alter table public.classrooms add column reading_guidance text not null default 'line' check(reading_guidance in('line','guided','free'));
create function public.set_class_student_view(p_classroom uuid,p_simple boolean,p_guidance text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.data_session() or not private.is_teacher(p_classroom) then raise exception 'BF_FORBIDDEN';end if;
 if p_simple is null or p_guidance is null or p_guidance not in('line','guided','free') then raise exception 'BF_INVALID_INPUT';end if;
 update public.classrooms set simple_student_view=p_simple,reading_guidance=p_guidance where id=p_classroom;
end $$;
revoke all on function public.set_class_student_view(uuid,boolean,text) from public,anon;grant execute on function public.set_class_student_view(uuid,boolean,text) to authenticated;
do $$declare d text;begin
 d:=pg_get_functiondef('public.service_release_contract()'::regprocedure);
 if position('''scopeCache''' in d)=0 then raise exception 'Release metadata anchor missing';end if;
 d:=replace(d,'''scopeCache'',','''coherentExports'',to_regprocedure(''public.start_export_snapshot(text,text,text,boolean,uuid,date,date,text)'') is not null,''studentView'',to_regprocedure(''public.set_class_student_view(uuid,boolean,text)'') is not null,''scopeCache'',');execute d;
end $$;
