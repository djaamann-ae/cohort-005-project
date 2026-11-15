# Knock handles in-app notifications

In-app notifications are delivered by Knock, a hosted notification service, rather than by a `notifications` table in Cadence's own schema. Recipients key on `users.id` directly, so no new column exists for a vendor-side identifier. Knock persists read, seen and archive state and the unread count; Cadence stores none of it.

Cadence sends two notifications: a Student whose question gets a staff reply, and the buyer of a Purchase whose Refund Request is decided. Knock owns the in-app channel only — the existing Postmark path in `app/lib/mailer.server.ts` is untouched.

## Considered Options

- **A `notifications` table in Cadence.** Cheaper for the two notifications we actually send: a couple of hundred lines, no identity sync, no third-party outage in the refund path, and the unread count becomes an ordinary SQL query. Rejected as a deliberate trade, not an oversight. The catalogue came in at two entries *after* the decision to use a hosted service was taken, and we kept the vendor knowing the volume no longer justifies it on cost alone.
- **Courier, MagicBell, Engagespot, SuprSend.** All four require a server-minted JWT for the browser — a resource route, token lifetimes and a refresh story. At two notifications, scaffolding dominates total cost, so needing only a public key and a user id decided the shortlist.
- **Novu Cloud.** The other no-JWT option, and the second choice. Its Inbox mounts in a shadow root, so Cadence's Tailwind config, CSS variables and component tokens do not reach inside it; the feed is styled through Novu's appearance API and stays a slightly foreign object in the sidebar. Knock's components are ordinary DOM. Novu wins instead if Knock's commercial terms turn out to be unworkable, which is unknown here — pricing and quota facts are not discoverable from public pages and are confirmed on signup.

## Consequences

Notification copy lives in Knock's dashboard, not in this repo. The words a Student reads when their refund is declined are not in git, do not go through code review, and are not covered by `npm run test`. Where that matters, pass the substance — course title, the Platform Admin's decision note — as template data from Cadence, so only the surrounding wording lives at Knock.

The feed cannot be server-rendered. Knock's `KnockProvider` builds its auth options during render, including the SSR pass, so the client is gated with the `enabled` prop or mounted after hydration. The notification bell is absent from the SSR payload on every page load. This is true of every vendor surveyed, not a Knock-specific cost.

Cadence cannot answer "how many unread notifications does this Student have?" in SQL. That state lives at Knock, which rules it out of any query, report or email that would need to join against it.
