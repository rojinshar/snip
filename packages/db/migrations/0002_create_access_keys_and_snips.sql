-- Beta access keys and per-request usage (docs/beta-v1.md §4–5). Applied by `npm run db:migrate`.

-- Only the SHA-256 of a key is stored; the key itself is shown once, when it is created.
CREATE TABLE IF NOT EXISTS access_keys (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key_hash       text        NOT NULL,              -- hex SHA-256 of the full key
  key_hint       text        NOT NULL,              -- last 4 characters, to tell keys apart
  email          text        NOT NULL,              -- tester contact
  monthly_quota  integer     NOT NULL,              -- successful snips per calendar month (UTC)
  created_at     timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  CONSTRAINT access_keys_key_hash_format CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT access_keys_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT access_keys_quota_nonnegative CHECK (monthly_quota >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS access_keys_key_hash_key ON access_keys (key_hash);

-- One row per recognition request that reached Gemini. Metadata only: no image, no LaTeX.
CREATE TABLE IF NOT EXISTS snips (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key_id         bigint      NOT NULL REFERENCES access_keys (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  status         smallint    NOT NULL,              -- HTTP status returned to the app
  engine         text,                              -- engine that produced the answer
  input_tokens   integer     NOT NULL DEFAULT 0,
  output_tokens  integer     NOT NULL DEFAULT 0,
  cost_usd       numeric(12, 8) NOT NULL DEFAULT 0,
  ms             integer     NOT NULL
);

-- Quota and rate limit: a key's rows in a time window. Spending cap: all rows today.
CREATE INDEX IF NOT EXISTS snips_key_id_created_at ON snips (key_id, created_at);
CREATE INDEX IF NOT EXISTS snips_created_at ON snips (created_at);
