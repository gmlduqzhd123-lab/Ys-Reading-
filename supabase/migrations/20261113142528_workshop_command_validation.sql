-- Reject null commands before routing; preserve already-applied migration history.
do $$declare d text;anchor text:='if p_command not in(''activity_schedule'',''library_update'',''library_delete'',''share_revoke_student'')';begin
 d:=pg_get_functiondef('public.classroom_tool_command(text,uuid,jsonb,uuid)'::regprocedure);
 if position(anchor in d)=0 then raise exception 'Workshop command guard anchor missing';end if;
 d:=replace(d,anchor,'if p_command is null then raise exception ''BF_INVALID_COMMAND'';end if;'||anchor);execute d;
end $$;
