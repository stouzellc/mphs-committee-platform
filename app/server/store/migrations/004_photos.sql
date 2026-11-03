-- Memory photos, stored apart from the JSON records (one per memory). Metadata is removed before a photo is saved.
CREATE TABLE photos (
  memory_id  text        PRIMARY KEY,
  mime       text        NOT NULL CHECK (mime IN ('image/jpeg', 'image/png')),
  bytes      bytea       NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 5242880),
  sha256     text        NOT NULL,
  created_by text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
