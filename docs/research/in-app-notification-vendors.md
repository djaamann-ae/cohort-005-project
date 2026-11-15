# In-app notification vendors

Research for [issue #2](https://github.com/djaamann-ae/cohort-005-project/issues/2) — which hosted
third-party services could handle Cadence's **in-app** notification feed.

Research date: **2026-11-15**. Every claim below is sourced from the vendor's own documentation or
API reference; no blog roundups or comparison sites were used. Where a vendor's docs could not be
reached, that is recorded as a finding rather than filled in from secondary sources.

This file does **not** pick a winner — that is
[issue #5](https://github.com/djaamann-ae/cohort-005-project/issues/5)'s job. Pricing, free-tier
quotas, credit-card-at-signup and per-recipient billing are deliberately **out of scope** here and
belong to [issue #6](https://github.com/djaamann-ae/cohort-005-project/issues/6).

## Axes

For each vendor:

1. **In-app feed** — a persisted, per-recipient inbox with read/unread state as a first-class
   channel, not just push/email/SMS fan-out.
2. **React components** — drop-in inbox, headless hooks, or neither; and whether they survive SSR
   under React Router 8 or are client-only.
3. **Recipient/identity model** — how rows in Cadence's `users` table would become recipients.
4. **Real-time** — does the feed update live out of the box, over what transport.
5. **Email door** — anything that would preclude later migrating transactional email onto the same
   vendor.

## Vendors

<!-- one section per vendor, appended as each is finished -->

### Knock

Docs reachable 2026-11-15.

**In-app feed.** Yes — a first-class channel type. Knock's in-app UI overview defines a feed as
"a type of in-app channel that returns a per-user list of in-app messages to render in a feed-based
UI", and says Knock handles "accurate badge counts, polymorphic notifications, read, seen and
archive tracking". So read/unread is not something we would model ourselves; Knock persists
per-recipient `seen`, `read` and `archived` state.
Source: <https://docs.knock.app/in-app-ui/overview>

**React components.** Two packages: `@knocklabs/react` (UI) and `@knocklabs/client` (underlying
client). Drop-in components are `NotificationFeed`, `NotificationFeedPopover` and
`NotificationIconButton`; providers are `KnockProvider` and `KnockFeedProvider`; headless hooks are
`useKnockFeed`, `useNotifications` and `useNotificationStore`. Knock explicitly supports using the
library "in a headless way and bring your own UI".
Sources: <https://docs.knock.app/in-app-ui/react/overview>, <https://docs.knock.app/sdks/react/reference>

**SSR.** The prose docs never discuss SSR, `"use client"`, or client-only mounting — that is a gap
in the documentation, not a silence that means "fine". The vendor's own published source answers it:
`packages/react/src/index.ts` begins with the literal directive `"use client";` as its first line,
and the package also ships dedicated `./next` and `./tanstack` subpath exports alongside the root
one (`package.json` `exports`). `KnockProvider` builds its authenticate options in a `React.useMemo`
and hands them to `useAuthenticatedKnockClient` during render, i.e. on the server too under a React
Router SSR pass. The provider does expose an escape hatch for exactly this: an `enabled` prop whose
doc comment reads "When `false`, render children but keep the Knock client idle: no identify call,
no API requests, and no websocket. Set it to `true` and it connects like a login". There is also an
`identificationStrategy` prop on the `user` variant. Practical read for Cadence: treat the feed as
a client-only island (mount after hydration, or gate with `enabled`), and do the identify server-side.
Sources (vendor repo `knocklabs/javascript`, read 2026-11-15, `@knocklabs/react` v0.15.1):
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/index.ts>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/package.json>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react-core/src/modules/core/context/KnockProvider.tsx>

**Recipient/identity model.** A recipient is "any User or Object that may wish to receive
notifications". A recipient carries an identifier ("a string from your system that uniquely
represents the recipient"), properties, preferences and channel data. Identifiers may be a bare user
ID string (`user-1`), an object reference (`{ collection, id }`), or an inline-identification
dictionary for lazy identification at workflow-trigger time. Recipients must be synced into Knock by
an "identification" step, either pre-emptively or inline on trigger. The API for this is
`PUT /v1/users/{user_id}` with the ID supplied by the caller in the path, and a body accepting
`email`, `name`, `timezone`, `preferences`, `channel_data` plus "any additional properties you'd
like to upsert".
Mapping for Cadence: our `users.id` becomes the Knock `user_id` directly; no vendor-side surrogate
ID to store, so no new column is strictly required.
Sources: <https://docs.knock.app/concepts/recipients>, <https://docs.knock.app/api-reference/users/update>

**Real-time.** Yes, out of the box. The in-app UI overview states "websocket support, no
infrastructure setup required".
Source: <https://docs.knock.app/in-app-ui/overview>

**Email door.** Left open. Email is a first-class Knock channel ("effortlessly design and deliver
email notifications to downstream providers"), but Knock does not send mail itself — it fans out to
a provider account you connect. The integrations overview lists Amazon SES, Cloudflare Email,
MailerSend, Mailgun, Mailjet, Mailtrap, Mandrill, Postmark, Resend, SendGrid, SMTP and SparkPost,
plus a Knock-hosted provider marked testing-only. Nothing here precludes moving Cadence's
transactional email onto Knock later; it does mean "migrating email onto Knock" means
Knock-for-orchestration **plus** a separate ESP account, not Knock alone.
Source: <https://docs.knock.app/integrations/email/overview>

**Could not verify.** Whether `NotificationFeed` renders meaningful markup during an SSR pass (vs.
an empty shell) — not stated in docs, and not determinable without running it. Deferred to
[#6](https://github.com/djaamann-ae/cohort-005-project/issues/6).
