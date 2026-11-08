create table private.reading_drafts(
 student_id uuid not null references public.profiles(id) on delete cascade,
 classroom_id uuid not null references public.classrooms(id) on delete cascade,
 context text not null,payload jsonb not null,revision integer not null default 1,
 last_request uuid not null,updated_at timestamptz not null default now(),
 primary key(student_id,classroom_id,context),check(octet_length(payload::text)<=100000)
);
create index reading_drafts_expiry on private.reading_drafts(updated_at);
alter table private.reading_drafts enable row level security;
revoke all on private.reading_drafts from public,anon,authenticated,service_role;

create function public.reading_draft(p_action text,p_classroom uuid,p_record uuid default null,p_payload jsonb default '{}',p_revision integer default 0,p_request uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.reading_drafts;ctx text:=coalesce(p_record::text,'new');k text;v jsonb;begin
 if not private.is_active_student(p_classroom) or not exists(select 1 from public.classrooms where id=p_classroom and term_state<>'archived') then raise exception 'BF_FORBIDDEN';end if;
 if p_record is not null and not exists(select 1 from public.reading_logs where id=p_record and student_id=auth.uid() and classroom_id=p_classroom and verified_at is null) then raise exception 'BF_FORBIDDEN';end if;
 if p_action is null or p_action not in('load','save','discard') or p_revision is null or p_revision<0 then raise exception 'BF_INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended('reading-draft:'||auth.uid()::text||':'||p_classroom::text||':'||ctx,0));
 delete from private.reading_drafts where student_id=auth.uid() and updated_at<now()-interval '7 days';
 select * into d from private.reading_drafts where student_id=auth.uid() and classroom_id=p_classroom and context=ctx for update;
 if p_action='load' then return jsonb_build_object('draft',case when d.student_id is null then null else jsonb_build_object('payload',d.payload,'revision',d.revision,'updatedAt',d.updated_at) end);end if;
 if p_request is null then raise exception 'BF_INVALID_INPUT';end if;
 if p_action='save' and d.last_request=p_request then
 if d.payload is distinct from p_payload then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;
 return jsonb_build_object('revision',d.revision,'updatedAt',d.updated_at);end if;
 if coalesce(d.revision,0)<>p_revision then raise exception 'BF_STALE_REVISION';end if;
 if p_action='discard' then
 delete from private.reading_drafts where student_id=auth.uid() and classroom_id=p_classroom and context=ctx;
 return jsonb_build_object('discarded',true);end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>100000 or (select count(*) from jsonb_object_keys(p_payload))<>10 or not (p_payload ?& array['title','author','publisher','isbn','thumbnail','readOn','status','thought','question','guidance']) then raise exception 'BF_INVALID_INPUT';end if;
 for k,v in select * from jsonb_each(p_payload) loop
 if jsonb_typeof(v)<>'string' or length(v#>>'{}')>(case k when 'thought' then 10000 when 'guidance' then 16000 when 'question' then 2000 when 'thumbnail' then 1000 when 'isbn' then 40 when 'readOn' then 10 when 'status' then 9 else 200 end) then raise exception 'BF_INVALID_INPUT';end if;
 end loop;
 if p_payload->>'status' not in('reading','completed') or p_payload->>'readOn' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'BF_INVALID_INPUT';end if;
 begin v:=(p_payload->>'guidance')::jsonb;exception when others then raise exception 'BF_INVALID_INPUT';end;
 if jsonb_typeof(v) is distinct from 'object' or (select count(*) from jsonb_object_keys(v))<>4 or not(v ?& array['mode','scene','feeling','idea']) or v->>'mode' not in('line','guided','free') or exists(select 1 from jsonb_each(v) x where jsonb_typeof(x.value)<>'string') or length(v->>'scene')>2000 or length(v->>'feeling')>1000 or length(v->>'idea')>2000 then raise exception 'BF_INVALID_INPUT';end if;
 insert into private.reading_drafts values(auth.uid(),p_classroom,ctx,p_payload,1,p_request,clock_timestamp())
 on conflict(student_id,classroom_id,context) do update set payload=excluded.payload,revision=reading_drafts.revision+1,last_request=excluded.last_request,updated_at=excluded.updated_at
 returning * into d;
 return jsonb_build_object('revision',d.revision,'updatedAt',d.updated_at);
end $$;
revoke all on function public.reading_draft(text,uuid,uuid,jsonb,integer,uuid) from public,anon;
grant execute on function public.reading_draft(text,uuid,uuid,jsonb,integer,uuid) to authenticated;

create function private.purge_reading_drafts() returns void language sql security invoker set search_path='' as $$delete from private.reading_drafts where updated_at<now()-interval '7 days'$$;
revoke all on function private.purge_reading_drafts() from public,anon,authenticated,service_role;
