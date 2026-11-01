alter table public.classrooms
 add column academic_year integer check(academic_year between 2000 and 2100),
 add column semester smallint check(semester in (1,2)),
 add column grade_level smallint check(grade_level between 1 and 6),
 add column term_state text not null default 'open' check(term_state in ('open','archived')),
 add column archived_at timestamptz,
 add column term_revision integer not null default 0 check(term_revision>=0);
create index classrooms_term_owner_idx on public.classrooms(teacher_id,term_state,academic_year,semester);

create table public.character_catalog(
 key text primary key,slot text not null check(slot in ('accessory','background')),
 name text not null,description text not null,min_xp integer not null check(min_xp>=0),
 source text not null check(source in ('growth','shop')));
insert into public.character_catalog values
 ('leaf_pin','accessory','새싹 브로치','처음부터 함께하는 작은 새싹',0,'growth'),
 ('round_glasses','accessory','생각 안경','50 XP를 모으면 열리는 둥근 안경',50,'growth'),
 ('star_crown','accessory','이야기 왕관','450 XP의 꾸준한 생각을 담은 별 왕관',450,'growth'),
 ('grove','background','새싹 오솔길','처음 만나는 포근한 책숲',0,'growth'),
 ('reading_room','background','나의 서재','200 XP를 모으면 열리는 작은 서재',200,'growth'),
 ('plum_room','background','저녁의 책방','800 XP를 모으면 열리는 저녁 책방',800,'growth'),
 ('striped_scarf','accessory','포근한 목도리','학급 상점에서 지급받아 착용하는 목도리',0,'shop'),
 ('author_hat','accessory','작가의 모자','200 XP와 상점 지급이 필요한 작가 모자',200,'shop'),
 ('firefly_garden','background','반딧불 정원','학급 상점에서 지급받는 반짝이는 정원',0,'shop');
alter table public.shop_items add column appearance_key text references public.character_catalog(key);
alter table public.shop_orders add column appearance_key text references public.character_catalog(key);
create index shop_items_appearance_idx on public.shop_items(appearance_key) where appearance_key is not null;
create index shop_orders_appearance_idx on public.shop_orders(student_id,appearance_key,status) where appearance_key is not null;
create table public.character_wardrobe(
 id uuid primary key default gen_random_uuid(),student_id uuid not null references public.profiles(id) on delete cascade,
 item_key text not null references public.character_catalog(key),source_order_id uuid not null unique references public.shop_orders(id) on delete cascade,
 acquired_at timestamptz not null default now());
create index wardrobe_student_item_idx on public.character_wardrobe(student_id,item_key);
create index wardrobe_item_idx on public.character_wardrobe(item_key);
create table public.character_equipment(
 student_id uuid primary key references public.profiles(id) on delete cascade,
 accessory_key text references public.character_catalog(key),background_key text not null default 'grove' references public.character_catalog(key),
 revision integer not null default 0,updated_at timestamptz not null default now());
create index equipment_accessory_idx on public.character_equipment(accessory_key);
create index equipment_background_idx on public.character_equipment(background_key);

create table public.term_promotions(
 id uuid primary key default gen_random_uuid(),source_classroom_id uuid not null references public.classrooms(id) on delete cascade,
 target_classroom_id uuid not null unique references public.classrooms(id) on delete cascade,
 academic_year integer not null,semester smallint not null,created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now());
create index promotions_source_idx on public.term_promotions(source_classroom_id);
create index promotions_creator_idx on public.term_promotions(created_by);
create table public.promotion_memberships(
 id uuid primary key default gen_random_uuid(),promotion_id uuid not null references public.term_promotions(id) on delete cascade,
 source_classroom_id uuid not null references public.classrooms(id) on delete cascade,
 target_classroom_id uuid not null references public.classrooms(id) on delete cascade,
 student_id uuid not null references public.profiles(id) on delete cascade,academic_year integer not null,semester smallint not null,
 activated_at timestamptz,consent_id uuid references private.consent_requests(id) on delete set null,
 unique(source_classroom_id,student_id,academic_year,semester));
create index promotion_members_target_idx on public.promotion_memberships(target_classroom_id,student_id);
create index promotion_members_student_idx on public.promotion_memberships(student_id);
create index promotion_members_parent_idx on public.promotion_memberships(promotion_id);
create index promotion_members_consent_idx on public.promotion_memberships(consent_id);
create table public.class_term_events(
 id uuid primary key default gen_random_uuid(),classroom_id uuid not null references public.classrooms(id) on delete cascade,
 actor_id uuid references public.profiles(id) on delete set null,student_id uuid references public.profiles(id) on delete set null,
 kind text not null check(kind in ('configured','archived','reopened','promoted','activated')),
 created_at timestamptz not null default now());
create index term_events_class_idx on public.class_term_events(classroom_id,created_at desc);
create index term_events_actor_idx on public.class_term_events(actor_id);
create index term_events_student_idx on public.class_term_events(student_id);
create table private.growth_term_requests(
 actor_id uuid not null references public.profiles(id) on delete cascade,request_id uuid not null,
 fingerprint text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(actor_id,request_id));
alter table private.growth_term_requests enable row level security;
revoke all on private.growth_term_requests from public,anon,authenticated;
grant all on private.growth_term_requests to service_role;

do $$ declare t text; begin
 foreach t in array array['character_catalog','character_wardrobe','character_equipment','term_promotions','promotion_memberships','class_term_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create policy catalog_read on public.character_catalog for select to authenticated using((select private.data_session()));
create policy wardrobe_read on public.character_wardrobe for select to authenticated using(private.data_session() and student_id=(select auth.uid()));
create policy equipment_read on public.character_equipment for select to authenticated using(private.data_session() and student_id=(select auth.uid()));
create policy promotions_read on public.term_promotions for select to authenticated using(private.data_session() and (private.is_teacher(source_classroom_id) or private.is_teacher(target_classroom_id)));
create policy promotion_members_read on public.promotion_memberships for select to authenticated using(private.session_ok(false) and (student_id=(select auth.uid()) or private.is_teacher(source_classroom_id) or private.is_teacher(target_classroom_id)));
create policy term_events_read on public.class_term_events for select to authenticated using(private.data_session() and (student_id=(select auth.uid()) or private.is_teacher(classroom_id)));

create function private.promoted_ready(p_class uuid,p_student uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.promotion_memberships m where m.target_classroom_id=p_class and m.student_id=p_student and
 (m.activated_at is null or not exists(select 1 from private.consent_requests r where r.id=m.consent_id and r.status='approved')))
$$;
revoke all on function private.promoted_ready(uuid,uuid) from public,anon,authenticated;
create or replace function private.is_active_student(p_classroom_id uuid) returns boolean language sql stable security definer set search_path='' as $$
select private.data_session() and exists(select 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.classroom_id=p_classroom_id and e.student_id=auth.uid() and e.active and p.role='student' and p.consent_status='verified')
and private.promoted_ready(p_classroom_id,auth.uid()) and not exists(select 1 from private.deletion_requests d where d.student_id=auth.uid() and (d.classroom_id=p_classroom_id or d.scope='account') and d.status in ('approved','purged'))
$$;
create function private.can_reset_student(p_student uuid,p_class uuid) returns boolean language sql stable security definer set search_path='' as $$
select private.is_operator() or (private.can_manage_student(p_student,p_class) and exists(select 1 from private.managed_accounts m where m.student_id=p_student and m.classroom_id=p_class))
$$;
revoke all on function private.can_reset_student(uuid,uuid) from public,anon,authenticated;

-- Archive checks run even in legacy definer RPCs. SHARE locks interlock with close/reopen.
create function private.term_write_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare cls uuid; value jsonb:=to_jsonb(new); state text;
begin
 if tg_op='UPDATE' and tg_table_name='enrollments' and value->>'active'='false' then return new; end if;
 if tg_op='UPDATE' and tg_table_name in ('plaza_posts','exhibition_entries') and value->>'status'='withdrawn'
 and (value-'status'-'updated_at')=(to_jsonb(old)-'status'-'updated_at') then return new; end if;
 cls:=(value->>'classroom_id')::uuid;
 if cls is null and value ? 'assignment_id' then select classroom_id into cls from public.assignments where id=(value->>'assignment_id')::uuid; end if;
 if cls is null and tg_table_name in ('feedback','badges') then select a.classroom_id into cls from public.submissions s join public.assignments a on a.id=s.assignment_id where s.id=coalesce((value->>'submission_id')::uuid,(value->>'source_submission_id')::uuid); end if;
 if cls is null and value ? 'contest_id' then select classroom_id into cls from public.contests where id=(value->>'contest_id')::uuid; end if;
 if cls is null and value ? 'entry_id' then select c.classroom_id into cls from public.entries e join public.contests c on c.id=e.contest_id where e.id=(value->>'entry_id')::uuid; end if;
 if cls is null and value ? 'job_id' then select classroom_id into cls from public.class_jobs where id=(value->>'job_id')::uuid; end if;
 if cls is null and value ? 'goal_id' then select classroom_id into cls from public.forest_goals where id=(value->>'goal_id')::uuid; end if;
 if cls is null and value ? 'exhibition_id' then select classroom_id into cls from public.exhibitions where id=(value->>'exhibition_id')::uuid; end if;
 if cls is null and value ? 'post_id' then select classroom_id into cls from public.plaza_posts where id=(value->>'post_id')::uuid; end if;
 if cls is null then raise exception 'BF_CLASS_NOT_FOUND'; end if;
 select term_state into state from public.classrooms where id=cls for share;
 if state is distinct from 'open' then raise exception 'BF_CLASS_ARCHIVED'; end if;
 if exists(select 1 from public.profiles where id=auth.uid() and role='student') and not private.promoted_ready(cls,auth.uid()) then raise exception 'BF_TERM_CONFIRMATION'; end if;
 return new;
end $$;
revoke all on function private.term_write_guard() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['enrollments','assignments','drafts','submissions','feedback','badges','contests','entries','reviews','reading_logs','activity_events','achievement_badges','class_invites','enrollment_requests','class_economy','shop_items','shop_orders','economy_ledger','plaza_posts','plaza_reactions','grade_members','mission_selections','forest_goals','forest_badges','exhibitions','exhibition_entries','class_jobs','job_applications','saving_goals','shop_proposals'] loop
 execute format('create trigger term_write_guard before insert or update on public.%I for each row execute function private.term_write_guard()',t);
 end loop;
end $$;

create function private.appearance_order_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select appearance_key into new.appearance_key from public.shop_items where id=new.item_id;
 if new.appearance_key is not null and exists(select 1 from public.shop_orders o where o.student_id=new.student_id and o.appearance_key=new.appearance_key and o.status in ('pending','fulfilled')) then raise exception 'BF_ITEM_OWNED'; end if;
 return new;
end $$;
create function private.appearance_fulfilled() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='fulfilled' and new.appearance_key is not null then
 insert into public.character_wardrobe(student_id,item_key,source_order_id) values(new.student_id,new.appearance_key,new.id) on conflict(source_order_id) do nothing;
 end if; return new;
end $$;
revoke all on function private.appearance_order_guard(),private.appearance_fulfilled() from public,anon,authenticated;
create trigger appearance_order_guard before insert on public.shop_orders for each row execute function private.appearance_order_guard();
create trigger appearance_fulfilled after update of status on public.shop_orders for each row execute function private.appearance_fulfilled();

create function private.can_equip(p_student uuid,p_key text,p_xp bigint) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.character_catalog c where c.key=p_key and c.min_xp<=p_xp and (c.source='growth' or exists(select 1 from public.character_wardrobe w join public.shop_orders o on o.id=w.source_order_id where w.student_id=p_student and w.item_key=c.key and o.status='fulfilled')))
$$;
revoke all on function private.can_equip(uuid,text,bigint) from public,anon,authenticated;
create function public.growth_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare xp bigint; eq public.character_equipment; result jsonb;
begin
 if not private.data_session() then raise exception 'BF_FORBIDDEN'; end if;
 select coalesce(sum(a.xp),0) into xp from public.activity_events a where a.student_id=auth.uid();
 select * into eq from public.character_equipment where student_id=auth.uid();
 select jsonb_build_object('xp',xp,'revision',coalesce(eq.revision,0),
 'accessory',case when eq.student_id is null then 'leaf_pin' when private.can_equip(auth.uid(),eq.accessory_key,xp) then eq.accessory_key else null end,
 'background',case when private.can_equip(auth.uid(),coalesce(eq.background_key,'grove'),xp) then coalesce(eq.background_key,'grove') else 'grove' end,
 'catalog',(select jsonb_agg(to_jsonb(c)||jsonb_build_object('canEquip',private.can_equip(auth.uid(),c.key,xp),'owned',exists(select 1 from public.character_wardrobe w join public.shop_orders o on o.id=w.source_order_id where w.student_id=auth.uid() and w.item_key=c.key and o.status='fulfilled'))) from public.character_catalog c)) into result;
 return result;
end $$;
revoke all on function public.growth_state() from public,anon;
grant execute on function public.growth_state() to authenticated;

create function public.growth_term_command(p_command text,p_payload jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor public.profiles; cls uuid; c public.classrooms; result jsonb; fingerprint text; replay private.growth_term_requests;
 xp bigint; eq public.character_equipment; accessory text; background text; item public.character_catalog;
 target uuid; students uuid[]; member public.promotion_memberships; receipt uuid; year integer; term integer; grade integer; count_selected integer; promotion uuid;
begin
 if not private.data_session() then raise exception 'BF_FORBIDDEN'; end if;
 if p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>12000 then raise exception 'BF_INVALID_INPUT'; end if;
 select * into actor from public.profiles where id=auth.uid() for update;
 cls:=(p_payload->>'classroomId')::uuid;
 if p_command='equip' then cls:=null; end if;
 if p_command<>'equip' and (actor.role<>'teacher' or not private.is_teacher(cls)) then raise exception 'BF_FORBIDDEN'; end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('command',p_command,'payload',p_payload)::text,'UTF8')),'hex');
 select * into replay from private.growth_term_requests where actor_id=actor.id and request_id=p_request_id;
 if found then if replay.fingerprint<>fingerprint then raise exception 'BF_IDEMPOTENCY_CONFLICT'; end if; return replay.result; end if;
 if p_command='promote' then
 if jsonb_typeof(p_payload->'students') is distinct from 'array' or jsonb_array_length(p_payload->'students') not between 1 and 100 then raise exception 'BF_INVALID_INPUT'; end if;
 select array_agg(value::uuid) into students from jsonb_array_elements_text(p_payload->'students');
 if (select count(distinct id) from unnest(students) id)<>cardinality(students) then raise exception 'BF_INVALID_INPUT'; end if;
 perform 1 from public.profiles where id=any(students) order by id for update;
 elsif p_command='activate' then
 select * into member from public.promotion_memberships where id=(p_payload->>'id')::uuid and target_classroom_id=cls;
 if not found then raise exception 'BF_FORBIDDEN'; end if;
 perform 1 from public.profiles where id=member.student_id for update;
 end if;
 if cls is not null then select * into c from public.classrooms where id=cls for update; end if;
 case p_command
 when 'equip' then
 if actor.role<>'student' then raise exception 'BF_FORBIDDEN'; end if;
 insert into public.character_equipment(student_id) values(actor.id) on conflict do nothing;
 select * into eq from public.character_equipment where student_id=actor.id for update;
 if (p_payload->>'revision')::integer is distinct from eq.revision then raise exception 'BF_CHARACTER_CONFLICT'; end if;
 accessory:=nullif(p_payload->>'accessory','');background:=p_payload->>'background';
 select coalesce(sum(a.xp),0) into xp from public.activity_events a where a.student_id=actor.id;
 if accessory is not null and (not private.can_equip(actor.id,accessory,xp) or not exists(select 1 from public.character_catalog where key=accessory and slot='accessory')) then raise exception 'BF_ITEM_LOCKED'; end if;
 if background is null or not private.can_equip(actor.id,background,xp) or not exists(select 1 from public.character_catalog where key=background and slot='background') then raise exception 'BF_ITEM_LOCKED'; end if;
 update public.character_equipment set accessory_key=accessory,background_key=background,revision=revision+1,updated_at=now() where student_id=actor.id;
 result:=jsonb_build_object('revision',eq.revision+1);
 when 'decoration_shop' then
 if c.term_state<>'open' then raise exception 'BF_CLASS_ARCHIVED'; end if;
 select * into item from public.character_catalog where key=p_payload->>'itemKey' and source='shop';
 if not found then raise exception 'BF_INVALID_INPUT'; end if;
 result:=public.hub_command('shop_create',jsonb_build_object('classroomId',cls,'name',item.name,'kind','decoration','price',p_payload->'price','stock',p_payload->'stock'),p_request_id);
 update public.shop_items set appearance_key=item.key where id=(result->>'id')::uuid;
 result:=jsonb_build_object('id',result->>'id');
 when 'configure' then
 if c.term_state<>'open' then raise exception 'BF_CLASS_ARCHIVED'; end if;
 if exists(select 1 from public.term_promotions where source_classroom_id=cls or target_classroom_id=cls) then raise exception 'BF_TERM_HAS_PROGRESSION'; end if;
 if (p_payload->>'revision')::integer is distinct from c.term_revision then raise exception 'BF_TERM_CONFLICT'; end if;
 year:=(p_payload->>'year')::integer;term:=(p_payload->>'semester')::integer;grade:=nullif(p_payload->>'grade','')::integer;
 if year is null or year not between 2000 and 2100 or term is null or term not in (1,2) then raise exception 'BF_INVALID_INPUT'; end if;
 update public.classrooms set academic_year=year,semester=term,grade_level=grade,term_revision=term_revision+1 where id=cls;
 insert into public.class_term_events(classroom_id,actor_id,kind) values(cls,actor.id,'configured');result:=jsonb_build_object('id',cls);
 when 'archive' then
 if c.term_state<>'open' then raise exception 'BF_CLASS_ARCHIVED'; end if;
 if c.academic_year is null or c.semester is null then raise exception 'BF_TERM_PERIOD_REQUIRED'; end if;
 if p_payload->>'confirmed' is distinct from 'true' then raise exception 'BF_CONFIRM_REQUIRED'; end if;
 if (p_payload->>'revision')::integer is distinct from c.term_revision then raise exception 'BF_TERM_CONFLICT'; end if;
 if exists(select 1 from public.shop_orders where classroom_id=cls and status='pending') then raise exception 'BF_PENDING_ORDERS'; end if;
 if exists(select 1 from private.account_jobs j where not j.done and j.lease_until>clock_timestamp() and j.plan->>'classroomId'=cls::text) then raise exception 'BF_BUSY'; end if;
 update public.classrooms set term_state='archived',archived_at=clock_timestamp(),term_revision=term_revision+1 where id=cls;
 delete from public.class_invites where classroom_id=cls;
 insert into public.class_term_events(classroom_id,actor_id,kind) values(cls,actor.id,'archived');result:=jsonb_build_object('id',cls);
 when 'reopen' then
 if c.term_state<>'archived' or p_payload->>'confirmed' is distinct from 'true' then raise exception 'BF_INVALID_INPUT'; end if;
 if (p_payload->>'revision')::integer is distinct from c.term_revision then raise exception 'BF_TERM_CONFLICT'; end if;
 update public.classrooms set term_state='open',archived_at=null,term_revision=term_revision+1 where id=cls;
 insert into public.class_term_events(classroom_id,actor_id,kind) values(cls,actor.id,'reopened');result:=jsonb_build_object('id',cls);
 when 'promote' then
 if c.term_state<>'archived' then raise exception 'BF_ARCHIVE_FIRST'; end if;
 if (p_payload->>'revision')::integer is distinct from c.term_revision then raise exception 'BF_TERM_CONFLICT'; end if;
 if p_payload->>'confirmed' is distinct from 'true' then raise exception 'BF_CONFIRM_REQUIRED'; end if;
 year:=(p_payload->>'year')::integer;term:=(p_payload->>'semester')::integer;grade:=nullif(p_payload->>'grade','')::integer;
 if year is null or year not between 2000 and 2100 or term is null or term not in (1,2) or year*2+term<=c.academic_year*2+c.semester or length(btrim(coalesce(p_payload->>'name',''))) not between 1 and 80 then raise exception 'BF_INVALID_INPUT'; end if;
 if exists(select 1 from unnest(students) id where not exists(select 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.classroom_id=cls and e.student_id=id and e.active and p.role='student' and p.account_active) or exists(select 1 from private.deletion_requests d where d.student_id=id and (d.classroom_id=cls or d.scope='account') and d.status in ('approved','purged'))) then raise exception 'BF_FORBIDDEN'; end if;
 if exists(select 1 from public.promotion_memberships where source_classroom_id=cls and student_id=any(students) and academic_year=year and semester=term) then raise exception 'BF_ALREADY_PROMOTED'; end if;
 insert into public.classrooms(name,teacher_id,academic_year,semester,grade_level) values(btrim(p_payload->>'name'),actor.id,year,term,grade) returning id into target;
 insert into public.term_promotions(source_classroom_id,target_classroom_id,academic_year,semester,created_by) values(cls,target,year,term,actor.id) returning id into promotion;
 insert into public.promotion_memberships(promotion_id,source_classroom_id,target_classroom_id,student_id,academic_year,semester) select promotion,cls,target,id,year,term from unnest(students) id;
 insert into public.enrollments(classroom_id,student_id,active) select target,id,false from unnest(students) id;
 update public.classrooms set term_revision=term_revision+1 where id=cls;
 insert into public.class_term_events(classroom_id,actor_id,kind) values(cls,actor.id,'promoted');
 result:=jsonb_build_object('id',promotion,'targetClassId',target,'count',cardinality(students));
 when 'activate' then
 if c.term_state<>'open' then raise exception 'BF_CLASS_ARCHIVED'; end if;
 if not exists(select 1 from public.enrollments where classroom_id=cls and student_id=member.student_id) then raise exception 'BF_ENROLLMENT_CLOSED'; end if;
 select id into receipt from private.consent_requests where student_id=member.student_id and classroom_id=cls and status='approved' order by created_at desc limit 1;
 if receipt is null or not exists(select 1 from public.profiles where id=member.student_id and account_active and consent_status='verified') then raise exception 'BF_TERM_CONFIRMATION'; end if;
 if exists(select 1 from private.account_jobs j where not j.done and j.lease_until>clock_timestamp() and j.plan->>'studentId'=member.student_id::text) then raise exception 'BF_BUSY'; end if;
 update public.promotion_memberships set activated_at=clock_timestamp(),consent_id=receipt where id=member.id;
 update public.enrollments set active=true where classroom_id=cls and student_id=member.student_id;
 update private.managed_accounts set classroom_id=cls where student_id=member.student_id and classroom_id=member.source_classroom_id;
 insert into public.class_term_events(classroom_id,actor_id,student_id,kind) values(cls,actor.id,member.student_id,'activated');result:=jsonb_build_object('id',member.id);
 else raise exception 'BF_INVALID_COMMAND'; end case;
 insert into private.growth_term_requests values(actor.id,p_request_id,fingerprint,result,now());
 return result;
end $$;

create function public.term_state(p_classroom uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles; selected uuid; result jsonb;
begin
 if not private.session_ok(false) then raise exception 'BF_FORBIDDEN'; end if;
 select * into actor from public.profiles where id=auth.uid();
 if p_classroom is not null and not exists(select 1 from public.classrooms c where c.id=p_classroom and
 (c.teacher_id=actor.id or exists(select 1 from public.enrollments where classroom_id=c.id and student_id=actor.id) or exists(select 1 from public.promotion_memberships where target_classroom_id=c.id and student_id=actor.id))) then raise exception 'BF_FORBIDDEN'; end if;
 select c.id into selected from public.classrooms c where (p_classroom is null or c.id=p_classroom) and (c.teacher_id=actor.id or exists(select 1 from public.enrollments where classroom_id=c.id and student_id=actor.id) or exists(select 1 from public.promotion_memberships where target_classroom_id=c.id and student_id=actor.id)) order by c.term_state='open' desc,c.created_at desc,c.id limit 1;
 select jsonb_build_object('asOf',now(),'selected',selected,
 'classes',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('participating',exists(select 1 from public.enrollments where classroom_id=x.id and student_id=actor.id and active) and private.promoted_ready(x.id,actor.id))) from (select * from public.classrooms c where c.teacher_id=actor.id or exists(select 1 from public.enrollments where classroom_id=c.id and student_id=actor.id) or exists(select 1 from public.promotion_memberships where target_classroom_id=c.id and student_id=actor.id) order by c.created_at desc,c.id limit 1000) x),'[]'),
 'rosterTotal',case when private.is_teacher(selected) then (select count(*) from public.enrollments where classroom_id=selected) else 0 end,
 'roster',case when private.is_teacher(selected) then coalesce((select jsonb_agg(to_jsonb(x)) from (
 select e.student_id,p.display_name,e.active,p.account_active,p.consent_status,p.must_change_password,m.id membership_id,
 exists(select 1 from private.consent_requests r where r.student_id=p.id and r.classroom_id=selected and r.status='approved') consent_ready,
 private.promoted_ready(selected,p.id) confirmed,
 exists(select 1 from private.deletion_requests d where d.student_id=p.id and (d.classroom_id=selected or d.scope='account') and d.status in ('approved','purged')) deletion_pending
 from public.enrollments e join public.profiles p on p.id=e.student_id left join public.promotion_memberships m on m.target_classroom_id=e.classroom_id and m.student_id=e.student_id where e.classroom_id=selected order by p.display_name,p.id limit 200) x),'[]') else '[]'::jsonb end,
 'pending',case when private.is_teacher(selected) then jsonb_build_object(
 'orders',(select count(*) from public.shop_orders where classroom_id=selected and status='pending'),
 'writing',(select count(*) from public.latest_class_work where classroom_id=selected and status='submitted'),
 'revision',(select count(*) from public.latest_class_work where classroom_id=selected and status='revision_requested'),
 'reading',(select count(*) from public.reading_logs where classroom_id=selected and status='completed' and verified_at is null),
 'roles',(select count(*) from public.job_applications a join public.class_jobs j on j.id=a.job_id where j.classroom_id=selected and a.status in ('pending','assigned','submitted')),
 'contests',(select count(*) from public.contests where classroom_id=selected and status<>'published')) else null end,
 'promotions',coalesce((select jsonb_agg(to_jsonb(x)) from (
 select p.id,p.source_classroom_id,p.target_classroom_id,p.academic_year,p.semester,s.name source_name,t.name target_name,t.teacher_id=actor.id owned_target,
 (select count(*) from public.promotion_memberships where promotion_id=p.id and (actor.role='teacher' or student_id=actor.id)) prepared,
 (select count(*) from public.promotion_memberships m where m.promotion_id=p.id and (actor.role='teacher' or m.student_id=actor.id) and m.activated_at is not null and exists(select 1 from private.consent_requests where id=m.consent_id and status='approved')) activated
 from public.term_promotions p join public.classrooms s on s.id=p.source_classroom_id join public.classrooms t on t.id=p.target_classroom_id
 where (p.source_classroom_id=selected or p.target_classroom_id=selected) and (s.teacher_id=actor.id or t.teacher_id=actor.id or exists(select 1 from public.promotion_memberships where promotion_id=p.id and student_id=actor.id))
 order by p.created_at desc,p.id limit 100) x),'[]'),
 'events',case when private.is_teacher(selected) then coalesce((select jsonb_agg(to_jsonb(x)) from (select kind,created_at from public.class_term_events where classroom_id=selected order by created_at desc,id limit 20) x),'[]') else '[]'::jsonb end) into result;
 return result;
end $$;
revoke all on function public.term_state(uuid) from public,anon;
grant execute on function public.term_state(uuid) to authenticated;
revoke all on function public.growth_term_command(text,jsonb,uuid) from public,anon;
grant execute on function public.growth_term_command(text,jsonb,uuid) to authenticated;

-- Preserve class-scoped consent/deletion management; global password resets follow the primary managing class.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.account_job_begin(text,jsonb,uuid,text)'::regprocedure);
 if position('not private.can_manage_student(target,cls)' in definition)=0 then raise exception 'Reset authority anchor missing'; end if;
 definition:=replace(definition,'not private.can_manage_student(target,cls)','not private.can_reset_student(target,cls)');
 if position('select * into a from public.profiles where id=auth.uid() for update;' in definition)=0 then raise exception 'Account actor lock anchor missing'; end if;
 definition:=replace(definition,'select * into a from public.profiles where id=auth.uid() for update;',
 $extra$if p_kind='create_students' and not exists(select 1 from public.classrooms where id=(p_payload->>'classroomId')::uuid and term_state='open') then raise exception 'BF_CLASS_ARCHIVED'; end if;
 select * into a from public.profiles where id=auth.uid() for update;$extra$);
 execute definition;
 definition:=pg_get_functiondef('public.operations_state()'::regprocedure);
 if position('''login_id'',m.login_id,''last_activity''' in definition)=0 then raise exception 'Roster authority anchor missing'; end if;
 definition:=replace(definition,'''login_id'',m.login_id,''last_activity''','''login_id'',m.login_id,''managed_classroom_id'',m.classroom_id,''can_reset'',(op or (m.classroom_id=e.classroom_id and private.is_teacher(m.classroom_id))),''last_activity''');execute definition;
 definition:=pg_get_functiondef('public.teacher_overview(uuid,integer)'::regprocedure);
 if position('where teacher_id=auth.uid() and (p_classroom is null or id=p_classroom)' in definition)=0 then raise exception 'Overview class anchor missing'; end if;
 definition:=replace(definition,'where teacher_id=auth.uid() and (p_classroom is null or id=p_classroom)','where teacher_id=auth.uid() and ((p_classroom is null and term_state=''open'') or id=p_classroom)');execute definition;
end $$;
