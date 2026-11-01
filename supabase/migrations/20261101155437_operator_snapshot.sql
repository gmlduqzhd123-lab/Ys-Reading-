create or replace function private.operator_snapshot() returns jsonb language plpgsql set search_path='' as $$
declare table_row record;rows jsonb;data jsonb:='{}';meta jsonb;result jsonb;
begin
 for table_row in select schemaname,tablename from pg_tables where schemaname in ('public','private','auth') order by schemaname,tablename loop
 if table_row.schemaname='auth' and table_row.tablename in ('sessions','refresh_tokens','flow_state','one_time_tokens','mfa_amr_claims','mfa_challenges','schema_migrations') then rows:='[]';
 else execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]''::jsonb) from %I.%I x',table_row.schemaname,table_row.tablename) into rows;
 end if;
 if table_row.schemaname='auth' and table_row.tablename='users' then select coalesce(jsonb_agg((select jsonb_object_agg(k,case when k in ('confirmation_token','recovery_token','email_change_token_new','email_change_token_current','phone_change_token','reauthentication_token') then '""'::jsonb else v end) from jsonb_each(value) entry(k,v))),'[]') into rows from jsonb_array_elements(rows);end if;
 data:=data||jsonb_build_object(table_row.schemaname||'.'||table_row.tablename,rows);
 end loop;
 select jsonb_build_object(
 'columns',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'generated',a.attgenerated,'expression',case when a.attgenerated<>'' then pg_get_expr(d.adbin,d.adrelid) else null end) order by n.nspname,c.relname,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname in ('auth','public','private') and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped),
 'enums',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select n.nspname schema,t.typname name,jsonb_agg(e.enumlabel order by e.enumsortorder) "values" from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid where n.nspname='auth' group by n.nspname,t.typname)x),
 'functions',(select jsonb_agg(jsonb_build_object('signature',format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'definition',pg_get_functiondef(p.oid),'acl',coalesce((select jsonb_agg(jsonb_build_object('role',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type)) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 or pg_get_userbyid(a.grantee) in ('anon','authenticated','service_role')),'[]')) order by n.nspname,p.proname,p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'),
 'policies',(select coalesce(jsonb_agg(to_jsonb(x) order by schemaname,tablename,policyname),'[]') from pg_policies x where schemaname in ('public','private')),
 'tables',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',coalesce((select jsonb_agg(jsonb_build_object('role',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type)) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee=0 or pg_get_userbyid(a.grantee) in ('anon','authenticated','service_role')),'[]')) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p')),
 'constraints',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',k.conname,'type',k.contype,'definition',pg_get_constraintdef(k.oid)) order by n.nspname,c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('auth','public','private') and k.contype in ('p','u','f','c'))
 ) into meta;
 result:=jsonb_build_object('format','bookforest-instance-snapshot','version',1,'createdAt',clock_timestamp(),'postgres',current_setting('server_version'),'data',data,'schema',meta,'migrations',(select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations));
 if octet_length(result::text)>64000000 then raise exception 'BF_FULL_BACKUP_TOO_LARGE';end if;
 return result;
end $$;

revoke all on function private.operator_snapshot() from public,anon,authenticated;
grant execute on function private.operator_snapshot() to service_role;
