create table private.backup_copy_reports(agent_id uuid not null references private.backup_agents(id) on delete cascade,kind text not null,configured boolean not null,state text not null,external boolean not null,backup_digest text,verified_at timestamptz,bytes bigint,checked_at timestamptz not null,primary key(agent_id,kind));
alter table private.backup_copy_reports enable row level security;
revoke all on private.backup_copy_reports from public,anon,authenticated,service_role;
create function public.backup_copy_report(p_payload text,p_signature text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb;a private.backup_agents;t jsonb;seq bigint;at timestamptz;fp text;expected bytea;given bytea;difference integer:=0;i integer;begin
 if p_payload is null or octet_length(p_payload)>3000 or p_signature is null or p_signature!~'^[a-f0-9]{64}$' then raise exception 'BF_INVALID_INPUT';end if;
 v:=p_payload::jsonb;
 if jsonb_typeof(v)<>'object' or (select count(*) from jsonb_object_keys(v))<>5 or not(v?&array['version','agent','sequence','checkedAt','targets']) or v->>'version'<>'1' or jsonb_typeof(v->'targets')<>'array' or jsonb_array_length(v->'targets')<>2 or jsonb_typeof(v->'sequence')<>'number' then raise exception 'BF_INVALID_INPUT';end if;
 seq:=(v->>'sequence')::bigint;at:=(v->>'checkedAt')::timestamptz;
 if seq<1 or seq>9007199254740991 or at<now()-interval '10 minutes' or at>now()+interval '1 minute' then raise exception 'BF_INVALID_INPUT';end if;
 if (select count(distinct x->>'kind') from jsonb_array_elements(v->'targets')x)<>2 then raise exception 'BF_INVALID_INPUT';end if;
 for t in select * from jsonb_array_elements(v->'targets') loop
 if jsonb_typeof(t)<>'object' or (select count(*) from jsonb_object_keys(t))<>7 or not(t?&array['kind','configured','state','external','digest','verifiedAt','bytes']) or t->>'kind' not in('recovery-kit','cloud-mirror') or t->>'state' not in('verified','failed','missing','unconfigured') or jsonb_typeof(t->'configured')<>'boolean' or jsonb_typeof(t->'external')<>'boolean' or ((t->>'configured')::boolean is distinct from (t->>'state'<>'unconfigured')) then raise exception 'BF_INVALID_INPUT';end if;
 if t->>'digest' is not null and t->>'digest'!~'^[a-f0-9]{64}$' or t->>'bytes' is not null and ((t->>'bytes')::bigint not between 1 and 134217728) then raise exception 'BF_INVALID_INPUT';end if;
 if t->>'state'='verified' and(t->>'digest' is null or t->>'verifiedAt' is null or t->>'bytes' is null or (t->>'verifiedAt')::timestamptz>now()+interval '1 minute') then raise exception 'BF_INVALID_INPUT';end if;
 end loop;
 select * into a from private.backup_agents where id=(v->>'agent')::uuid and active;
 if not found then raise exception 'BF_FORBIDDEN';end if;
 expected:=extensions.hmac(convert_to(p_payload,'UTF8'),a.secret,'sha256');given:=decode(p_signature,'hex');
 for i in 0..31 loop difference:=difference|(get_byte(expected,i)#get_byte(given,i));end loop;
 if difference<>0 then raise exception 'BF_FORBIDDEN';end if;
 perform 1 from private.backup_agents where id=a.id and active and secret=a.secret for update;
 if not found then raise exception 'BF_FORBIDDEN';end if;
 select * into a from private.backup_agents where id=a.id;
 fp:=encode(sha256(convert_to(p_payload,'UTF8')),'hex');
 if seq=a.last_sequence and fp=a.request_digest then return jsonb_build_object('accepted',true,'replayed',true);end if;
 if seq<=a.last_sequence then raise exception 'BF_IDEMPOTENCY_CONFLICT';end if;
 update private.backup_agents set last_sequence=seq,request_digest=fp where id=a.id;
 for t in select * from jsonb_array_elements(v->'targets') loop
 insert into private.backup_copy_reports values(a.id,t->>'kind',(t->>'configured')::boolean,t->>'state',(t->>'external')::boolean,t->>'digest',(t->>'verifiedAt')::timestamptz,(t->>'bytes')::bigint,at)
 on conflict(agent_id,kind) do update set configured=excluded.configured,state=excluded.state,external=excluded.external,backup_digest=excluded.backup_digest,verified_at=excluded.verified_at,bytes=excluded.bytes,checked_at=excluded.checked_at;
 end loop;return jsonb_build_object('accepted',true,'replayed',false);
end $$;
revoke all on function public.backup_copy_report(text,text) from public;grant execute on function public.backup_copy_report(text,text) to anon,authenticated;
create function public.service_copy_health() returns jsonb language sql stable security definer set search_path='' as $$
with targets as(select r.* from private.backup_copy_reports r join private.backup_agents a on a.id=r.agent_id and a.active), checks as(select *,checked_at>now()-interval '2 hours' and state='verified' and verified_at>now()-interval '48 hours' fresh from targets where configured)
select jsonb_build_object('checkedAt',now(),'configured',exists(select 1 from checks),'external',exists(select 1 from checks where external),'healthy',not exists(select 1 from checks where not fresh),'code',case when exists(select 1 from checks where state in('failed','missing')) then 'BACKUP_COPY_FAILED' when exists(select 1 from checks where not fresh) then 'BACKUP_COPY_STALE' else 'OK' end,'targets',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'configured',configured,'external',external,'state',state,'checkedAt',checked_at,'verifiedAt',verified_at)) from targets),'[]'))
$$;
revoke all on function public.service_copy_health() from public;grant execute on function public.service_copy_health() to anon,authenticated;
do $$declare d text;begin
 d:=pg_get_functiondef('public.service_backup_health()'::regprocedure);
 if position('return jsonb_build_object(' in d)=0 then raise exception 'Backup health anchor missing';end if;
 d:=replace(d,'return jsonb_build_object(','return jsonb_build_object(''copies'',public.service_copy_health(),');execute d;
end $$;
