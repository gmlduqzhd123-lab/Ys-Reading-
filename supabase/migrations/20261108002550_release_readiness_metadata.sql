alter table private.monitor_diagnostics drop constraint monitor_diagnostics_stage_check;
alter table private.monitor_diagnostics add constraint monitor_diagnostics_stage_check check(stage in('ok','configuration','database','database_pool','database_transport','authentication','application','platform','timeout','unknown','rate_limit'));
do $$declare def text;begin
 def:=pg_get_functiondef('private.record_monitor_diagnostic(timestamptz,integer,jsonb,text)'::regprocedure);
 def:=replace(def,$a$'authentication','application')$a$,$a$'authentication','application','rate_limit')$a$);
 def:=replace(def,$a$stage:=case when p_http is null$a$,$a$stage:=case when p_http=200 and p_body->>'status'='ok' and p_body#>>'{checks,database}'='true' and p_body#>>'{checks,authentication}'='true' then 'ok' when p_http is null$a$);
 execute def;
end $$;
create or replace function public.operator_monitor_diagnostics() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.data_session() or not private.is_operator() then raise exception 'BF_FORBIDDEN';end if;
 return jsonb_build_object('asOf',now(),'recent',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from private.monitor_diagnostics order by checked_at desc limit 20)x),'[]'),
 'failures',coalesce((select jsonb_agg(to_jsonb(x)) from(select d.* from private.monitor_diagnostics d where d.stage<>'ok' and not exists(select 1 from private.service_checks c where c.checked_at=d.checked_at and c.healthy) order by checked_at desc limit 20)x),'[]'));
end $$;

create or replace function public.service_release_contract() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('protocol',2,'minimumWorkerProtocol',2,'reportReview',true,'scopedStaff',true,
 'operationsCompletion',to_regprocedure('public.plaza_report_command(text,jsonb,uuid)') is not null,
 'exportJobs',to_regprocedure('public.google_export_job(text,uuid,text,uuid,jsonb)') is not null,
 'readingDrafts',to_regprocedure('public.reading_draft(text,uuid,uuid,jsonb,integer,uuid)') is not null,
 'signedApiBudget',to_regprocedure('public.consume_api_budget(text,text)') is not null,
 'monitorDiagnostics',to_regprocedure('public.operator_monitor_diagnostics()') is not null,
 'recoveryReadiness',to_regprocedure('public.operator_recovery_state()') is not null);
$$;
