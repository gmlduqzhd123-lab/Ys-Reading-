do $$declare definition text;begin
 definition:=pg_get_functiondef('public.batch_report_drafts(uuid,date,date,jsonb,uuid)'::regprocedure);
 if position('jsonb_typeof(p_items)<>''array''' in definition)=0 then raise exception 'Batch input anchor missing';end if;
 execute replace(definition,'jsonb_typeof(p_items)<>''array''','jsonb_typeof(p_items) is distinct from ''array''');
end $$;
