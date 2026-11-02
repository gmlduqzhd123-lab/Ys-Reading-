create index account_jobs_issuance_actor_time_idx on private.account_jobs(actor_id,created_at desc) where kind='create_students';
create function public.issuance_jobs(p_classroom uuid,p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not private.data_session() or not private.is_teacher(p_classroom) then raise exception 'BF_FORBIDDEN';end if;if p_page is null or p_page not between 1 and 100000 then raise exception 'BF_INVALID_INPUT';end if;
return jsonb_build_object('total',(select count(*) from private.account_jobs where actor_id=auth.uid() and kind='create_students' and plan->>'classroomId'=p_classroom::text),'page',p_page,'jobs',coalesce((select jsonb_agg(to_jsonb(x)) from(select j.request_id,j.created_at,j.done,j.lease_until,
 (select count(*) from jsonb_each_text(j.results) where value='done') completed,
 (select jsonb_agg(jsonb_build_object('loginId',s.value->>'loginId','name',s.value->>'name','completed',coalesce(j.results->>(s.ordinality-1)::text='done',false)) order by s.ordinality) from jsonb_array_elements(j.plan->'items') with ordinality s(value,ordinality)) students
 from private.account_jobs j where j.actor_id=auth.uid() and j.kind='create_students' and j.plan->>'classroomId'=p_classroom::text order by j.created_at desc,j.id limit 20 offset (p_page-1)*20)x),'[]'));
end $$;
revoke all on function public.issuance_jobs(uuid,integer) from public,anon;grant execute on function public.issuance_jobs(uuid,integer) to authenticated;
create function public.resume_issuance_job(p_payload jsonb,p_request_id uuid,p_fingerprint text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.account_jobs;expected jsonb;cls uuid;
begin if not private.data_session() then raise exception 'BF_FORBIDDEN';end if;if p_request_id is null or p_fingerprint is null or length(p_fingerprint)<>64 or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>12000 then raise exception 'BF_INVALID_INPUT';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into j from private.account_jobs where actor_id=auth.uid() and request_id=p_request_id and kind='create_students' for update;
 if not found then raise exception 'BF_NOT_FOUND';end if;cls:=(j.plan->>'classroomId')::uuid;
 if not private.is_teacher(cls) then raise exception 'BF_FORBIDDEN';end if;if not exists(select 1 from public.classrooms where id=cls and term_state='open') then raise exception 'BF_CLASS_ARCHIVED';end if;
 select jsonb_build_object('classroomId',cls,'students',jsonb_agg(jsonb_build_object('loginId',v->>'loginId','name',v->>'name') order by n)) into expected from jsonb_array_elements(j.plan->'items') with ordinality x(v,n);
 if expected<>p_payload then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;
 if j.done then return to_jsonb(j);end if;if j.lease_until>clock_timestamp() then raise exception 'BF_BUSY';end if;
 update private.account_jobs set fingerprint=p_fingerprint,lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes' where id=j.id returning * into j;
 perform private.ops_audit('issuance_resumed',null,cls);return to_jsonb(j);
end $$;
revoke all on function public.resume_issuance_job(jsonb,uuid,text) from public,anon;grant execute on function public.resume_issuance_job(jsonb,uuid,text) to authenticated;
create function public.check_roster_logins(p_classroom uuid,p_logins text[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not private.data_session() or not private.is_teacher(p_classroom) then raise exception 'BF_FORBIDDEN';end if;if coalesce(cardinality(p_logins),0) not between 1 and 300 or exists(select 1 from unnest(p_logins)x where x is null or x!~'^[a-z0-9][a-z0-9_-]{3,31}$') then raise exception 'BF_INVALID_INPUT';end if;
return coalesce((select jsonb_agg(login_id) from private.managed_accounts where login_id=any(p_logins)),'[]');end $$;
revoke all on function public.check_roster_logins(uuid,text[]) from public,anon;grant execute on function public.check_roster_logins(uuid,text[]) to authenticated;
