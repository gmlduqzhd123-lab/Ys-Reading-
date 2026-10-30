-- Published work stops circulating when its author no longer participates.
create or replace function private.plaza_visible(p_post uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.plaza_posts p where p.id=p_post and
 (p.student_id=auth.uid() or private.is_teacher(p.classroom_id) or (p.status='published'
 and exists(select 1 from public.enrollments e join public.profiles owner on owner.id=e.student_id
 where e.classroom_id=p.classroom_id and e.student_id=p.student_id and e.active and owner.consent_status='verified')
 and (case when p.group_id is null then private.is_active_student(p.classroom_id) else private.in_grade(p.group_id) end))))
$$;
create or replace function public.hub_summary() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'xp',coalesce((select sum(xp) from public.activity_events where student_id=auth.uid()),0),
 'balances',coalesce((select jsonb_object_agg(classroom_id,amount) from (
 select classroom_id,sum(amount) amount from public.economy_ledger where student_id=auth.uid() group by classroom_id
 ) totals),'{}'::jsonb),
 'studentBalances',case when exists(select 1 from public.profiles where id=auth.uid() and role='teacher') then
 coalesce((select jsonb_agg(jsonb_build_object('studentId',student_id,'classroomId',classroom_id,'balance',amount)) from (
 select student_id,classroom_id,sum(amount) amount from public.economy_ledger group by student_id,classroom_id
 ) totals),'[]'::jsonb) else '[]'::jsonb end)
$$;
