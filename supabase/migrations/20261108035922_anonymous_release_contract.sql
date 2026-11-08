-- Catalog metadata is public; anonymous callers must not need USAGE on private.
-- Never widen schema/function permissions to make a health probe pass.
do $$declare d text;begin
 d:=pg_get_functiondef('public.service_release_contract()'::regprocedure);
 if position('to_regprocedure(''private.accept_monitor_result(timestamptz,integer,jsonb,text,text,integer)'') is not null' in d)=0 or position('to_regprocedure(''private.visible_learning_members()'') is not null' in d)=0 then raise exception 'Release metadata anchor missing';end if;
 d:=replace(d,'to_regprocedure(''private.accept_monitor_result(timestamptz,integer,jsonb,text,text,integer)'') is not null','exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname=''private'' and p.proname=''accept_monitor_result'' and p.pronargs=6)');
 d:=replace(d,'to_regprocedure(''private.visible_learning_members()'') is not null','exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname=''private'' and p.proname=''visible_learning_members'' and p.pronargs=0)');execute d;
end $$;
