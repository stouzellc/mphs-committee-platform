-- One-time invite / password-reset links (only a hash of each token is stored) and sign-in failure tracking.

CREATE TABLE invites (
  token_hash text PRIMARY KEY,
  user_id    text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose    text        NOT NULL CHECK (purpose IN ('invite', 'reset')),
  created_by text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX invites_user ON invites (user_id, created_at DESC);

CREATE TABLE login_failures (
  id  bigserial PRIMARY KEY,
  key text        NOT NULL,
  at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_failures_key ON login_failures (key, at);
