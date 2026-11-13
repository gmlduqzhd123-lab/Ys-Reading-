-- An old permission error must not overwrite a later stale/offline diagnosis
-- after another verified backup has already resolved that incident.
do $$declare d text;begin
 d:=pg_get_functiondef('public.service_backup_health()'::regprocedure);
 d:=replace(d,'if code<>''OK'' and agent.code=''BACKUP_PERMISSION_DENIED'' then','if code<>''OK'' and agent.code=''BACKUP_PERMISSION_DENIED'' and agent.last_failure_at>coalesce(verified,''-infinity'') then');execute d;
end $$;
