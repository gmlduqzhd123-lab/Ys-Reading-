-- These synthetic students were removed through the new approved deletion flow.
-- Remove only their exact tagged test teachers and now-empty test classes.
do $$
declare teachers uuid[]:=array['715e8218-c603-42e0-990d-9ae78293c435','ff1cdf7e-1939-42bf-9006-5b076fc9f5f1','a2a30acb-046b-4ba6-860f-c65de1e5bdb6']::uuid[]; students uuid[]:=array['acc1b704-1b67-4234-99e3-062c3b94b8ab','7d879c03-3061-41da-8ad7-688893d32abf']::uuid[]; classes uuid[]:=array['01d8eff2-48fb-4924-8937-beaea951f553','6a93e004-f4b6-4a21-ac47-1c3145c5f65b']::uuid[]; subjects uuid[]:=array['715e8218-c603-42e0-990d-9ae78293c435','ff1cdf7e-1939-42bf-9006-5b076fc9f5f1','a2a30acb-046b-4ba6-860f-c65de1e5bdb6','acc1b704-1b67-4234-99e3-062c3b94b8ab','7d879c03-3061-41da-8ad7-688893d32abf']::uuid[]; n integer;
begin
 select count(*) into n from auth.users where id=any(teachers);
 if n=0 then return; end if;
 if n<>3 or exists(select 1 from auth.users where id=any(teachers) and (raw_user_meta_data->>'bookforest_test' is distinct from 'true' or email not like 'bookforest.qa.ops.%@example.com')) then raise exception 'Test identity guard failed'; end if;
 if exists(select 1 from auth.users where id=any(students)) then raise exception 'Student Auth deletion must complete through approved operations'; end if;
 if exists(select 1 from public.classrooms where teacher_id=any(teachers) and not(id=any(classes))) or exists(select 1 from public.classrooms where id=any(classes) and (not(teacher_id=any(teachers)) or name not like '테스트 전용%')) or exists(select 1 from public.grade_groups where owner_id=any(teachers)) then raise exception 'Test ownership requires manual review'; end if;
 if exists(select 1 from public.enrollments where classroom_id=any(classes)) or exists(select 1 from public.submissions s join public.assignments a on a.id=s.assignment_id where a.classroom_id=any(classes)) or exists(select 1 from public.reading_logs where classroom_id=any(classes)) or exists(select 1 from public.economy_ledger where classroom_id=any(classes)) or exists(select 1 from public.activity_events where classroom_id=any(classes)) then raise exception 'Test learning purge must complete first'; end if;
 delete from private.account_jobs where actor_id=any(subjects);
 delete from private.operation_replays where actor_id=any(subjects);
 delete from private.consent_requests where student_id=any(students);
 delete from private.deletion_requests where student_id=any(students);
 delete from private.operations_audit where actor_id=any(subjects) or subject_id=any(subjects) or classroom_id=any(classes);
 delete from private.operators where user_id=any(teachers);
 delete from private.retention_policies where classroom_id=any(classes);
 delete from private.teacher_requests where user_id=any(subjects);
 delete from private.hub_requests where actor_id=any(subjects);
 delete from public.audit_events where actor_id=any(subjects) or classroom_id=any(classes);
 delete from public.class_invites where classroom_id=any(classes);
 delete from public.enrollment_requests where classroom_id=any(classes);
 delete from public.assignments where classroom_id=any(classes);
 delete from public.class_economy where classroom_id=any(classes);
 delete from public.classrooms where id=any(classes);
 delete from auth.identities where user_id=any(teachers);
 delete from auth.users where id=any(teachers);
end $$;
