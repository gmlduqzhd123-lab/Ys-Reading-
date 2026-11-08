create table private.teacher_work_drafts(owner_id uuid not null references public.profiles(id) on delete cascade,scope text not null,context jsonb not null,payload jsonb,revision integer not null,request_id uuid,fingerprint text,updated_at timestamptz not null default now(),primary key(owner_id,scope,context));
alter table private.teacher_work_drafts enable row level security;
revoke all on private.teacher_work_drafts from public,anon,authenticated,service_role;
create function private.teacher_work_access(p_scope text,p_context jsonb,p_payload jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
declare cls uuid;student uuid;ids uuid[];n integer;begin
 if not private.data_session() or not exists(select 1 from public.profiles where id=auth.uid() and role='teacher') then return false;end if;
 cls:=nullif(p_context->>'classroom','')::uuid;
 if p_scope='settings' then return cls is not null and private.is_teacher(cls);end if;
 if p_scope='report' then student:=(p_context->>'student')::uuid;return cls is not null and private.staff_permission(cls,'read') and private.staff_learning_visible(student,cls);end if;
 if p_scope<>'review' or p_context->>'kind' not in('writing','reading') then return false;end if;
 if cls is not null and not private.staff_permission(cls,'review') then return false;end if;
 if cls is null and not exists(select 1 from private.reading_class_access() a where private.staff_permission(a.classroom_id,'review')) then return false;end if;
 if p_payload is null then return true;end if;
 if jsonb_typeof(p_payload->'selected')<>'array' or jsonb_array_length(p_payload->'selected') not between 1 and 20 then return false;end if;
 select array_agg(distinct value::uuid) into ids from jsonb_array_elements_text(p_payload->'selected');
 if p_context->>'kind'='writing' then
 select count(*) into n from public.submissions s join public.assignments a on a.id=s.assignment_id where s.id=any(ids) and(cls is null or a.classroom_id=cls) and private.staff_permission(a.classroom_id,'review') and private.staff_learning_visible(s.student_id,a.classroom_id);
 else
 select count(*) into n from public.reading_logs r where r.id=any(ids) and(cls is null or r.classroom_id=cls) and private.staff_permission(r.classroom_id,'review') and private.staff_learning_visible(r.student_id,r.classroom_id);end if;
 return n=cardinality(ids);
 exception when invalid_text_representation then return false;
end $$;
revoke all on function private.teacher_work_access(text,jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.teacher_work_draft(p_action text,p_scope text,p_context jsonb,p_payload jsonb default null,p_revision integer default 0,p_request uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare old private.teacher_work_drafts;fp text;rev integer;begin
 if p_action is null or p_action not in('get','save','discard') or p_scope is null or p_scope not in('review','report','settings') or jsonb_typeof(p_context)<>'object' or octet_length(p_context::text)>1000 or not private.teacher_work_access(p_scope,p_context,null) then raise exception 'BF_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-draft:'||auth.uid()::text,0));
 delete from private.teacher_work_drafts where owner_id=auth.uid() and updated_at<now()-interval '7 days';
 select * into old from private.teacher_work_drafts where owner_id=auth.uid() and scope=p_scope and context=p_context for update;
 if p_action='get' then
 if old.payload is not null and not private.teacher_work_access(p_scope,p_context,old.payload) then raise exception 'BF_FORBIDDEN';end if;
 return jsonb_build_object('revision',coalesce(old.revision,0),'payload',old.payload,'updatedAt',old.updated_at);end if;
 if p_request is null or p_revision is null or p_revision<0 then raise exception 'BF_INVALID_INPUT';end if;
 if p_action='save' and(jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>12000 or not private.teacher_work_access(p_scope,p_context,p_payload)) then raise exception 'BF_FORBIDDEN';end if;
 fp:=md5(jsonb_build_array(p_action,p_payload)::text);
 if old.request_id=p_request then
 if old.fingerprint<>fp then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;return jsonb_build_object('revision',old.revision);end if;
 if coalesce(old.revision,0)<>p_revision then raise exception 'BF_STALE_REVISION';end if;
 if old.owner_id is null and(select count(*) from private.teacher_work_drafts where owner_id=auth.uid())>=100 then raise exception 'BF_DRAFT_QUOTA';end if;
 rev:=p_revision+1;
 insert into private.teacher_work_drafts values(auth.uid(),p_scope,p_context,case when p_action='save' then p_payload else null end,rev,p_request,fp,now())
 on conflict(owner_id,scope,context) do update set payload=excluded.payload,revision=excluded.revision,request_id=excluded.request_id,fingerprint=excluded.fingerprint,updated_at=excluded.updated_at;
 return jsonb_build_object('revision',rev);
end $$;
revoke all on function public.teacher_work_draft(text,text,jsonb,jsonb,integer,uuid) from public,anon;grant execute on function public.teacher_work_draft(text,text,jsonb,jsonb,integer,uuid) to authenticated;
-- Expired private notes are removed even if the teacher never visits again.
do $$declare d text;begin
 d:=pg_get_functiondef('private.purge_operations()'::regprocedure);
 d:=replace(d,'begin','begin delete from private.teacher_work_drafts where updated_at<now()-interval ''7 days'';');execute d;
end $$;
