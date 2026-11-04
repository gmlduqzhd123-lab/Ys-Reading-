-- A delayed failure from the original lease must never undo completion.
do $$declare d text;anchor text:='if p_action=''reserve'' then';begin
 d:=pg_get_functiondef('public.google_export_job(text,uuid,text,uuid,jsonb)'::regprocedure);
 if position(anchor in d)=0 then raise exception 'Export completion anchor missing';end if;
 execute replace(d,anchor,'if j.state=''complete'' then return jsonb_build_object(''state'',j.state,''result'',j.result);end if;'||anchor);
end $$;
