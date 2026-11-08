-- Bookforest project only. No student data or credentials are sent by this job.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
revoke usage on schema net from public,anon,authenticated;
revoke all on all tables in schema net from public,anon,authenticated;
revoke all on all functions in schema net from public,anon,authenticated;
do $$begin
 if exists(select 1 from cron.job where jobname='bookforest-service-monitor-v1' and command<>'select private.monitor_tick();') then raise exception 'Monitor job scope mismatch';end if;
 perform cron.schedule('bookforest-service-monitor-v1','*/5 * * * *','select private.monitor_tick();');
 if exists(select 1 from cron.job where jobname='bookforest-reading-draft-cleanup-v1' and command<>'select private.purge_reading_drafts();') then raise exception 'Draft cleanup job scope mismatch';end if;
 perform cron.schedule('bookforest-reading-draft-cleanup-v1','17 * * * *','select private.purge_reading_drafts();');
 if exists(select 1 from cron.job where jobname='bookforest-monitor-history-cleanup-v1' and command<>$q$delete from cron.job_run_details where jobid in(select jobid from cron.job where jobname in ('bookforest-service-monitor-v1','bookforest-monitor-history-cleanup-v1')) and end_time<now()-interval '7 days';$q$) then raise exception 'Cleanup job scope mismatch';end if;
 perform cron.schedule('bookforest-monitor-history-cleanup-v1','41 18 * * *',$q$delete from cron.job_run_details where jobid in(select jobid from cron.job where jobname in ('bookforest-service-monitor-v1','bookforest-monitor-history-cleanup-v1')) and end_time<now()-interval '7 days';$q$);
end $$;
select private.monitor_tick();
