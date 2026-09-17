-- Case-insensitive, trimmed email uniqueness among non-deleted accounts.
-- This transaction deliberately aborts if existing accounts conflict; resolve those
-- identities explicitly before re-running. No account is merged or deleted here.
BEGIN;
LOCK TABLE public."user" IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
 IF EXISTS (
  SELECT lower(btrim(email)) FROM public."user" WHERE deleted_at IS NULL
  GROUP BY lower(btrim(email)) HAVING count(*) > 1
 ) THEN
  RAISE EXCEPTION 'Duplicate active email identities exist; resolve them before applying this migration';
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS user_email_active_unique
 ON public."user" (lower(btrim(email))) WHERE deleted_at IS NULL;
COMMIT;
