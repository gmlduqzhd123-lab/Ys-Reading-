create table private.api_request_keys(id boolean primary key default true check(id),secret bytea not null check(octet_length(secret)=32));
create table private.api_request_budgets(scope text not null,subject text not null,minute timestamptz not null,count integer not null default 0,primary key(scope,subject,minute));
create index api_request_budgets_expiry on private.api_request_budgets(minute);
alter table private.api_request_keys enable row level security;alter table private.api_request_budgets enable row level security;
revoke all on private.api_request_keys,private.api_request_budgets from public,anon,authenticated,service_role;
create function public.consume_api_budget(p_payload text,p_signature text) returns jsonb language plpgsql security definer set search_path='' set statement_timeout='3s' set lock_timeout='1s' as $$
declare v jsonb;key bytea;expected bytea;given bytea;difference integer:=0;i integer;start_at timestamptz:=date_trunc('minute',now());global_count integer;subject_count integer;subject_limit integer;global_limit integer;
begin
 if p_payload is null or octet_length(p_payload)>512 or p_signature is null or p_signature !~ '^[a-f0-9]{64}$' then raise exception 'BF_FORBIDDEN';end if;
 v:=p_payload::jsonb;
 if jsonb_typeof(v) is distinct from 'object' or (select count(*) from jsonb_object_keys(v))<>3 or not(v ?& array['scope','subject','at']) or v->>'scope' is null or v->>'scope' not in('health','books') or v->>'subject' is null or v->>'subject' !~ '^[a-f0-9]{64}$' or jsonb_typeof(v->'at') is distinct from 'number' or abs((v->>'at')::bigint-extract(epoch from now()))>30 then raise exception 'BF_FORBIDDEN';end if;
 select secret into key from private.api_request_keys where id;
 if key is null then raise exception 'BF_SERVICE_UNAVAILABLE';end if;
 expected:=extensions.hmac(convert_to(p_payload,'UTF8'),key,'sha256');given:=decode(p_signature,'hex');
 for i in 0..31 loop difference:=difference | (get_byte(expected,i) # get_byte(given,i));end loop;
 if difference<>0 then raise exception 'BF_FORBIDDEN';end if;
 subject_limit:=case when v->>'scope'='health' then 120 else 30 end;global_limit:=case when v->>'scope'='health' then 600 else 600 end;
 -- Always lock the global row before a subject row. Denied requests do not
 -- consume global allowance or allocate unbounded new subject rows.
 insert into private.api_request_budgets values(v->>'scope','global',start_at,0) on conflict do nothing;
 select count into global_count from private.api_request_budgets where scope=v->>'scope' and subject='global' and minute=start_at for update;
 if global_count>=global_limit then return jsonb_build_object('allowed',false,'retryAfter',60);end if;
 insert into private.api_request_budgets values(v->>'scope',v->>'subject',start_at,0) on conflict do nothing;
 select count into subject_count from private.api_request_budgets where scope=v->>'scope' and subject=v->>'subject' and minute=start_at for update;
 if subject_count>=subject_limit then return jsonb_build_object('allowed',false,'retryAfter',60);end if;
 update private.api_request_budgets set count=count+1 where scope=v->>'scope' and minute=start_at and subject in('global',v->>'subject');
 delete from private.api_request_budgets where minute<start_at-interval '2 minutes';
 return jsonb_build_object('allowed',true,'retryAfter',0);
end $$;
revoke all on function public.consume_api_budget(text,text) from public,anon,authenticated;
grant execute on function public.consume_api_budget(text,text) to anon,authenticated;
