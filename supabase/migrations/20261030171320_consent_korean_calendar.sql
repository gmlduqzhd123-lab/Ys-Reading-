-- Consent evidence dates follow the Korean school calendar, including 00:00–08:59
-- when the hosted database's UTC CURRENT_DATE still points to the previous day.
-- Function-local configuration restores the caller's timezone on return and
-- preserves the existing authorization, grants and locked search_path.
alter function public.operations_command(text,jsonb,uuid)
  set timezone = 'Asia/Seoul';
