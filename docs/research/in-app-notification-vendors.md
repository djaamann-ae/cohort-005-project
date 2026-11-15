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

### Novu Cloud

Docs reachable 2026-11-15.

**In-app feed.** Yes — Novu calls it the **Inbox**, "a centralized place to view and manage
notifications", which "automatically fetches user notifications and manages the real-time unread
count". Per-notification state in the client model includes `read`, `seen`, `archived` and
`snoozedUntil`, so read/unread is vendor-persisted.
Sources: <https://docs.novu.co/platform/inbox/overview>,
<https://raw.githubusercontent.com/novuhq/novu/next/packages/js/src/ws/socket.ts>

**React components.** Package `@novu/react` (v3.19.2 at time of reading), requiring React 18.0.0 or
later. Composable drop-ins: `<Inbox />`, `<Bell />`, `<Notifications />`, `<InboxContent />`,
`<Preferences />`. Headless usage is first-class: `@novu/react/hooks` exports `NovuProvider`,
`useNovu`, `useNotifications`, `useCounts`, `usePreferences`, and a set of subscription/channel
hooks; `@novu/js` is the framework-agnostic client underneath.
Sources: <https://docs.novu.co/platform/inbox/overview>,
<https://raw.githubusercontent.com/novuhq/novu/next/packages/react/src/hooks/index.ts>,
<https://raw.githubusercontent.com/novuhq/novu/next/packages/react/package.json>

**SSR.** This is the sharpest finding on this axis, and it comes from the vendor's own source rather
than its prose docs. `@novu/react`'s `package.json` declares a *browser* condition pointing at
`dist/esm/index.js` and a *non-browser* (server) condition pointing at a separate
`dist/esm/server/index.js`. That server build is a set of deliberate no-ops. Its source carries the
comment:

> Exporting all components from the components folder as empty functions to fix build errors in SSR.
> This will be replaced with actual components when we implement the SSR components in `@novu/js/ui`

`Inbox` on the server renders only a `<ShadowRootDetector />`; `InboxContent`, `Notifications` and
`NotificationItem` and its parts are stubs that return `null`. Reading: Novu's Inbox is
**client-only by construction** — it will not blow up a React Router SSR render (the server build
exists precisely so it does not), but it also produces no server markup, and the UI itself is
rendered into a shadow root on the client. Server-rendered inbox components are an acknowledged
not-yet.
Sources (vendor repo `novuhq/novu`, branch `next`, read 2026-11-15):
<https://raw.githubusercontent.com/novuhq/novu/next/packages/react/src/server/index.tsx>,
<https://raw.githubusercontent.com/novuhq/novu/next/packages/react/package.json>

**Recipient/identity model.** A **subscriber**, "a notification recipient in Novu, identified by a
unique `subscriberId`". The docs say the `subscriberId` must be "stable and unique within your
system" and should align with your application's internal user ID. Fields split into structured user
data (`email`, `phone`, `firstName`, `locale`), arbitrary custom JSON under `data`, and channel
credentials (`deviceTokens`, `webhookUrl`). Three creation routes: just-in-time on
`POST https://api.novu.co/v1/events/trigger` (Novu creates or updates the subscriber from the
payload), explicit `POST https://api.novu.co/v2/subscribers`, and bulk
`POST https://api.novu.co/v1/subscribers/bulk` (up to 500).
Mapping for Cadence: `users.id` becomes `subscriberId` directly; no extra column needed, and no
up-front sync pass is required because trigger-time upsert exists.
Source: <https://docs.novu.co/platform/concepts/subscribers>

**Real-time.** Yes, over a WebSocket. The docs say the `useNotifications` and `useCounts` hooks
"automatically listen for real-time events". The transport is not named in the prose docs, but the
client source is explicit: `@novu/js` uses `socket.io-client` against a production socket URL of
`https://ws.novu.co`, emitting `notifications.notification_received`,
`notifications.unseen_count_changed` and `notifications.unread_count_changed`.
Sources: <https://docs.novu.co/platform/inbox/headless/api-reference>,
<https://raw.githubusercontent.com/novuhq/novu/next/packages/js/src/ws/socket.ts>

**Email door.** Left open, with the same shape as Knock. Email is a first-class channel, but "Novu
does not send emails directly" — "You must set up each provider individually in the Novu dashboard
to enable delivery through the Email channel." Listed providers include SendGrid, Amazon SES,
Resend, Postmark, Brevo, Sinch Mailgun, Mailjet, SparkPost, Mandrill, Outlook 365, Infobip, Braze,
MailerSend, Mailtrap, Netcore, Plunk, Anypost, an Email Webhook and custom SMTP. Multi-provider is
supported.
Source: <https://docs.novu.co/platform/integrations/email>

### Courier

Docs reachable 2026-11-15.

**In-app feed.** Yes — Courier **Inbox**, "an embeddable in-app notification center", with "unread
counts and badges", "read and archive actions" and message-level buttons. "Every state change (read,
opened, archived) syncs instantly across a user's signed-in devices", so state is vendor-persisted
per recipient, not per device.
Source: <https://www.courier.com/docs/platform/inbox/>

**React components.** Current package is `@trycourier/courier-react` (v9) for React 18+, with
`@trycourier/courier-react-17` for React 17. Components: `<CourierInbox />`,
`<CourierInboxPopupMenu />`, `<CourierToast />`, `<CourierPreferences />`. Headless path is the
`useCourier()` hook, which returns `{ shared, auth, inbox, toast, preferences }` for building custom
UI. Note that the older `@trycourier/courier-react` monorepo (`trycourier/courier-react` on GitHub,
packages `react-inbox`, `react-provider`, `react-hooks`, `react-toast`) is **deprecated** — its
README opens with "🚨 THIS PROJECT HAS MOVED 🚨 / This repository is deprecated", pointing at the v9
SDK. Anything we find referring to `CourierProvider` / `@trycourier/react-inbox` is the old
generation.
Sources: <https://www.courier.com/docs/platform/inbox/>,
<https://www.courier.com/docs/sdk-libraries/courier-react-web>,
<https://raw.githubusercontent.com/trycourier/courier-react/main/README.md>

**SSR.** Courier is the one vendor here that states it outright in prose: "Courier Inbox and Toast
support Next.js but render client-side only", and for Next.js 13+ "add `'use client'` at the top of
component files". For Cadence that reads as: usable in a React Router 8 SSR app, but the inbox is a
client-only island — no server markup.
Source: <https://www.courier.com/docs/sdk-libraries/courier-react-web>

**Recipient/identity model.** "A user is the stored record Courier uses to reach one person." The
`user_id` is "the id your own system already uses for that person" — any string, no mapping table.
Create/update is one upsert call, `POST /profiles/{user_id}`, with a body of
`{ "profile": { email, phone_number, locale, custom: { ... } } }`; omitted fields are preserved, so
it is safe to run on every change to our own row. Profile fields are addressable in templates as
`{profile.name}`, `{profile.custom.company}`.
One extra moving part versus Knock/Novu: the browser SDK authenticates with a **JWT minted
server-side** — `auth.signIn({ userId, jwt })`. That means a Cadence loader/resource route that
mints a Courier token for the signed-in user, not just passing a public key plus user id.
Sources: <https://www.courier.com/docs/platform/users/>,
<https://www.courier.com/docs/sdk-libraries/courier-react-web>

**Real-time.** Yes, WebSocket, but **opt-in in code**: "Call `inbox.listenForUpdates()` after you
authenticate. It opens the WebSocket connection required for real-time updates." Without that call
the inbox loads once and does not update.
Source: <https://www.courier.com/docs/sdk-libraries/courier-react-web>

**Email door.** Left open, same orchestration-not-delivery shape. "Courier isn't an email provider.
It sends through the providers you connect, such as Amazon SES, SendGrid, Postmark, or Resend, and
adds templates, user preferences, message logs, and more channels on top." Listed providers include
Amazon SES, SendGrid, Postmark, Mailgun, Resend, SMTP, Mandrill, SparkPost, Mailjet, MailerSend,
Amply, Gmail and OneSignal, with provider failover.
Source: <https://www.courier.com/docs/platform/channels/email/>

### MagicBell

Docs reachable 2026-11-15.

**In-app feed.** Yes, and it is the product's centre of gravity — MagicBell bills itself as "The
Notification Inbox for web & mobile apps". The in-app channel docs: "The inbox displays a
chronological list of notifications for the current user. It supports read/unread states,
pagination, and real-time updates", and "Users can view, mark as read, archive, and delete
notifications directly from the inbox."
Sources: <https://www.magicbell.com/docs/>, <https://www.magicbell.com/docs/channels/in_app>

**React components.** Package `@magicbell/react` (v1.14.0 on npm at time of reading). Components:
`ContextProvider`, `FloatingInbox`, `Inbox`, `InlineNotification`, `ToastContainer`,
`UserPreferences`, `WebPushButton`, `SlackButton`, `SlackbotButton`. The same component set is also
published for Preact, Svelte and as Web Components — consistent with the components being generated
from one source rather than hand-written per framework.
`ContextProvider` takes a `token` (a **User JWT**), and the docs are explicit that you "generate
these on your own server" via the Authentication API.
Sources: <https://www.magicbell.com/docs/libraries/magicbell-react>, <https://unpkg.com/@magicbell/react/package.json>

**SSR.** The docs say nothing about SSR, `"use client"` or client-only rendering — a documentation
gap. The published package answers it, and answers it better than the others: every published
component module begins with the literal `"use client";` directive (verified in
`dist/esm/context-provider.js`, `dist/esm/inbox.js`, `dist/esm/floating-inbox.js` of
`@magicbell/react@1.14.0`), and the realtime layer carries an explicit SSR guard — the socket is
constructed with `startClosed: typeof window === "undefined" || typeof document === "undefined"`.
So the socket will not try to open during a React Router server render. As with every other vendor
here, the feed content itself still arrives on the client.
Sources (published package, read 2026-11-15):
<https://unpkg.com/@magicbell/react@1.14.0/dist/esm/context-provider.js>,
<https://unpkg.com/@magicbell/react@1.14.0/dist/esm/inbox.js>,
<https://unpkg.com/@magicbell/react@1.14.0/src/internal/stores/realtime-store.ts>

**Recipient/identity model.** Different from the others: MagicBell keys on **either an email or an
`external_id`**, and recommends the latter. "A unique user identifier is critical for effectively
using MagicBell and maps to the user identifier you use in your app"; "an `external_id` is linked to
your app's DB records (typically, the `user_id`), and once set for a user, it cannot be changed or
unset"; "External IDs always take precedence over email when you specify both in the `recipients`
key, when creating notifications." User writes are upserts: "if a user with the same identifier
already exists, the existing user will be updated with the new data. If a user doesn't exist, a new
user will be created." The docs warn to "choose and stick to one type of unique identifier for each
user".
Mapping for Cadence: set `external_id = users.id` and never use the email path. Note the
immutability — "once set for a user, it cannot be changed or unset" — so the choice is one-way per
user. Like Courier, the browser needs a server-minted User JWT.
Sources: <https://www.magicbell.com/docs/primitive/user>, <https://www.magicbell.com/docs/libraries/magicbell-react>

**Real-time.** Yes, WebSocket, on by default. The in-app channel docs: "When a new notification is
created, it appears instantly in the user's inbox without requiring a page refresh." The transport
is not named in the docs, but the package source names it: a `reconnecting-websocket` client against
`wss://ws.magicbell.com`. (A docs navigation entry for an "EventSource" *integration* exists, but
that page is a configuration stub about an inbound `source` field, not the feed's transport — do not
read it as SSE.)
Sources: <https://www.magicbell.com/docs/channels/in_app>,
<https://unpkg.com/@magicbell/react@1.14.0/src/internal/stores/realtime-store.ts>,
<https://www.magicbell.com/docs/integrations/eventsource>

**Email door.** Open, but with the thinnest provider list of the four reachable vendors: "Delivery
on the email channel is offered by the following providers: Amazon SES, SMTP, Mailgun, SendGrid,
Ping Email." Again orchestration, not delivery — a separate ESP account is still required.
Source: <https://www.magicbell.com/docs/channels/email>

### SuprSend

Docs reachable 2026-11-15. (Note: the paths `/docs/inbox` and `/docs/subscriber` return 404 — the
live paths are `/docs/inbox-overview` and `/docs/users`. The host itself was never down.)

**In-app feed.** Yes — the **Inbox**, "an in-app notification feed", with state owned by the vendor:
"no infrastructure required at your end to manage and store inbox notifications, and for state
management such as read, seen, and archive tracking".
Source: <https://docs.suprsend.com/docs/inbox-overview>

**React components.** Package `@suprsend/react` (v1.5.0 at time of reading; the older
`@suprsend/react-inbox` is deprecated), layered over `@suprsend/react-core` (v2.4.0) and
`@suprsend/web-sdk` (v5.4.0). Setup is two nested providers plus a component:

```jsx
<SuprSendProvider publicApiKey={YOUR_KEY} distinctId={YOUR_DISTINCT_ID}>
  <SuprSendFeedProvider>Your Feed Component</SuprSendFeedProvider>
</SuprSendProvider>
```

Drop-in `Inbox` (a popover feed) with props including `pageSize`, `tenantId`, `stores`, `host`,
`theme`, `themeType`, `notificationClickHandler`. Headless hooks are documented and exported:
`useFeedClient` (feed instance — mark seen/read/archive), `useFeedData` (notification list and meta
as React state), `useFeed` (reachability status), plus `useTranslations`.
Sources: <https://docs.suprsend.com/docs/react-inbox-integration>,
<https://docs.suprsend.com/docs/react-in-app-feed>,
<https://docs.suprsend.com/docs/react-sdk-headless-feed>,
<https://unpkg.com/@suprsend/react/package.json>,
<https://unpkg.com/@suprsend/react@1.5.0/dist/es/index.js>

**SSR.** Docs say nothing about SSR or `"use client"`. The published bundles say something more
interesting than Knock/MagicBell: `@suprsend/react@1.5.0`'s ESM entry does **not** carry a
`"use client"` directive, and neither does `@suprsend/react-core@2.4.0`. What `react-core` does
carry is the standard isomorphic layout-effect shim — it picks `useLayoutEffect` or `useEffect` with
`typeof window < "u" ? W : N` — and `@suprsend/web-sdk@5.4.0` likewise guards on
`typeof window < "u"`. Reading: the SDK is written to survive being imported and rendered in a
Node/SSR pass rather than to be excluded from it, but there is no published statement of SSR support
and no server-rendered feed markup. For Cadence the safe posture is still a client-only island; the
absence of `"use client"` means a bundler-level directive is ours to add if we need one.
Sources (published packages, read 2026-11-15):
<https://unpkg.com/@suprsend/react@1.5.0/dist/es/index.js>,
<https://unpkg.com/@suprsend/react-core/dist/es/index.js>,
<https://unpkg.com/@suprsend/web-sdk/dist/es/index.js>

**Recipient/identity model.** "Each user is identified by a unique `distinct_id`, and their profile
stores everything SuprSend needs to reach them." The `distinct_id` is immutable once created and is
meant to be a stable value from your system, such as a database primary key. Upsert via
`POST https://hub.suprsend.com/v1/user/{distinct_id}/` with Bearer auth; semantics are patch-like —
"Keys you send are updated; keys you omit stay as they were." Channel identities are stored as
arrays under reserved `$`-prefixed keys: `$email`, `$sms`, `$androidpush`, `$iospush`, `$webpush`,
`$whatsapp`, `$slack`, and "a user can have multiple addresses per channel; SuprSend attempts each
until one succeeds." Users can also be created inline from a trigger payload or from the client SDK.
Mapping for Cadence: `users.id` → `distinct_id`; email goes in as `$email` rather than a plain
`email` field. Browser side takes `publicApiKey` + `distinctId`, with an optional signed `userToken`
(JWT) for the enhanced-security mode — the docs note SuprSend moved from HMAC `subscriber_id` to
signed JWT user tokens.
Sources: <https://docs.suprsend.com/docs/users>,
<https://docs.suprsend.com/docs/react-inbox-integration>,
<https://docs.suprsend.com/docs/react-sdk-headless-feed>

**Real-time.** Yes, WebSocket via socket.io. The feed docs talk about "the feed socket" being live
and expose a `host` config taking `socketHost` and `apiHost`. The SDK confirms the technology:
`@suprsend/web-sdk` depends on `socket.io-client ^4.8.1`, imports `io` from it, handles
`reconnect_attempt`, and defaults `socketHost` to `https://betainbox.suprsend.com` (API host
defaults to `https://hub.suprsend.com`).
Sources: <https://docs.suprsend.com/docs/react-in-app-feed>,
<https://unpkg.com/@suprsend/web-sdk/package.json>,
<https://unpkg.com/@suprsend/web-sdk/dist/es/index.js>

**Email door.** Open, and the narrowest vendor list of the reachable set: Postmark, Resend and
SendGrid. SuprSend does not deliver mail itself — From Name / From Email left blank are "picked from
your vendor settings", and the domain must be verified with the chosen vendor.
Source: <https://docs.suprsend.com/docs/email>

**Could not verify.** Whether `socketHost` defaulting to a host named `betainbox.suprsend.com` says
anything about the feed's maturity — that is an inference from a hostname, not a documented fact,
and should not be treated as one.

### Engagespot

Not on the ticket's candidate list; found while looking for "anything else credible". Docs reachable
2026-11-15.

**In-app feed.** Yes, and it is the headline channel — the SDK is literally named "In-App Inbox".
The headless core models a `NotificationList` exposing `unreadCount` and `totalCount`, and
`NotificationItem` exposing `markAsRead()`, `markAsUnRead()`, `markAsUnSeen()` and `delete()`, so
read/seen state is vendor-persisted per recipient.
Source: <https://docs.engagespot.co/docs/sdks-n-libraries/frontend/using-javascript-core-api/>

**React components.** Package `@engagespot/react-component` (v3.0.1 at time of reading), over
`@engagespot/react-hooks` and `@engagespot/core`. The drop-in is a single `<Engagespot />` component
(bell + feed panel):

```jsx
import { Engagespot } from '@engagespot/react-component';
<Engagespot apiKey="ENGAGESPOT_API_KEY" userId="unique-id-of-your-user" dataRegion="us"
            userToken="Required if secure auth is enabled" />
```

A headless path exists at both levels (`@engagespot/react-hooks`, and a framework-agnostic core JS
API). Note `dataRegion` — "us" or "eu" — which is a data-residency lever the other vendors did not
surface on the component.
Sources: <https://docs.engagespot.co/docs/sdks-n-libraries/frontend/react/quick-start/>,
<https://docs.engagespot.co/docs/sdks-n-libraries/frontend/using-javascript-core-api/>,
<https://unpkg.com/@engagespot/react-component/package.json>

**SSR.** Stated in the docs, and stated most bluntly of all the vendors here: "We need to render
EngageSpot on the client." The Next.js guide gives two recipes — `'use client'` at the top of the
component file for the App Router, and `dynamic(() => import('./EngageSpotNotification'), { ssr: false })`
for the Pages Router. For React Router 8 that translates to a client-only island; there is no
server-rendered path.
Source: <https://docs.engagespot.co/docs/1.4.x/sdks-n-libraries/frontend/using-nextjs-component/>

**Recipient/identity model.** "Every user should have a unique `identifier`. It could be the
auto-increment id from your database, or any other unique value such as their Email or Phone
number", and it must never change. Upsert is
`PUT https://api.engagespot.co/v3/users/{identifier}`, authenticated with `X-ENGAGESPOT-API-KEY` and
`X-ENGAGESPOT-API-SECRET` headers. Profile fields include `firstName`, `email` and `phoneNumber`
(E.164). Inline identification at workflow-trigger time is supported, so no pre-sync pass is
required.
Mapping for Cadence: `users.id` → `identifier`; the browser gets `apiKey` + `userId`, plus a
server-minted `userToken` JWT once secure auth mode is on — and the docs say secure auth "must be
enabled for production applications".
Sources: <https://docs.engagespot.co/docs/features/user/who-is-user/>,
<https://docs.engagespot.co/docs/sdks-n-libraries/frontend/react/quick-start/>

**Real-time.** Yes, WebSocket. The docs describe event listeners (`onNotificationReceive`,
`onNotificationRead`, `onNotificationSee`, `onNotificationDelete`) but never name the transport;
`@engagespot/core@3.0.1` depends on `socket.io-client ^4.7.5` and its bundle pins
`transports:["websocket"]`, i.e. socket.io with the HTTP long-polling fallback disabled.
Sources: <https://docs.engagespot.co/docs/sdks-n-libraries/frontend/using-javascript-core-api/>,
<https://unpkg.com/@engagespot/core/package.json>,
<https://unpkg.com/@engagespot/core@3.0.1/dist/esm/index.js>

**Email door.** Open, same bring-your-own-provider shape. Per-provider setup pages exist for
SendGrid ("Engagespot uses SendGrid API to deliver your notifications", configured with an
`API_KEY`), Amazon SES (IAM user with `SendEmail`, access key/secret/region/verified from-address),
Resend, MailerSend and generic SMTP, with per-send configuration overrides.
Sources: <https://docs.engagespot.co/docs/features/channels/email/sendgrid-provider/>,
<https://docs.engagespot.co/docs/features/channels/email/ses/>,
<https://docs.engagespot.co/docs/features/channels/email/resend/>,
<https://docs.engagespot.co/docs/features/channels/email/smtp-provider/>
