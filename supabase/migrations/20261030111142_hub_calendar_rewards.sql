-- Compute month boundaries in Korean civil time, before converting to UTC.
do $$
declare definition text; old_month text := 'end_at:=start_at+interval ''1 month'';';
 old_attendance text := 'private.award_activity(actor.id,cls,''attendance'',(now() at time zone ''Asia/Seoul'')::date::text)';
 old_reading text := E'when ''reading_verify'' then\n select * into log from public.reading_logs where id=target for update;';
begin
 definition := pg_get_functiondef('public.hub_command(text,jsonb,uuid)'::regprocedure);
 if position(old_month in definition)=0 or position(old_attendance in definition)=0 or position(old_reading in definition)=0 then raise exception 'Unexpected hub command version'; end if;
 definition := replace(definition,old_month,'end_at:=((period||''-01'')::date+interval ''1 month'')::timestamp at time zone ''Asia/Seoul'';');
 definition := replace(definition,old_attendance,'private.award_activity(actor.id,cls,''attendance'',cls::text||'':''||(now() at time zone ''Asia/Seoul'')::date::text)');
 definition := replace(definition,old_reading,E'when ''reading_verify'' then\n select * into log from public.reading_logs where id=target;\n if not found or not private.is_teacher(log.classroom_id) then raise exception ''BF_FORBIDDEN''; end if;\n perform 1 from public.profiles where id=log.student_id for update;\n select * into log from public.reading_logs where id=target for update;');
 execute definition;
end $$;
-- Canonicalize existing attendance identities without changing awarded amounts.
alter table public.activity_events disable trigger activity_immutable;
update public.activity_events set source_key=classroom_id::text||':'||source_key where kind='attendance' and source_key ~ '^\d{4}-\d{2}-\d{2}$';
alter table public.activity_events enable trigger activity_immutable;
alter table private.hub_requests enable row level security;
revoke all on private.hub_requests from anon,authenticated;
drop policy activity_events_read on public.activity_events;
create policy activity_events_read on public.activity_events for select to authenticated using(
 (student_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and consent_status='verified')) or private.is_teacher(classroom_id));
drop policy achievements_read on public.achievement_badges;
create policy achievements_read on public.achievement_badges for select to authenticated using(
 (student_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and consent_status='verified')) or private.is_teacher(classroom_id));
