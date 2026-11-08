alter table private.cloud_backup_config add column requested_at timestamptz;
create function public.operator_request_cloud_backup() returns void language plpgsql security definer set search_path='' as $$begin perform private.require_operator_step_up();update private.cloud_backup_config set requested_at=clock_timestamp() where enabled;if not found then raise exception 'BF_CLOUD_NOT_CONFIGURED';end if;perform private.ops_audit('cloud_backup_requested');end $$;
revoke all on function public.operator_request_cloud_backup() from public,anon;grant execute on function public.operator_request_cloud_backup() to authenticated;
do $$declare d text;begin
 d:=pg_get_functiondef('private.cloud_backup_tick()'::regprocedure);
 if position('status=''stored'' and created_at>=cutoff' in d)=0 then raise exception 'Cloud schedule anchor missing';end if;
 d:=replace(d,'status=''stored'' and created_at>=cutoff','status=''stored'' and created_at>=greatest(cutoff,coalesce((select requested_at from private.cloud_backup_config where enabled),cutoff))');execute d;
end $$;
create or replace function public.service_release_contract() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('protocol',2,'minimumWorkerProtocol',2,'reportReview',true,'scopedStaff',true,
 'operationsCompletion',to_regprocedure('public.plaza_report_command(text,jsonb,uuid)') is not null,
 'exportJobs',to_regprocedure('public.google_export_job(text,uuid,text,uuid,jsonb)') is not null,
 'readingDrafts',to_regprocedure('public.reading_draft(text,uuid,uuid,jsonb,integer,uuid)') is not null,
 'signedApiBudget',to_regprocedure('public.consume_api_budget(text,text)') is not null,
 'monitorDiagnostics',to_regprocedure('public.operator_monitor_diagnostics()') is not null,
 'recoveryReadiness',to_regprocedure('public.operator_recovery_state()') is not null,
 'monitorRechecks',to_regprocedure('private.accept_monitor_result(timestamptz,integer,jsonb,text,text,integer)') is not null,
 'cloudBackup',to_regprocedure('public.service_cloud_backup_health()') is not null,
 'batchExports',to_regprocedure('public.start_export_batch(text,text,text,boolean,uuid,date,date)') is not null,
 'learningSignals',to_regprocedure('public.learning_change_token(uuid)') is not null,
 'scopeCache',to_regprocedure('private.visible_learning_members()') is not null);
$$;
