-- Extend the existing signed, replay-protected status channel. No new data
-- access or backup-success capability is granted to the machine credential.
do $watchdog$
declare d text;old text;codes text:='''BACKUP_TASK_MISSING'',''BACKUP_TASK_DISABLED'',''BACKUP_TASK_MISCONFIGURED'',''BACKUP_TASK_FAILED'',''BACKUP_TASK_STALE'',''BACKUP_TASK_CHECK_UNAVAILABLE'',''BACKUP_WATCHDOG_UNAVAILABLE''';begin
 d:=pg_get_functiondef('public.backup_agent_report(text,text)'::regprocedure);
 old:='v->>''phase'' not in(''probe'',''backup'') or v->>''code'' not in(';
 if position(old in d)=0 then raise exception 'WATCHDOG_REPORT_ANCHOR_MISSING';end if;
 d:=replace(d,old,'(v->>''code'' in('||codes||') and (v->>''state''<>''retry_wait'' or v->>''phase''<>''probe'')) or '||old||codes||',');
 execute d;
 d:=pg_get_functiondef('public.service_backup_health()'::regprocedure);
 old:='backup_ok:=code=''OK'';';
 if position(old in d)=0 then raise exception 'WATCHDOG_HEALTH_ANCHOR_MISSING';end if;
 d:=replace(d,old,'if agent.last_failure_at>coalesce(verified,''-infinity'') and agent.state=''retry_wait'' and agent.code in('||codes||') then code:=agent.code;end if; '||old);
 execute d;
end $watchdog$;
