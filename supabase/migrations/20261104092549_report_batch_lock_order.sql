-- A batch must acquire all student locks before the shared class lock, in the
-- same order as single report creation. Otherwise another teacher's single
-- report can hold a later student while waiting for the batch's class lock.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('public.create_reviewed_report(uuid,uuid,date,date,uuid[],text,text,integer,uuid,text)'::regprocedure);
 anchor:='perform 1 from public.profiles where id=auth.uid() for update;';
 if position(anchor in definition)=0 then raise exception 'Report actor lock anchor missing';end if;
 execute replace(definition,anchor,'if not exists(select 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.classroom_id=p_classroom and e.student_id=p_student and p.role=''student'') then raise exception ''BF_FORBIDDEN'';end if;'||anchor);
 definition:=pg_get_functiondef('public.batch_report_drafts(uuid,date,date,jsonb,uuid)'::regprocedure);
 anchor:='for item in select x from jsonb_array_elements(p_items)x order by x->>''student'' loop';
 if position(anchor in definition)=0 then raise exception 'Report batch lock anchor missing';end if;
 execute replace(definition,anchor,'perform 1 from public.profiles where id=auth.uid() for update;
 perform p.id from public.profiles p where p.role=''student'' and p.id in(select (x->>''student'')::uuid from jsonb_array_elements(p_items)x) and exists(select 1 from public.enrollments e where e.classroom_id=p_classroom and e.student_id=p.id) order by p.id for update;
 perform 1 from public.classrooms where id=p_classroom for update;
 '||anchor);
end $$;
