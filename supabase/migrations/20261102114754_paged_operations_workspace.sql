create function public.operations_workspace(p_classroom uuid default null,p_filters jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare op boolean;cls uuid;sp integer:=coalesce((p_filters->>'studentPage')::integer,1);cp integer:=coalesce((p_filters->>'consentPage')::integer,1);dp integer:=coalesce((p_filters->>'deletionPage')::integer,1);ap integer:=coalesce((p_filters->>'auditPage')::integer,1);q text:=btrim(coalesce(p_filters->>'q',''));
begin
 if not private.data_session() or not exists(select 1 from public.profiles where id=auth.uid() and role='teacher') then raise exception 'BF_FORBIDDEN';end if;op:=private.is_operator();
 if p_filters is null or jsonb_typeof(p_filters)<>'object' or octet_length(p_filters::text)>2000 or length(q)>80 or least(sp,cp,dp,ap)<1 or greatest(sp,cp,dp,ap)>100000 then raise exception 'BF_INVALID_INPUT';end if;
 cls:=p_classroom;if cls is not null and not exists(select 1 from public.classrooms where id=cls and (op or teacher_id=auth.uid())) then raise exception 'BF_FORBIDDEN';end if;
 if cls is null then select id into cls from public.classrooms where op or teacher_id=auth.uid() order by term_state,name,id limit 1;end if;
 return jsonb_build_object('operator',op,'selected',cls,'pages',jsonb_build_object('studentPage',sp,'consentPage',cp,'deletionPage',dp,'auditPage',ap,'q',q),
 'totals',jsonb_build_object('students',(select count(*) from public.enrollments e join public.profiles p on p.id=e.student_id left join private.managed_accounts m on m.student_id=p.id where e.classroom_id=cls and (q='' or position(lower(q) in lower(p.display_name||' '||coalesce(m.login_id,'')))>0)),
 'consents',(select count(*) from private.consent_requests r where op or r.classroom_id=cls),
 'deletions',(select count(*) from private.deletion_requests r where op or r.classroom_id=cls),
 'audit',(select count(*) from private.operations_audit a where op or a.actor_id=auth.uid() or private.is_teacher(a.classroom_id))),
 'groups',case when op then coalesce((select jsonb_agg(to_jsonb(x)) from(select id,name,owner_id from public.grade_groups order by name,id limit 1000)x),'[]') else '[]'::jsonb end,
 'classes',coalesce((select jsonb_agg(to_jsonb(x)) from(select c.id,c.name,c.teacher_id,r.days retention_days from public.classrooms c left join private.retention_policies r on r.classroom_id=c.id where op or c.teacher_id=auth.uid() order by c.name,c.id limit 1000)x),'[]'),
 'students',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('last_activity',private.last_student_activity(x.id,cls))) from(
 select p.id,p.display_name,p.consent_status,p.account_active,p.must_change_password,e.classroom_id,e.active,m.login_id,m.classroom_id managed_classroom_id,(op or (m.classroom_id=e.classroom_id and private.is_teacher(m.classroom_id))) can_reset
 from public.enrollments e join public.profiles p on p.id=e.student_id left join private.managed_accounts m on m.student_id=p.id where e.classroom_id=cls and (q='' or position(lower(q) in lower(p.display_name||' '||coalesce(m.login_id,'')))>0) order by p.display_name,p.id limit 50 offset (sp-1)*50)x),'[]'),
 'teachers',case when op then coalesce((select jsonb_agg(to_jsonb(x)) from(select id,display_name,account_active from public.profiles where role='teacher' order by display_name,id limit 1000)x),'[]') else '[]'::jsonb end,
 'teacher_requests',case when op then coalesce((select jsonb_agg(to_jsonb(x)) from(select r.user_id,r.status,p.display_name from private.teacher_requests r join public.profiles p on p.id=r.user_id where r.status='pending' order by r.user_id limit 1000)x),'[]') else '[]'::jsonb end,
 'consents',coalesce((select jsonb_agg(to_jsonb(x)) from(select r.*,coalesce(p.display_name,'삭제된 계정') student_name,c.name classroom_name from private.consent_requests r left join public.profiles p on p.id=r.student_id left join public.classrooms c on c.id=r.classroom_id where op or r.classroom_id=cls order by (r.status='pending') desc,r.created_at desc,r.id limit 50 offset (cp-1)*50)x),'[]'),
 'deletions',coalesce((select jsonb_agg(to_jsonb(x)) from(select r.*,coalesce(p.display_name,'삭제된 계정') student_name from private.deletion_requests r left join public.profiles p on p.id=r.student_id where op or r.classroom_id=cls order by (r.status in ('pending','approved')) desc,r.created_at desc,r.id limit 50 offset (dp-1)*50)x),'[]'),
 'audit',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from private.operations_audit a where op or a.actor_id=auth.uid() or private.is_teacher(a.classroom_id) order by a.created_at desc,a.id limit 50 offset (ap-1)*50)x),'[]'));
end $$;
revoke all on function public.operations_workspace(uuid,jsonb) from public,anon;grant execute on function public.operations_workspace(uuid,jsonb) to authenticated;
create function public.account_self_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not private.session_ok(true) then raise exception 'BF_ACCOUNT_BLOCKED';end if;return jsonb_build_object('operator',private.is_operator(),'deletions',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from private.deletion_requests where student_id=auth.uid() order by created_at desc,id limit 50)x),'[]'),'students','[]'::jsonb,'teachers','[]'::jsonb,'classes','[]'::jsonb,'groups','[]'::jsonb,'consents','[]'::jsonb,'teacher_requests','[]'::jsonb,'audit','[]'::jsonb);end $$;
revoke all on function public.account_self_state() from public,anon;grant execute on function public.account_self_state() to authenticated;
create or replace function public.operations_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if exists(select 1 from public.profiles where id=auth.uid() and role='teacher') then return public.operations_workspace();end if;return public.account_self_state();end $$;
revoke all on function public.operations_state() from public,anon;grant execute on function public.operations_state() to authenticated;
create function public.start_roster_state(p_classroom uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not private.data_session() or not private.is_teacher(p_classroom) then raise exception 'BF_FORBIDDEN';end if;
return jsonb_build_object('total',(select count(*) from public.enrollments where classroom_id=p_classroom),'existing',coalesce((select jsonb_agg(x.login_id) from(select m.login_id from private.managed_accounts m join public.enrollments e on e.student_id=m.student_id where e.classroom_id=p_classroom order by m.login_id limit 1000)x),'[]'));
end $$;
revoke all on function public.start_roster_state(uuid) from public,anon;grant execute on function public.start_roster_state(uuid) to authenticated;
