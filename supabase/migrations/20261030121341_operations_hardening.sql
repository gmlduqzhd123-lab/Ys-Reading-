-- Hosted projects can grant anon EXECUTE by default. This caller-only status RPC
-- needs no definer privilege; explicitly remove anonymous execution as well.
alter function public.account_session() security invoker;
revoke all on function public.account_session() from public,anon;
grant execute on function public.account_session() to authenticated;

-- Lock review parents before checking retention. A concurrent new feedback row
-- cannot slip between the expiry check and the subsequent snapshot purge.
do $$
declare definition text; needle text:='perform 1 from public.profiles where id=r.student_id for update;';
begin
 definition:=pg_get_functiondef('public.operations_purge(uuid)'::regprocedure);
 if position('for update of s;' in definition)>0 then return; end if;
 if position(needle in definition)=0 then raise exception 'Expected purge lock missing'; end if;
 definition:=replace(definition,needle,needle||$locks$
 perform 1 from public.submissions s join public.assignments a on a.id=s.assignment_id where s.student_id=r.student_id and (r.classroom_id is null or a.classroom_id=r.classroom_id) for update of s;
 perform 1 from public.entries e where e.submission_id in(select s.id from public.submissions s join public.assignments a on a.id=s.assignment_id where s.student_id=r.student_id and (r.classroom_id is null or a.classroom_id=r.classroom_id)) for update;
 perform 1 from public.reading_logs where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id) for update;
 perform 1 from public.plaza_posts where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id) for update;
 perform 1 from public.shop_orders where student_id=r.student_id and (r.classroom_id is null or classroom_id=r.classroom_id) for update;
 $locks$);
 execute definition;
end $$;
