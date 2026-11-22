-- A separate, revocable machine capability. Reporting-only agent keys cannot use it.
-- Store only hashes; no reusable backup access secret is present in a DB snapshot.
create table private.backup_machine_credentials (
 id uuid primary key, label text not null check(length(label) between 1 and 80),
 token_hash bytea not null check(octet_length(token_hash)=32),
 previous_hash bytea check(octet_length(previous_hash)=32), previous_until timestamptz,
 active boolean not null default true, created_at timestamptz not null default now(),
 rotated_at timestamptz not null default now(), last_seen_at timestamptz,
 snapshot_window timestamptz, snapshot_count integer not null default 0
);
alter table private.backup_machine_credentials enable row level security;
revoke all on private.backup_machine_credentials from public,anon,authenticated,service_role;

create function public.backup_machine_request(p_project text,p_credential uuid,p_token text,p_operation text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.backup_machine_credentials;h bytea;difference integer:=0;old_difference integer:=0;i integer;current_key boolean;keys text[];v jsonb;job uuid;at timestamptz;started timestamptz;finished timestamptz;item uuid;d text;
begin
 if p_project is distinct from 'rbtqtkjnqtcnljvabisa' or p_token is null or p_token !~ '^bfm1_[a-f0-9]{64}$' or p_operation is null
 or p_operation not in('health','rotate','snapshot','privacy','attempt','receipt','cloud-latest','cloud-download','cloud-verified','cloud-config','cloud-register','copy-receipt')
 or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>8000 then raise exception 'BF_FORBIDDEN';end if;
 select * into c from private.backup_machine_credentials where id=p_credential and active for update;
 if not found then raise exception 'BF_FORBIDDEN';end if;
 h:=sha256(convert_to(p_token,'UTF8'));
 for i in 0..31 loop
  difference:=difference|(get_byte(h,i)#get_byte(c.token_hash,i));
  old_difference:=old_difference|(get_byte(h,i)#get_byte(coalesce(c.previous_hash,c.token_hash),i));
 end loop;
 current_key:=difference=0;
 if not current_key and not(old_difference=0 and c.previous_hash is not null and c.previous_until>now()) then raise exception 'BF_FORBIDDEN';end if;
 select coalesce(array_agg(k),'{}') into keys from jsonb_object_keys(p_payload) k;
 update private.backup_machine_credentials set last_seen_at=now() where id=c.id;
 if p_operation in('health','snapshot','privacy','cloud-latest','cloud-config') and cardinality(keys)<>0 then raise exception 'BF_INVALID_INPUT';end if;
 if p_operation='health' then return jsonb_build_object('protocol',1,'projectRef',p_project,'mode','machine','rotatedAt',c.rotated_at);end if;
 if p_operation='rotate' then
  if not current_key or cardinality(keys)<>1 or not(keys@>array['nextHash']) or p_payload->>'nextHash' !~ '^[a-f0-9]{64}$' then raise exception 'BF_FORBIDDEN';end if;
  if decode(p_payload->>'nextHash','hex')<>c.token_hash then
   update private.backup_machine_credentials set previous_hash=token_hash,previous_until=now()+interval '7 days',token_hash=decode(p_payload->>'nextHash','hex'),rotated_at=now() where id=c.id;
  end if;
  return jsonb_build_object('rotated',true);
 end if;
 if p_operation='snapshot' then
  if c.snapshot_window>now()-interval '5 minutes' and c.snapshot_count>=3 then raise exception 'BF_RATE_LIMIT';end if;
  update private.backup_machine_credentials set snapshot_window=case when snapshot_window>now()-interval '5 minutes' then snapshot_window else now() end,
   snapshot_count=case when snapshot_window>now()-interval '5 minutes' then snapshot_count+1 else 1 end where id=c.id;
  return private.operator_snapshot();
 end if;
 if p_operation='privacy' then return private.operator_privacy_checkpoint();end if;
 if p_operation='attempt' then
  if cardinality(keys)<>5 or not(keys@>array['id','started','finished','status','code']) or p_payload->>'status' not in('running','completed','failed')
   or(p_payload->>'code' is not null and p_payload->>'code' !~ '^[A-Z0-9_]{1,80}$') then raise exception 'BF_INVALID_INPUT';end if;
  item:=(p_payload->>'id')::uuid;started:=(p_payload->>'started')::timestamptz;finished:=(p_payload->>'finished')::timestamptz;
  if item is null or started is null or started<now()-interval '30 days' or started>now()+interval '1 minute'
   or(finished is not null and(finished<started or finished>now()+interval '1 minute'))
   or(p_payload->>'status'='running')<>(finished is null) then raise exception 'BF_INVALID_INPUT';end if;
  insert into private.backup_attempts values(item,started,finished,p_payload->>'status',p_payload->>'code')
   on conflict(id) do update set finished_at=excluded.finished_at,status=excluded.status,error_code=excluded.error_code;
  return jsonb_build_object('accepted',true);
 end if;
 if p_operation='receipt' then
  if cardinality(keys)<>7 or not(keys@>array['id','file','bytes','tables','rows','digest','verified']) or p_payload->'verified'<>'true'::jsonb
   or p_payload->>'file' !~ '^[0-9TZ.-]+\.bfbak$' or p_payload->>'digest' !~ '^[a-f0-9]{64}$'
   or(p_payload->>'bytes')::bigint not between 1 and 128000000 or(p_payload->>'tables')::int not between 1 and 10000
   or(p_payload->>'rows')::bigint not between 0 and 1000000000 or c.snapshot_window is null or c.snapshot_window<now()-interval '30 minutes' then raise exception 'BF_INVALID_INPUT';end if;
  item:=(p_payload->>'id')::uuid;
  insert into private.backup_runs values(item,now(),now(),p_payload->>'file',(p_payload->>'bytes')::bigint,(p_payload->>'tables')::integer,(p_payload->>'rows')::bigint,p_payload->>'digest') on conflict(id) do nothing;
  if not exists(select 1 from private.backup_runs where id=item and snapshot_digest=p_payload->>'digest' and file_name=p_payload->>'file') then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('accepted',true);
 end if;
 if p_operation='cloud-latest' then
  select to_jsonb(x) into v from(select id,digest,verified_at from private.cloud_backup_jobs where purpose='backup' and status='stored' order by created_at desc limit 1)x;
  return coalesce(v,'null'::jsonb);
 end if;
 if p_operation='cloud-download' then
  if cardinality(keys)<>2 or not(keys@>array['source','request']) then raise exception 'BF_INVALID_INPUT';end if;
  job:=(p_payload->>'request')::uuid;item:=(p_payload->>'source')::uuid;
  if job is null or not exists(select 1 from private.cloud_backup_jobs where id=item and purpose='backup' and status='stored') then raise exception 'BF_INVALID_INPUT';end if;
  insert into private.cloud_backup_jobs(id,purpose,source_id) values(job,'download',item) on conflict(id) do nothing;
  if not exists(select 1 from private.cloud_backup_jobs where id=job and purpose='download' and source_id=item) then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('id',job);
 end if;
 if p_operation='cloud-verified' then
  if cardinality(keys)<>3 or not(keys@>array['id','digest','verified']) or p_payload->'verified'<>'true'::jsonb or p_payload->>'digest' !~ '^[a-f0-9]{64}$' then raise exception 'BF_INVALID_INPUT';end if;
  update private.cloud_backup_jobs set verified_at=now() where id=(p_payload->>'id')::uuid and purpose='backup' and status='stored' and digest=p_payload->>'digest';
  if not found then raise exception 'BF_INVALID_INPUT';end if;return jsonb_build_object('accepted',true);
 end if;
 if p_operation='cloud-config' then return(select jsonb_build_object('public_key',public_key) from private.cloud_backup_config where singleton);end if;
 if p_operation='cloud-register' then
  if cardinality(keys)<>1 or not(keys@>array['publicKey']) then raise exception 'BF_INVALID_INPUT';end if;
  update private.cloud_backup_config set enabled=true where singleton and public_key=p_payload->>'publicKey';
  if not found then raise exception 'BF_FORBIDDEN';end if;return jsonb_build_object('accepted',true);
 end if;
 if p_operation='copy-receipt' then
  if cardinality(keys)<>5 or not(keys@>array['id','at','digest','kind','bytes']) or p_payload->>'digest' !~ '^[a-f0-9]{64}$'
   or p_payload->>'kind' not in('same_pc','other_volume','removable','network') or(p_payload->>'bytes')::bigint not between 1 and 128000000 then raise exception 'BF_INVALID_INPUT';end if;
  at:=(p_payload->>'at')::timestamptz;
  if at is null or at<now()-interval '10 minutes' or at>now()+interval '1 minute' then raise exception 'BF_INVALID_INPUT';end if;
  insert into private.backup_copy_checks values((p_payload->>'id')::uuid,at,p_payload->>'digest',p_payload->>'kind',(p_payload->>'bytes')::bigint) on conflict(id) do nothing;
  delete from private.backup_copy_checks where verified_at<now()-interval '90 days';return jsonb_build_object('accepted',true);
 end if;
 raise exception 'BF_FORBIDDEN';
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range or not_null_violation or check_violation then raise exception 'BF_INVALID_INPUT';
end $$;
revoke all on function public.backup_machine_request(text,uuid,text,text,jsonb) from public;
grant execute on function public.backup_machine_request(text,uuid,text,text,jsonb) to anon,authenticated;
