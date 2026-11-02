create table private.backup_attempts(id uuid primary key,started_at timestamptz not null,finished_at timestamptz,status text not null check(status in ('running','completed','failed')),error_code text check(error_code ~ '^[A-Z0-9_]{1,80}$'));
alter table private.backup_attempts enable row level security;revoke all on private.backup_attempts from public,anon,authenticated;grant all on private.backup_attempts to service_role;
create or replace function public.operator_backup_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.data_session() or not private.is_operator() then raise exception 'BF_FORBIDDEN';end if;
 return jsonb_build_object('asOf',now(),'runs',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from private.backup_runs order by created_at desc,id limit 10)x),'[]'),'attempts',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from private.backup_attempts order by started_at desc,id limit 10)x),'[]'));
end $$;
revoke all on function public.operator_backup_state() from public,anon;grant execute on function public.operator_backup_state() to authenticated;
