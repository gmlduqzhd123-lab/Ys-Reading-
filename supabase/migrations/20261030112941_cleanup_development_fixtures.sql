-- Remove only the two tagged synthetic accounts created for this development verification.
-- Fresh databases and databases without these exact fixtures are unchanged.
do $$
declare fixture_ids uuid[]:=array['eb1d5432-134e-40de-a68d-46cee679d634','51035eda-57ac-4a85-a4a7-57418aa904e9']::uuid[]; classes uuid[]; groups uuid[]; n integer;
begin
 select count(*) into n from auth.users where id=any(fixture_ids);
 if n=0 then return; end if;
 if n<>2 or exists(select 1 from auth.users where id=any(fixture_ids) and
 (raw_user_meta_data->>'bookforest_test' is distinct from 'true' or email not like 'bookforest.qa.%@example.com')) then raise exception 'Fixture identity guard failed'; end if;
 select coalesce(array_agg(id),'{}'::uuid[]) into classes from public.classrooms where teacher_id=any(fixture_ids);
 select coalesce(array_agg(id),'{}'::uuid[]) into groups from public.grade_groups where owner_id=any(fixture_ids);
 if exists(select 1 from public.classrooms where id=any(classes) and name not like '테스트 전용%')
 or exists(select 1 from public.enrollments where classroom_id=any(classes) and not(student_id=any(fixture_ids)))
 or exists(select 1 from public.enrollments where student_id=any(fixture_ids) and not(classroom_id=any(classes)))
 or exists(select 1 from public.grade_members where group_id=any(groups) and not(classroom_id=any(classes))) then raise exception 'Fixture relationships require manual review'; end if;
 delete from public.plaza_reactions where student_id=any(fixture_ids) or post_id in(select id from public.plaza_posts where classroom_id=any(classes));
 delete from public.plaza_posts where student_id=any(fixture_ids) or classroom_id=any(classes);
 delete from public.reviews where teacher_id=any(fixture_ids) or entry_id in(select id from public.entries where student_id=any(fixture_ids));
 delete from public.entries where student_id=any(fixture_ids) or contest_id in(select id from public.contests where classroom_id=any(classes));
 delete from public.feedback where teacher_id=any(fixture_ids) or submission_id in(select id from public.submissions where student_id=any(fixture_ids));
 delete from public.badges where student_id=any(fixture_ids);
 delete from public.audit_events where actor_id=any(fixture_ids) or classroom_id=any(classes);
 -- These two protections are restored in this same atomic statement. Table locks
 -- prevent any concurrent client from observing the maintenance interval.
 alter table public.economy_ledger disable trigger ledger_immutable;
 delete from public.economy_ledger where student_id=any(fixture_ids) or classroom_id=any(classes);
 alter table public.economy_ledger enable trigger ledger_immutable;
 alter table public.activity_events disable trigger activity_immutable;
 delete from public.activity_events where student_id=any(fixture_ids) or classroom_id=any(classes);
 alter table public.activity_events enable trigger activity_immutable;
 delete from public.achievement_badges where student_id=any(fixture_ids) or classroom_id=any(classes);
 delete from public.shop_orders where student_id=any(fixture_ids) or classroom_id=any(classes);
 delete from public.shop_items where classroom_id=any(classes);
 delete from public.class_economy where classroom_id=any(classes);
 delete from public.reading_logs where student_id=any(fixture_ids) or classroom_id=any(classes);
 delete from public.character_profiles where student_id=any(fixture_ids);
 delete from public.class_invites where classroom_id=any(classes);
 delete from public.enrollment_requests where student_id=any(fixture_ids) or classroom_id=any(classes);
 delete from public.drafts where student_id=any(fixture_ids) or assignment_id in(select id from public.assignments where classroom_id=any(classes));
 delete from public.submissions where student_id=any(fixture_ids) or assignment_id in(select id from public.assignments where classroom_id=any(classes));
 delete from public.contests where classroom_id=any(classes) or group_id=any(groups);
 delete from public.assignments where classroom_id=any(classes);
 delete from public.grade_members where classroom_id=any(classes) or group_id=any(groups);
 delete from public.grade_groups where id=any(groups);
 delete from public.enrollments where student_id=any(fixture_ids) or classroom_id=any(classes);
 delete from public.classrooms where id=any(classes);
 delete from private.hub_requests where actor_id=any(fixture_ids);
 delete from auth.identities where user_id=any(fixture_ids);
 delete from auth.users where id=any(fixture_ids);
end $$;
