-- Restrict function privileges in schema public.
--
-- Callers without a session (anon, PUBLIC) no longer hold EXECUTE on the
-- application's functions, and functions created from now on do not get it.
-- The three checkout RPCs are executable by the service role only: the
-- edge functions process-payment, process-split-payment and
-- process-direct-sale are their only callers.
--
-- Access for signed-in staff and for the service role is preserved on every
-- other function by granting it explicitly before the revoke.
--
-- Functions owned by another role cannot be changed from here; they are
-- reported as warnings and are caught by scripts/sql/verify-function-privileges.sql.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS sig, pg_get_userbyid(p.proowner) AS owner_name
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    IF r.owner_name <> current_user THEN
      RAISE WARNING 'not changed: % is owned by % (migration role is %)', r.sig, r.owner_name, current_user;
      CONTINUE;
    END IF;

    IF has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
    IF has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('process_payment_atomic', 'process_split_payment_atomic',
                        'process_direct_sale_atomic')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Functions created by this role from now on: no EXECUTE for PUBLIC or anon.
-- Signed-in staff and the service role keep the existing schema-level default.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
