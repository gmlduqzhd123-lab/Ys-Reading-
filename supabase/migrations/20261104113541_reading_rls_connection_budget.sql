-- Resolve the current teacher's permitted classes once per statement, rather
-- than rechecking the same teacher/class relationship for every historical row.
-- No caller-supplied actor is accepted; this private helper lists only classes
-- already allowed by the existing, session-checked staff permission function.
create function private.reading_class_access() returns table(classroom_id uuid,owned boolean)
language sql stable security definer set search_path='' as $$
 with actor as materialized(select auth.uid() id where private.data_session())
 select c.id,c.teacher_id=a.id from actor a join public.classrooms c
 on private.staff_permission_for(a.id,c.id,'read');
$$;
revoke all on function private.reading_class_access() from public,anon,authenticated,service_role;
grant execute on function private.reading_class_access() to authenticated;

alter policy reading_logs_read on public.reading_logs using(
 (student_id=(select auth.uid()) and private.is_active_student(classroom_id))
 or classroom_id in(select a.classroom_id from private.reading_class_access() a where a.owned)
);
alter policy staff_reading_read on public.reading_logs using(
 classroom_id in(select a.classroom_id from private.reading_class_access() a where not a.owned)
 and private.staff_learning_visible(student_id,classroom_id)
);
