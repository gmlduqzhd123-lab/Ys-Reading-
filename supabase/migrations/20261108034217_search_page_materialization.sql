-- Cache the SAME visibility predicate once per enrolled member, not once per
-- historical record. Revocation, consent, account state and deletion holds
-- continue to be checked by the existing function in every SQL statement.
create function private.visible_learning_members() returns table(classroom_id uuid,student_id uuid) language sql stable security definer set search_path='' as $$
 select e.classroom_id,e.student_id from public.enrollments e join private.reading_class_access() a on a.classroom_id=e.classroom_id where private.staff_learning_visible(e.student_id,e.classroom_id)
$$;
revoke all on function private.visible_learning_members() from public,anon,service_role;grant execute on function private.visible_learning_members() to authenticated;
do $$declare d text;begin
 d:=pg_get_viewdef('public.learning_record_index'::regclass,true);
 if position('private.staff_learning_visible(r.student_id, r.classroom_id)' in d)=0 or position('private.staff_learning_visible(s.student_id, a.classroom_id)' in d)=0 then raise exception 'Record visibility anchor missing';end if;
 d:=replace(d,'private.staff_learning_visible(r.student_id, r.classroom_id)','((r.classroom_id,r.student_id) in(select v.classroom_id,v.student_id from private.visible_learning_members() v))');
 d:=replace(d,'private.staff_learning_visible(s.student_id, a.classroom_id)','((a.classroom_id,s.student_id) in(select v.classroom_id,v.student_id from private.visible_learning_members() v))');
 execute 'create or replace view public.learning_record_index with(security_invoker=true) as '||d;
 d:=pg_get_functiondef('public.record_search(text,uuid,uuid,text,date,date,text,integer)'::regprocedure);
 d:=replace(d,'private.is_teacher(p_classroom)','private.staff_permission(p_classroom,''read'')');
 if position('from selected s join public.learning_record_index r on r.id=s.id and r.kind=s.kind' in d)=0 then raise exception 'Page materialization anchor missing';end if;
 d:=replace(d,'from selected s join public.learning_record_index r on r.id=s.id and r.kind=s.kind','from selected s cross join lateral(select r.* from public.learning_record_index r where r.id=s.id and r.kind=s.kind limit 1) r');execute d;
end $$;
alter policy staff_reading_read on public.reading_logs using(
 classroom_id in(select a.classroom_id from private.reading_class_access() a where not a.owned)
 and(classroom_id,student_id) in(select v.classroom_id,v.student_id from private.visible_learning_members() v)
);
