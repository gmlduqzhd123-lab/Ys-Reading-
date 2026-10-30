-- A representative teacher can identify a requesting class by name.
alter table public.grade_members add column classroom_name text not null default '';
update public.grade_members m set classroom_name=c.name from public.classrooms c where c.id=m.classroom_id;
alter table public.grade_members add constraint grade_member_name_length check(length(classroom_name) between 2 and 80);
create function private.grade_member_label() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select name into new.classroom_name from public.classrooms where id=new.classroom_id;
 return new;
end $$;
revoke all on function private.grade_member_label() from public,anon,authenticated;
create trigger grade_member_label before insert or update of classroom_id on public.grade_members for each row execute function private.grade_member_label();
