-- Serialize password jobs for one account, even when two different teachers act.
create function private.password_job_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if new.kind not in ('reset_password','change_password') then return new; end if;
 target:=(new.plan->>'studentId')::uuid;
 perform 1 from public.profiles where id=target for update;
 if exists(select 1 from private.account_jobs j where j.id<>new.id and j.kind in ('reset_password','change_password') and j.plan->>'studentId'=target::text and not j.done and j.lease_until>clock_timestamp()) then raise exception 'BF_BUSY'; end if;
 return new;
end $$;
revoke all on function private.password_job_guard() from public,anon,authenticated;
create trigger password_job_guard before insert or update of lease on private.account_jobs for each row execute function private.password_job_guard();

-- A retention request can become ineligible when a teacher adds feedback.
-- Operators must be able to cancel an approved request before its purge starts.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.operations_command(text,jsonb,uuid)'::regprocedure);
 if position('when ''deletion_cancel'' then' in definition)>0 then return; end if;
 if position('when ''class_handover'' then' in definition)=0 then raise exception 'Expected operations command missing'; end if;
 definition:=replace(definition,'when ''class_handover'' then',
 $insert$when 'deletion_cancel' then
 if not op then raise exception 'BF_FORBIDDEN'; end if;
 select * into r from private.deletion_requests where id=req and status='approved' for update;
 if not found then raise exception 'BF_NOT_FOUND'; end if;
 target:=r.student_id;cls:=r.classroom_id;
 update private.deletion_requests set status='rejected',decided_by=a.id where id=req;
 if r.scope='account' then update public.profiles set account_active=true where id=target; end if;
 when 'class_handover' then$insert$);
 execute definition;
end $$;
