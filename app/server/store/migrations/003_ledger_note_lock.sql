-- The note on a confirmed ledger row is locked too, except when the row is being voided (which records the reason).
CREATE OR REPLACE FUNCTION ledger_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  f text;
BEGIN
  IF OLD.collection <> 'ledger' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Ledger records cannot be deleted' USING ERRCODE = 'check_violation', CONSTRAINT = 'ledger_no_delete';
  END IF;
  IF OLD.data ->> 'status' = 'Void' AND NEW.data ->> 'status' IS DISTINCT FROM 'Void' THEN
    RAISE EXCEPTION 'A voided transaction stays void' USING ERRCODE = 'check_violation', CONSTRAINT = 'ledger_void_final';
  END IF;
  IF OLD.data ->> 'status' = 'Confirmed' THEN
    IF NEW.data ->> 'status' NOT IN ('Confirmed', 'Void') THEN
      RAISE EXCEPTION 'A confirmed transaction can only be voided' USING ERRCODE = 'check_violation', CONSTRAINT = 'ledger_confirmed_locked';
    END IF;
    FOREACH f IN ARRAY ARRAY['txnId', 'providerRef', 'alumniId', 'event', 'type', 'kind', 'amount', 'receivedBy', 'date'] LOOP
      IF (OLD.data -> f) IS DISTINCT FROM (NEW.data -> f) THEN
        RAISE EXCEPTION 'Confirmed transaction field % is locked', f USING ERRCODE = 'check_violation', CONSTRAINT = 'ledger_confirmed_locked', COLUMN = f;
      END IF;
    END LOOP;
    IF NEW.data ->> 'status' = 'Confirmed' AND (OLD.data -> 'note') IS DISTINCT FROM (NEW.data -> 'note') THEN
      RAISE EXCEPTION 'Confirmed transaction field note is locked' USING ERRCODE = 'check_violation', CONSTRAINT = 'ledger_confirmed_locked', COLUMN = 'note';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
