create table private.monitor_diagnostics(
 checked_at timestamptz primary key,http_status integer,error_id uuid,deployment_sha text,
 stage text not null check(stage in('ok','configuration','database','database_pool','database_transport','authentication','application','platform','timeout','unknown')),
 database_ms integer,authentication_ms integer,upstream_request_id text
);
alter table private.monitor_diagnostics enable row level security;
revoke all on private.monitor_diagnostics from public,anon,authenticated;
grant select,insert,update,delete on private.monitor_diagnostics to service_role;

-- Extract only bounded diagnostic metadata. Never retain a response body or exception.
create function private.record_monitor_diagnostic(p_at timestamptz,p_http integer,p_body jsonb,p_upstream text) returns void
language plpgsql security invoker set search_path='' as $$
declare stage text;begin
 if p_at is null or p_at>now()+interval '1 minute' or p_at<now()-interval '1 day' then raise exception 'BF_INVALID_INPUT';end if;
 stage:=p_body#>>'{diagnostics,stage}';
 if stage is null or stage not in('ok','configuration','database','database_pool','database_transport','authentication','application') then
 stage:=case when p_http is null then 'timeout' when p_http>=500 then 'platform' else 'unknown' end;end if;
 insert into private.monitor_diagnostics values(p_at,p_http,
 case when p_body->>'errorId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then (p_body->>'errorId')::uuid end,
 case when p_body->>'commit' ~ '^[a-f0-9]{40}$' then p_body->>'commit' end,stage,
 case when p_body#>>'{diagnostics,databaseMs}' ~ '^\d{1,5}$' then least(60000,(p_body#>>'{diagnostics,databaseMs}')::integer) end,
 case when p_body#>>'{diagnostics,authenticationMs}' ~ '^\d{1,5}$' then least(60000,(p_body#>>'{diagnostics,authenticationMs}')::integer) end,
 case when p_upstream ~ '^[a-zA-Z0-9:._-]{1,160}$' then p_upstream end) on conflict(checked_at) do nothing;
 delete from private.monitor_diagnostics where checked_at<now()-interval '14 days';
end $$;
revoke all on function private.record_monitor_diagnostic(timestamptz,integer,jsonb,text) from public,anon,authenticated;
grant execute on function private.record_monitor_diagnostic(timestamptz,integer,jsonb,text) to service_role;

create or replace function private.monitor_tick() returns void language plpgsql security definer set search_path='' as $$
declare r record;payload jsonb;healthy boolean;code text;request bigint;
begin
 if not pg_try_advisory_xact_lock(hashtext('bookforest:monitor:tick')) then return;end if;
 for r in select p.id,p.created_at,h.status_code,h.content,h.headers from private.monitor_requests p left join net._http_response h on h.id=p.id where p.processed_at is null and (h.id is not null or p.created_at<now()-interval '2 minutes') order by p.created_at,p.id loop
 healthy:=false;code:='TIMEOUT';payload:='{}';
 begin payload:=r.content::jsonb;exception when others then payload:='{}';end;
 if r.status_code is not null then
 code:='HTTP_'||r.status_code;
 if r.status_code=200 then
 healthy:=coalesce(payload->>'status'='ok' and payload->>'configured'='true' and payload#>>'{checks,database}'='true' and payload#>>'{checks,authentication}'='true',false);
 code:=case when healthy then 'HEALTHY' else 'INVALID_HEALTH_RESPONSE' end;
 end if;end if;
 perform private.record_service_check('supabase-cron',r.created_at,healthy,code);
 perform private.record_monitor_diagnostic(r.created_at,r.status_code,payload,r.headers->>'x-vercel-id');
 update private.monitor_requests set processed_at=now() where id=r.id;
 end loop;
 select net.http_get(url:='https://reading-blush-zeta.vercel.app/api/health?deep=1',headers:='{"Cache-Control":"no-cache"}'::jsonb,timeout_milliseconds:=10000) into request;
 insert into private.monitor_requests(id) values(request);
 delete from private.monitor_requests where processed_at<now()-interval '1 day';
end $$;

create function public.operator_monitor_diagnostics() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.data_session() or not private.is_operator() then raise exception 'BF_FORBIDDEN';end if;
 return jsonb_build_object('asOf',now(),'recent',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from private.monitor_diagnostics order by checked_at desc limit 20)x),'[]'),
 'failures',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from private.monitor_diagnostics where stage<>'ok' order by checked_at desc limit 20)x),'[]'));
end $$;
revoke all on function public.operator_monitor_diagnostics() from public,anon;
grant execute on function public.operator_monitor_diagnostics() to authenticated;
