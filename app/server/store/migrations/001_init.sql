-- MPHS schema v1. Records keep their fields in JSONB; the rules that protect money and identity are enforced here.

CREATE TABLE meta (
  key   text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE records (
  seq        bigserial,
  collection text        NOT NULL,
  id         text        NOT NULL,
  version    integer     NOT NULL DEFAULT 1 CHECK (version > 0),
  data       jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text        NOT NULL,
  PRIMARY KEY (collection, id),
  CONSTRAINT ledger_amount_nonnegative CHECK (
    collection <> 'ledger' OR jsonb_typeof(data -> 'amount') IS DISTINCT FROM 'number' OR (data ->> 'amount')::numeric >= 0
  )
);
CREATE INDEX records_collection_seq ON records (collection, seq);

-- Duplicate transaction IDs / provider references are rejected regardless of case or surrounding spaces.
CREATE UNIQUE INDEX records_ledger_txn ON records (upper(btrim(data ->> 'txnId'))) WHERE collection = 'ledger';
CREATE UNIQUE INDEX records_ledger_ref ON records (upper(btrim(data ->> 'providerRef')))
  WHERE collection = 'ledger' AND coalesce(btrim(data ->> 'providerRef'), '') <> '';
-- One cabin row per Cabin ID; one participation row per person per event.
CREATE UNIQUE INDEX records_cabin_id ON records (upper(btrim(data ->> 'cabinId'))) WHERE collection = 'cabins';
CREATE UNIQUE INDEX records_participation ON records ((data ->> 'alumniId'), (data ->> 'event')) WHERE collection = 'participation';

-- Ledger rows are never deleted; confirmed rows are locked except for voiding; void is final.
CREATE FUNCTION ledger_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER records_ledger_guard BEFORE UPDATE OR DELETE ON records FOR EACH ROW EXECUTE FUNCTION ledger_guard();

CREATE TABLE audit (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  user_id    text        NOT NULL,
  action     text        NOT NULL,
  collection text        NOT NULL,
  record_id  text        NOT NULL,
  fields     text[]      NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_lookup ON audit (collection, record_id, id);

CREATE FUNCTION audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'The audit log is append-only' USING ERRCODE = 'check_violation', CONSTRAINT = 'audit_append_only';
END;
$$;
CREATE TRIGGER audit_no_change BEFORE UPDATE OR DELETE ON audit FOR EACH ROW EXECUTE FUNCTION audit_append_only();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit FOR EACH STATEMENT EXECUTE FUNCTION audit_append_only();

CREATE TABLE users (
  id                text PRIMARY KEY,
  username          text NOT NULL UNIQUE,
  email             text NOT NULL DEFAULT '',
  display_name      text NOT NULL,
  role              text NOT NULL CHECK (role IN ('classmate', 'organizer', 'admin')),
  extra_permissions text[] NOT NULL DEFAULT '{}',
  alumni_id         text,
  active            boolean NOT NULL DEFAULT true,
  demo              boolean NOT NULL DEFAULT false,
  salt              text,
  hash              text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email ON users (lower(email)) WHERE email <> '';

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE auth_states (
  state      text PRIMARY KEY,
  data       jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);
