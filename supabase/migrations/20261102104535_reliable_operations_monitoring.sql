create table private.service_checks(id uuid primary key default gen_random_uuid(),source text not null check(source in ('supabase-cron','operator-pc')),checked_at timestamptz not null,healthy boolean not null,code text not null check(code ~ '^[A-Z0-9_]{1,60}$'));
create index service_checks_source_time_idx on private.service_checks(source,checked_at desc);
create table private.service_incidents(id uuid primary key default gen_random_uuid(),source text not null,opened_at timestamptz not null,closed_at timestamptz,code text not null);
create unique index service_incident_open_idx on private.service_incidents(source) where closed_at is null;
create table private.monitor_requests(id bigint primary key,created_at timestamptz not null default now(),processed_at timestamptz);
alter table private.service_checks enable row level security;alter table private.service_incidents enable row level security;alter table private.monitor_requests enable row level security;
revoke all on private.service_checks,private.service_incidents,private.monitor_requests from public,anon,authenticated;grant all on private.service_checks,private.service_incidents,private.monitor_requests to service_role;
create function private.record_service_check(p_source text,p_at timestamptz,p_healthy boolean,p_code text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_source is null or p_source not in ('supabase-cron','operator-pc') or p_at is null or p_at>now()+interval '1 minute' or p_at<now()-interval '1 day' or p_healthy is null or p_code is null or p_code !~ '^[A-Z0-9_]{1,60}$' then raise exception 'BF_INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtext('bookforest:monitor:'||p_source));
 if exists(select 1 from private.service_checks where source=p_source and checked_at>=p_at) then return;end if;
 insert into private.service_checks(source,checked_at,healthy,code) values(p_source,p_at,p_healthy,p_code);
 if p_healthy then update private.service_incidents set closed_at=p_at where source=p_source and closed_at is null;
 else insert into private.service_incidents(source,opened_at,code) values(p_source,p_at,p_code) on conflict(source) where closed_at is null do nothing;end if;
 delete from private.service_checks where checked_at<now()-interval '14 days';delete from private.service_incidents where closed_at<now()-interval '90 days';
end $$;
revoke all on function private.record_service_check(text,timestamptz,boolean,text) from public,anon,authenticated;grant execute on function private.record_service_check(text,timestamptz,boolean,text) to service_role;
create function private.monitor_tick() returns void language plpgsql security definer set search_path='' as $$
declare r record;payload jsonb;healthy boolean;code text;request bigint;
begin
 if not pg_try_advisory_xact_lock(hashtext('bookforest:monitor:tick')) then return;end if;
 for r in select p.id,p.created_at,h.status_code,h.content,h.timed_out,h.error_msg from private.monitor_requests p left join net._http_response h on h.id=p.id where p.processed_at is null and (h.id is not null or p.created_at<now()-interval '2 minutes') order by p.created_at,p.id loop
 healthy:=false;code:='TIMEOUT';
 if r.status_code is not null then
 code:='HTTP_'||r.status_code;
 if r.status_code=200 then
 begin payload:=r.content::jsonb;healthy:=coalesce(payload->>'status'='ok' and payload->>'configured'='true' and payload#>>'{checks,database}'='true' and payload#>>'{checks,authentication}'='true',false);code:=case when healthy then 'HEALTHY' else 'INVALID_HEALTH_RESPONSE' end;exception when others then code:='INVALID_HEALTH_RESPONSE';end;
 end if;end if;
 perform private.record_service_check('supabase-cron',r.created_at,healthy,code);update private.monitor_requests set processed_at=now() where id=r.id;
 end loop;
 select net.http_get(url:='https://reading-blush-zeta.vercel.app/api/health?deep=1',timeout_milliseconds:=10000) into request;
 insert into private.monitor_requests(id) values(request);
 delete from private.monitor_requests where processed_at<now()-interval '1 day';
end $$;
revoke all on function private.monitor_tick() from public,anon,authenticated;grant execute on function private.monitor_tick() to service_role;
create function public.service_monitor_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('asOf',now(),'checks',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('stale',checked_at<now()-interval '12 minutes')) from(select distinct on(source) source,checked_at,healthy,code from private.service_checks order by source,checked_at desc)x),'[]'),'incidents',coalesce((select jsonb_agg(to_jsonb(x)) from(select source,opened_at,closed_at,code from private.service_incidents order by opened_at desc limit 10)x),'[]'))
$$;
revoke all on function public.service_monitor_status() from public;grant execute on function public.service_monitor_status() to anon,authenticated,service_role;
