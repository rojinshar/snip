-- Self-registration (docs/beta-v1.md §15). Applied by `npm run db:migrate`.

-- Keys the app registers for itself have no email.
ALTER TABLE access_keys ALTER COLUMN email DROP NOT NULL;

-- invite: made with `npm run keys`. app: registered by the app on first launch.
ALTER TABLE access_keys
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'invite'
  CONSTRAINT access_keys_source_known CHECK (source IN ('invite', 'app'));

-- One row per self-registration, for the per-IP limit. Holds an HMAC of the IP, never the IP,
-- and rows older than a day are deleted on the next registration.
CREATE TABLE IF NOT EXISTS registrations (
  ip_hash     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT registrations_ip_hash_format CHECK (ip_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS registrations_ip_hash_created_at ON registrations (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS registrations_created_at ON registrations (created_at);
