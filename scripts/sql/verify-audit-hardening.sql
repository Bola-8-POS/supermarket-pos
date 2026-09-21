-- Assertions: audit payload construction and actor handling.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('set_own_locale', 'force_pin_change', 'clear_must_change_pin')
      AND prosrc ~* 'to_jsonb\s*\(\s*p\s*\)'
  ) THEN
    RAISE EXCEPTION 'a profile-row payload is still built with to_jsonb(p)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'record_audit'
      AND prosrc LIKE '%audit_redact%' AND prosrc LIKE '%service_role%'
  ) THEN
    RAISE EXCEPTION 'record_audit does not redact payloads or restrict the actor';
  END IF;

  IF public.audit_redact('{"pin":"x","keep":1,"n":{"new_pin":"y"},"l":[{"old_pin":"z","ok":true}]}'::jsonb)
     IS DISTINCT FROM '{"keep":1,"n":{},"l":[{"ok":true}]}'::jsonb THEN
    RAISE EXCEPTION 'audit_redact returned an unexpected payload';
  END IF;
END $$;
SELECT 'verify-audit-hardening: ok' AS result;
