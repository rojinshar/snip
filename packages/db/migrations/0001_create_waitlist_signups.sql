-- Waitlist sign-ups from the landing page.
-- Applied by `npm run db:migrate`.

CREATE TABLE IF NOT EXISTS waitlist_signups (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       text        NOT NULL,
  source      text,                       -- e.g. "reddit-latex", from ?ref=
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waitlist_signups_email_lowercase CHECK (email = lower(email))
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_signups_email_key ON waitlist_signups (email);
