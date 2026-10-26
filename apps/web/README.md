# apps/web (planned)

Next.js app for snip's website.

- **Now:** landing page with a demo GIF and the waitlist from the validation plan.
- **Later:** sign-in, account page (snip usage, plan), Stripe checkout and billing portal,
  and SEO pages ("image to LaTeX", "Mathpix alternative free", ...).

Talks to `apps/api` over HTTP. Does not import `@snip/engine` directly.
