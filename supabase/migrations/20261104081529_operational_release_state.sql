-- Anonymous contract exposes capabilities only, never migration history or account data.
create function public.service_release_contract() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('protocol',2,'minimumWorkerProtocol',2,
  'reportReview',exists(select 1 from pg_catalog.pg_attribute where attrelid=pg_catalog.to_regclass('public.term_reports') and attname='review_state' and not attisdropped),
  'scopedStaff',exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname='classroom_staff' and c.relkind='r'));
$$;
revoke all on function public.service_release_contract() from public;
grant execute on function public.service_release_contract() to anon,authenticated;
