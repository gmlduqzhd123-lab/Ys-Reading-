create function private.purge_operations() returns void language plpgsql security definer set search_path='' as $$begin
 delete from private.export_batches where created_at<now()-interval '7 days';
 delete from private.cloud_backup_jobs where purpose='download' and created_at<now()-interval '1 day';
end $$;
revoke all on function private.purge_operations() from public,anon,authenticated,service_role;
create or replace function public.service_cloud_backup_health() returns jsonb language sql stable security definer set search_path='' as $$
with last_stored as(select * from private.cloud_backup_jobs where purpose='backup' and status='stored' order by created_at desc limit 1),last_attempt as(select status,created_at from private.cloud_backup_jobs where purpose='backup' order by created_at desc limit 1)
select jsonb_build_object('configured',exists(select 1 from private.cloud_backup_config where enabled),'storedAt',(select created_at from last_stored),'verifiedAt',(select verified_at from last_stored),'restoreVerified',coalesce((select verified_at is not null from last_stored),false),'state',(select status from last_attempt),'healthy',exists(select 1 from last_stored where created_at>now()-interval '48 hours') and not exists(select 1 from last_attempt where status='failed' or(status in('queued','running') and created_at<now()-interval '15 minutes')),'storage','supabase-private-encrypted','separateProvider',false)
$$;
