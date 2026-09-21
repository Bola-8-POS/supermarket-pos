\set ON_ERROR_STOP on
-- Assertions: staff directory view and server-side PIN checks.
-- Run as the migration role against a writable connection:
--   psql -v ON_ERROR_STOP=1 < scripts/sql/verify-staff-pin-checks.sql
-- Static catalog checks only; behavior lives in
-- src/entities/staff/model/pin-checks.integration.test.ts.
DO $$
DECLARE
  v_cols text;
  v_bad  text;
BEGIN
  -- 1. The directory view has exactly the agreed columns.
  SELECT string_agg(column_name, ',' ORDER BY ordinal_position) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'staff_directory';
  IF v_cols IS DISTINCT FROM 'id,name,role,is_active,must_change_pin,locale' THEN
    RAISE EXCEPTION 'staff_directory columns are %', coalesce(v_cols, '<view missing>');
  END IF;

  -- 2. Signed-out and signed-in roles can read the view and cannot write through it.
  IF NOT has_table_privilege('anon', 'public.staff_directory', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.staff_directory', 'SELECT') THEN
    RAISE EXCEPTION 'staff_directory is not readable by the client roles';
  END IF;
  SELECT string_agg(r || ':' || p, ', ') INTO v_bad
  FROM unnest(ARRAY['anon', 'authenticated']) r,
       unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
  WHERE has_table_privilege(r, 'public.staff_directory', p);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'staff_directory write privileges present: %', v_bad;
  END IF;

  -- 3. The attempt table is closed to the client roles and has row security on.
  SELECT string_agg(r || ':' || p, ', ') INTO v_bad
  FROM unnest(ARRAY['anon', 'authenticated']) r,
       unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
  WHERE has_table_privilege(r, 'public.pin_attempts', p);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'pin_attempts privileges present: %', v_bad;
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.pin_attempts'::regclass) THEN
    RAISE EXCEPTION 'pin_attempts has row security off';
  END IF;

  -- 4. Function privileges.
  IF has_function_privilege('authenticated', 'public.pin_attempt_record(text, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pin_attempt_retry_after(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.pin_attempt_record(text, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.pin_attempt_retry_after(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'attempt helpers must be callable by the service role only';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.pin_attempt_record(text, boolean)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.pin_attempt_retry_after(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'the service role cannot call the attempt helpers';
  END IF;
  IF has_function_privilege('anon', 'public.verify_staff_pin(text, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.verify_staff_pin(text, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.staff_pin_holder(text, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.staff_pin_holder(text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'verify_staff_pin or staff_pin_holder privileges are wrong';
  END IF;

  -- 5. The check records a failure instead of raising, so the count survives.
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.verify_staff_pin(text, uuid)'::regprocedure
                 AND prosrc LIKE '%pin_attempt_record%' AND prosrc LIKE '%pin_attempt_retry_after%') THEN
    RAISE EXCEPTION 'verify_staff_pin does not use the attempt helpers';
  END IF;
END $$;
SELECT 'verify-staff-pin-checks: ok' AS result;
