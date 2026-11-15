# Knock in-app feed SDK

Research for [issue #7](https://github.com/djaamann-ae/cohort-005-project/issues/7) — how Knock's
in-app feed works against Cadence, a React Router 8 SSR app.

Research date: **2026-11-15**.

## Scope and sources

The six-vendor survey ([#2](https://github.com/djaamann-ae/cohort-005-project/issues/2),
`docs/research/in-app-notification-vendors.md` on `research/notification-vendors`) already
established, with sources, that `@knocklabs/react` ships `"use client"`, that no server-minted JWT
is needed, and how recipients map onto `users.id`. Those facts are **not re-derived here**. The
trigger endpoint and the `PUT /v1/users/{id}` identify call were verified against a live account in
[#6](https://github.com/djaamann-ae/cohort-005-project/issues/6) and are taken as given.

Two kinds of primary source are used, and nothing else:

1. **Knock's own documentation** at `docs.knock.app`.
2. **The published source** of `@knocklabs/react`, `@knocklabs/react-core` and `@knocklabs/client`,
   from the vendor's `knocklabs/javascript` monorepo. Read from the `main` branch on **2026-11-15**;
   `packages/react/package.json` reports `"version": "0.15.1"`.
   <https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/package.json>

No blog posts, no comparison sites, no recall. Where a page could not be reached it is recorded as
unreachable rather than filled in from somewhere else; see **Unreachable sources** at the end.

One question — what the pre-hydration gap looks like on screen — is **deferred** by the ticket and is
answered only as *what the source implies*, clearly flagged as unverified.

## 1. The `enabled` mount pattern, concretely

### What the provider actually does during render

`KnockProvider` memoises an options object and hands it, with the user, to `useAuthenticatedKnockClient`:

```tsx
const authenticateOptions = React.useMemo(() => ({ host, …, enabled }), [...]);
const knock = useAuthenticatedKnockClient(apiKey ?? "", userIdOrUserWithProperties, userToken, authenticateOptions);
```

`useAuthenticatedKnockClient` does the construction **inside a `React.useMemo`**, i.e. during render,
server pass included:

```ts
const activeUserIdOrObject = enabled ? stableUserIdOrObject : undefined;
const activeUserToken = enabled ? userToken : undefined;
…
const knock = new Knock(apiKey, { host, logLevel, branch });
authenticateWithOptions(knock, activeUserIdOrObject, activeUserToken, stableOptions);
```

So `enabled: false` does not skip the client — it **drops the credentials**, and the comment in source
says so explicitly: "When disabled, behave as if no user was provided: drop the credentials so a
fresh, signed-out client is created and stays idle. This makes `enabled: false -> true` behave like a
login (and the reverse like a logout) through the same code path headless hook consumers already use."
The `KnockProvider` prop doc says the same: "render children but keep the Knock client idle: no
identify call, no API requests, and no websocket. Set it to `true` and it connects like a login".
Sources:
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react-core/src/modules/core/context/KnockProvider.tsx>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react-core/src/modules/core/hooks/useAuthenticatedKnockClient.ts>

With no user id, `Knock.authenticate` sets `userId = undefined`, skips the inline identify (it is
guarded on `typeof userIdOrUserWithProperties === "object" && userIdOrUserWithProperties?.id`), and
`isAuthenticated()` returns `!!this.userId` — false. Every read and write path then short-circuits:

- `Feed.fetch()`: "If the user is not authenticated, then do nothing" — early `return`.
- `Feed.canMutate()`: returns false and logs, "without touching the store (no optimistic update) or
  the network. This matters for actions that fire automatically, like the popover's `markAllAsSeen`
  on open or a cell's `markAsInteracted` on click."

Sources: <https://raw.githubusercontent.com/knocklabs/javascript/main/packages/client/src/knock.ts>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/client/src/clients/feed/feed.ts>

### The rest of the tree is already SSR-tolerant

`KnockFeedProvider` → `useNotifications` calls `knock.feeds.initialize(...)` inside a `useState`
initializer, which also runs during the server render. That path is explicitly guarded for servers:

- `ApiClient` only builds a Phoenix socket behind `if (typeof window !== "undefined" && typeof WebSocket !== "undefined")`.
- `Feed.setupBroadcastChannel()`: "here we ensure `self` is available (it's not in server rendered envs)".
- `Feed.initializeRealtimeConnection()`: "In server environments we might not have a socket connection" — early `return` when there is no socket manager.
- `NotificationFeed` fetches from a `useEffect`, which never runs on the server.

Sources: <https://raw.githubusercontent.com/knocklabs/javascript/main/packages/client/src/api.ts>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/client/src/clients/feed/feed.ts>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react-core/src/modules/feed/hooks/useNotifications.ts>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeed.tsx>

Practical consequence: rendering the Knock tree during Cadence's SSR pass is **inert, not fatal**.
Nothing throws, nothing reaches the network, nothing touches `window`. The `"use client"` directive
is a bundler convention and does not by itself stop the component rendering on a server in a
non-RSC React Router build — so the gate has to be something Cadence does deliberately, which is
what `enabled` is for. *(This last sentence is reasoning about React Router, not a Knock-sourced
claim.)*

### How it flips on after hydration

`enabled: false -> true` changes `knock.userId`, and `KnockFeedProvider` keys its context on
`feedProviderKey(knock.userId, feedId, defaultFeedOptions)` — so the flip remounts the feed subtree
and refetches, rather than leaving a stale signed-out store behind. Source comment:
"(A userId change still remounts the feed subtree downstream because `feedProviderKey` includes the
userId.)"
Sources:
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react-core/src/modules/feed/context/KnockFeedProvider.tsx>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react-core/src/modules/core/utils.ts>

### The shape for Cadence

Knock's own documented setup puts both providers and both components in one layout component:

```jsx
import { KnockProvider, KnockFeedProvider, NotificationIconButton, NotificationFeedPopover } from "@knocklabs/react";
import "@knocklabs/react/dist/index.css";

<KnockProvider apiKey={process.env.KNOCK_PUBLIC_API_KEY} user={{ id: user.id }}>
  <KnockFeedProvider feedId={process.env.KNOCK_FEED_CHANNEL_ID}>
    <NotificationIconButton ref={notifButtonRef} onClick={(e) => setIsVisible(!isVisible)} />
    <NotificationFeedPopover buttonRef={notifButtonRef} isVisible={isVisible} onClose={() => setIsVisible(false)} />
  </KnockFeedProvider>
</KnockProvider>
```

Source: <https://docs.knock.app/in-app-ui/react/feed>

Mapped onto Cadence, with the differences that matter:

- **The providers belong in a leaf island, not in `app/routes/layout.app.tsx`.** Nothing outside the
  bell consumes Knock context — `useKnockFeed` throws unless it is inside `KnockFeedProvider`, and
  only `NotificationIconButton`, `NotificationFeedPopover` and `NotificationCell` call it. So a new
  `app/components/notification-bell.tsx` holding both providers, rendered from
  `app/components/sidebar.tsx`, keeps the blast radius to one component. `layout.app.tsx` stays a
  loader + `<Sidebar>` + `<Outlet>` and gains only the props it has to pass down.
- **The hydration flag is the `enabled` source.** `Sidebar` already runs exactly this pattern for
  dark mode (`useState(false)` + a mount `useEffect`), so the idiom is in the file already:

  ```tsx
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  <KnockProvider apiKey={knockPublicKey} user={{ id: String(userId) }} enabled={hydrated}>
  ```

  Server render: `enabled={false}`, client idle. First client effect: `true`, the client
  authenticates, the feed subtree remounts on the new `feedProviderKey`, `NotificationFeed`'s
  effect fetches, and the socket connects.
- **`user.id` must be stringified.** `UserWithProperties` is `{ id: UserId } & GenericData` where
  `UserId = Knock["userId"]`, a `string | undefined | null`. Cadence's `users.id` is an integer, and
  #6 confirmed Knock returns it as a string, so `String(currentUser.id)` at the boundary.
  Source: <https://raw.githubusercontent.com/knocklabs/javascript/main/packages/client/src/interfaces.ts>
- **The key and feed id have to travel through the loader.** React Router 8 has no build-time
  `process.env` inlining for the browser bundle, so the public key and the in-app feed channel id go
  into `layout.app`'s loader return and down as props. Both are public by design; `Knock`'s
  constructor actively refuses the secret key: `if (this.apiKey && this.apiKey.startsWith("sk_"))
  throw new Error("[Knock] You are using your secret API key on the client. Please use the public
  key.")`.
  Source: <https://raw.githubusercontent.com/knocklabs/javascript/main/packages/client/src/knock.ts>
- **`enabled` is preferred over conditional mounting**, per the prop's own doc comment ("Use this to
  wait for a complete identity … instead of conditionally mounting `KnockProvider`"). Both work for
  Cadence; `enabled` is the vendor-blessed one and keeps a single mount path.
- **`currentUser` can be `null`** in Cadence (the DevUI "no user selected" state). Fold that into the
  same flag: `enabled={hydrated && Boolean(userId)}`, which is literally the shape in the prop's
  example.

## 2. `NotificationFeedPopover` against a sidebar — and the "ordinary DOM" claim

### Verdict on ADR 0013's load-bearing claim: it holds

ADR 0013 (`docs/adr/0013-knock-handles-in-app-notifications.md`) rejects Novu partly because "its
Inbox mounts in a shadow root … Knock's components are ordinary DOM." Checked against the published
source:

- A full-text search of `packages/react/src`, `packages/react-core/src` and `packages/client/src`
  for `attachShadow`, `shadowRoot`, `ShadowRoot` and `<iframe` returns **no matches**.
- There is no `createPortal` call anywhere in `packages/react/src` or `packages/react-core/src` —
  the popover renders inline, in place in the tree.
- Every feed component returns plain elements with plain `className` strings. Verbatim, the whole
  of `NotificationFeedContainer`:

  ```tsx
  export const NotificationFeedContainer: FunctionComponent<{ children?: ReactNode | undefined }> =
    ({ children }) => <div className="rnf-feed-provider">{children}</div>;
  ```

  and the popover's own return:

  ```tsx
  <div className={`rnf-notification-feed-popover rnf-notification-feed-popover--${colorMode}`} … >
    <div className="rnf-notification-feed-popover__inner">
      <NotificationFeed {...feedProps} />
    </div>
  </div>
  ```

- Styles arrive as an ordinary stylesheet the app imports itself — `@knocklabs/react/dist/index.css`,
  declared in `package.json` as `"style": "dist/index.css"` with an explicit
  `"./dist/index.css"` export. Nothing is injected into an encapsulated root.

**So the claim stands, and the ADR does not need amending.** This is the opposite of the Novu
finding in the survey, and it is the difference the ADR says it is.

Sources:
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/modules/feed/components/NotificationFeedContainer/NotificationFeedContainer.tsx>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/modules/feed/components/NotificationFeedPopover/NotificationFeedPopover.tsx>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/package.json>

### How much of the markup Cadence's Tailwind can actually reach

"Ordinary DOM" is necessary but not sufficient. What Cadence gets, in descending order of ease:

1. **CSS custom properties.** Each component's stylesheet declares its own knobs on `:root` and then
   consumes them. The popover's full set:

   ```css
   :root {
     --rnf-notification-feed-popover-max-w: 400px;
     --rnf-notification-feed-popover-min-w: 280px;
     --rnf-notification-feed-popover-height: 400px;
     --rnf-notification-feed-popover-shadow: drop-shadow(0px 5px 15px rgba(0, 0, 0, 0.2));
     --rnf-notification-feed-popover-shadow-color: rgba(0, 0, 0, 0.2);
     --rnf-notification-feed-popover-bg-color: #fff;
     --rnf-notification-feed-popover-z-index: 999;
     --rnf-notification-feed-popover-arrow-size: 10px;
     --rnf-notification-feed-popover-border-radius: 4px;
   }
   ```

   Because they are plain custom properties on `:root`, Cadence can redefine them in `app/app.css`
   from its own shadcn tokens — e.g. `--rnf-notification-feed-popover-bg-color: var(--popover)` —
   and they cascade. The docs confirm this is the intended seam: "CSS variables (prefixed with
   `--rnf-`) for theme adjustments. All component classes start with `rnf-`."
   Sources: <https://docs.knock.app/in-app-ui/react/feed>,
   <https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/modules/feed/components/NotificationFeedPopover/styles.css>

2. **Class selectors, reachable but not via utility classes.** The components take no `className`
   prop, so Cadence cannot hang Tailwind utilities on them. It can write ordinary rules against the
   stable `rnf-` names in `app/app.css`. The names rendered by the feed path are:
   `rnf-feed-provider`, `rnf-notification-icon-button--{light,dark}`, `rnf-unseen-badge`,
   `rnf-unseen-badge__count`, `rnf-notification-feed-popover--{mode}`,
   `rnf-notification-feed-popover__inner`, `rnf-notification-feed--{mode}`,
   `rnf-notification-feed__header`, `rnf-notification-feed__selector`,
   `rnf-notification-feed__container`, `rnf-notification-feed__feed-items-container`,
   `rnf-notification-feed__spinner-container`, `rnf-notification-feed__knock-branding`,
   `rnf-notification-cell--{mode}`, `rnf-notification-cell__inner`,
   `rnf-notification-cell__unread-dot`, `rnf-notification-cell__content-outer`,
   `rnf-notification-cell__content`, `rnf-notification-cell__button-group`,
   `rnf-notification-cell__child-content`, `rnf-notification-cell__timestamp`,
   `rnf-archive-notification-btn`, `rnf-tooltip`, `rnf-avatar`, `rnf-avatar__image`,
   `rnf-avatar__initials`, `rnf-empty-feed__{inner,header,body}`.
   Sources: the component files under
   <https://github.com/knocklabs/javascript/tree/main/packages/react/src/modules/feed/components>

3. **Not reachable by class at all: the notification body.** `NotificationCell` renders the Knock
   template's rendered markdown with `dangerouslySetInnerHTML`:

   ```tsx
   <div className="rnf-notification-cell__content"
        dangerouslySetInnerHTML={{ __html: (blocksByName.body as MarkdownContentBlock).rendered }} />
   ```

   That HTML comes from the dashboard template and carries no classes, so Tailwind utilities cannot
   be applied to it. Cadence would style it with descendant rules
   (`.rnf-notification-cell__content a { … }`) — and note Tailwind v4's preflight will already have
   reset those bare `<p>`/`<a>`/`<strong>` elements, so some restyling is not optional. (Cadence
   has `@tailwindcss/typography` available, but `prose` cannot be applied without a `className`
   hook — it would have to be `@apply`-ed onto the `rnf-` selector.)
   Source: <https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/modules/feed/components/NotificationCell/NotificationCell.tsx>

4. **The real escape hatch is `renderItem`, not CSS.** `NotificationFeedProps` exposes
   `renderItem?: (props: { item, onItemClick, onButtonClick, formatTimestamp }) => ReactNode`,
   defaulting to `<NotificationCell … />`, plus `renderHeader`, `renderLoading`, `EmptyComponent`
   and `formatTimestamp`. Replacing `renderItem` with a Cadence component gets full Tailwind inside
   the list while keeping Knock's provider, store, socket and read-state plumbing. Given Cadence has
   two notification shapes, this is cheap. Note the cost: the default `NotificationCell` is what
   calls `markAsInteracted` on click (see §6), so a custom `renderItem` must call it too.
   Source: <https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeed.tsx>

5. **Dark mode must be wired by hand.** Knock's components branch on a `colorMode` prop passed to
   `KnockFeedProvider` (`colorMode = "light"` default), emitting `--light`/`--dark` class suffixes.
   Cadence's dark mode is a `.dark` class on `<html>` with Tailwind v4's
   `@custom-variant dark (&:is(.dark *))` and a `localStorage` flag toggled in `Sidebar`. These are
   two independent switches; the bell island has to feed Cadence's `isDark` into `colorMode`, or the
   feed will be light-on-dark.
   Sources: <https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react-core/src/modules/feed/context/KnockFeedProvider.tsx>,
   `app/app.css`, `app/components/sidebar.tsx`

### Anchoring it to a sidebar item

Yes — the popover is not hard-wired to a header bell. It positions itself with Popper against
whatever element `buttonRef` points at, and takes a `placement`:

```tsx
export interface NotificationFeedPopoverProps extends NotificationFeedProps {
  isVisible: boolean;
  onOpen?: (arg: OnOpenOptions) => void;
  onClose: (e: Event) => void;
  buttonRef: RefObject<HTMLElement | null>;
  closeOnClickOutside?: boolean;
  placement?: Placement;
}
```

```tsx
const popperInstance = createPopper(buttonRef.current, popperRef.current, {
  strategy: "fixed",
  placement,
  modifiers: [{ name: "offset", options: { offset: [0, 8] } }],
});
```

Four things follow, all of which favour a sidebar:

- `buttonRef` is typed `RefObject<HTMLElement | null>`, not a button — any element in
  `app/components/sidebar.tsx` can be the anchor.
- `placement` is Popper's `Placement` union, so `"right-start"` / `"right-end"` are available and
  are the natural choices for a left rail. The default is `"bottom-end"`, which is the header-bell
  assumption and should be overridden. Allowed values are `auto | auto-start | auto-end | top |
  bottom | right | left | {top,bottom,right,left}-{start,end}`.
  Source: <https://unpkg.com/@popperjs/core@2.11.8/lib/enums.d.ts> (`@popperjs/core` ^2.11.8 is the
  declared dependency in `packages/react/package.json`)
- `strategy: "fixed"` means the popover is positioned against the viewport, so it escapes the
  `<aside>`'s 14rem width and any ancestor clipping — exactly the problem a 400px-wide panel would
  otherwise have in a `w-56` rail. `layout.app.tsx`'s outer `div` is `overflow-hidden`, which would
  clip an absolutely-positioned popover; `fixed` sidesteps it.
- It stays mounted when closed (`visibility: hidden; opacity: 0`), so its DOM is always present. It
  is **not** portalled, so it lives inside the `<aside>` subtree. Before Popper's first write it is
  a static `div` with `width: 100%` and `height: 400px`, which could perturb the sidebar's flex
  layout for a frame; giving it a wrapper with `position: relative` / zero size, or mounting the
  island outside the nav flow, avoids that. Its `z-index` is `999` via
  `--rnf-notification-feed-popover-z-index`; Cadence's `Toaster` (sonner) and `DevUI` are the other
  floating layers to check against.

One cosmetic gap worth knowing: `styles.css` defines `.rnf-notification-feed-popover__arrow`, but
`NotificationFeedPopover.tsx` never renders an arrow element. There is no caret pointing back at the
anchor, from any placement.
Source: <https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/modules/feed/components/NotificationFeedPopover/NotificationFeedPopover.tsx>

## 3. Unread counts — is there a cheap badge-only path?

**Short answer: no dedicated counts endpoint, but the cost is one request either way, and after that
the counts ride the websocket.**

### Where the number comes from

`UnseenBadge` reads it from the feed store, not from a call of its own:

```tsx
function selectBadgeCount(badgeCountType: BadgeCountType, metadata: FeedMetadata): number {
  switch (badgeCountType) {
    case "all":    return metadata.total_count;
    case "unread": return metadata.unread_count;
    case "unseen": return metadata.unseen_count;
  }
}
…
const badgeCountValue = useFeedStore((state) => selectBadgeCount(badgeCountType, state.metadata));
return badgeCountValue !== 0 ? ( … ) : null;
```

`NotificationIconButton` just forwards its `badgeCountType` prop (default `"unseen"`) to
`UnseenBadge`. Counts above nine render as `"9+"` (`formatBadgeCount`: `count > 9 ? "9+" : count`).
Sources:
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/modules/feed/components/UnseenBadge/UnseenBadge.tsx>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/modules/feed/components/NotificationIconButton/NotificationIconButton.tsx>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react-core/src/modules/core/utils.ts>

That `metadata` is populated by the ordinary feed fetch. The API returns counts in the same payload
as the items:

```
GET /v1/users/{user_id}/feeds/{id}
…
"meta": { "total_count": 100, "unread_count": 10, "unseen_count": 5 }
```

Knock's API reference documents **no counts-only endpoint** for a feed — `meta` and `entries` come
together. Nor does `@knocklabs/client` expose one: `UserClient` has `get`, `identify`,
preferences, channel data and guides; `MessageClient` has `get`, `updateStatus`, `removeStatus`,
`batchUpdateStatuses`, `bulkUpdateAllStatusesInChannel`. Nothing count-shaped.
Sources: <https://docs.knock.app/api-reference/users/feeds/list_items>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/client/src/clients/users/index.ts>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/client/src/clients/messages/index.ts>

### The cheap-ish options that do exist

- **Shrink the page.** `FeedClientOptions.page_size` (default 50) and `mode` (`"compact"` by
  default, which drops `activities`, `total_activities`, nested `data` and extra actors) are both
  settable through `KnockFeedProvider`'s `defaultFeedOptions`. `{ page_size: 1 }` gets the counts
  for the cost of one item. The catch: `defaultFeedOptions` is per feed client, and the same client
  backs the popover list — so a tiny page size would also truncate the list, and a true badge-only
  client means a second `useNotifications(knock, feedId, { page_size: 1 })` instance (its own store,
  its own socket channel).
  Sources:
  <https://raw.githubusercontent.com/knocklabs/javascript/main/packages/client/src/clients/feed/interfaces.ts>,
  <https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react-core/src/modules/feed/context/KnockFeedProvider.tsx>
- **Don't mount the list until the popover opens.** The fetch lives in `NotificationFeed`'s
  `useEffect`, so a bell that renders `NotificationFeedPopover` only while open pays nothing until
  the Student clicks. But then nothing populates `metadata` and the badge stays at zero — this
  trades the badge away, so it is not useful here.
- **Let the socket do it.** After the first fetch, new messages arrive over the websocket carrying
  their own metadata, and the store is updated before any refetch:

  ```ts
  // Optimistically set the badge counts
  const metadata = data[this.referenceId]?.metadata;
  if (metadata) { state.setMetadata(metadata); }
  ```

  Mutations are optimistic too: `markAsSeen`/`markAsRead`/`markAsInteracted`/`markAsArchived` all
  call `optimisticallyPerformStatusUpdate(..., "unseen_count" | "unread_count")` before the request
  goes out. So the steady-state cost of the badge is zero extra HTTP requests.
  Source: <https://raw.githubusercontent.com/knocklabs/javascript/main/packages/client/src/clients/feed/feed.ts>

### Read for Cadence

One feed fetch per page load per Student, returning up to 50 items to render a number that is almost
always 0, 1 or 2. At Cadence's volume this is not worth engineering around — take the default feed
client and the default `page_size`, and don't build a second badge-only client. The one deliberate
choice to make is `badgeCountType`: `"unseen"` (the default) counts notifications the Student has
not had *shown* to them and is cleared by opening the popover; `"unread"` is the one that matches
"Model Notification in Cadence's language" ([#4](https://github.com/djaamann-ae/cohort-005-project/issues/4)),
which settled that Cadence surfaces read/unread only. If the glossary says unread, pass
`badgeCountType="unread"` — see §6, which is where the two diverge.

## 4. Idempotency — does a double trigger produce two Notifications?

**Yes, by default.** Nothing in the trigger payload deduplicates. Two identical
`POST /v1/workflows/{key}/trigger` calls for the same recipient with the same `data` are two
workflow runs — the endpoint returns a distinct `workflow_run_id` per call, and the docs note "All
workflow runs are executed asynchronously." Cadence has to opt in to deduplication.
Source: <https://docs.knock.app/api-reference/workflows/trigger>

### The mechanism Knock actually provides: the `Idempotency-Key` header

- "To perform an idempotent request, set an `Idempotency-Key` header on your request."
- "If you retry a request with the same idempotency key within 24 hours from the original request,
  Knock will return the same response as the original request."
- "Idempotency is currently supported on a limited set of endpoints. Today, only
  `POST /workflows/:key/trigger` accepts the `Idempotency-Key` header" — sending it elsewhere has no
  effect.
- The key is "a unique string of up to 255 characters" and may be "random UUIDs, or they can have
  some meaning in your application."
- "Knock only caches successful responses (`2xx`). Requests that return a `4xx` or `5xx` response
  are not stored" — so a failed trigger is safe to retry.
- "Idempotent requests are expected to be identical. To prevent accidental misuse, Knock returns an
  error when incoming parameters don't match those from the original request."
- A replay is visible in the response headers: `original-x-request-id` and `idempotent-replayed: true`.

Source: <https://docs.knock.app/api-reference/overview/idempotent-requests>

This is the right tool for Cadence, and it is free: the key should be derived from the domain event,
not generated per request. Both of Cadence's notifications have a natural one — the id of the staff
reply, and the id of the Refund Request decision. `question-reply:{answerId}` and
`refund-decided:{refundRequestId}` are stable across a user double-submit, an action replay, a retry
after a timeout, and a `fetch` the server completed but the client never saw. A random UUID minted
inside the trigger call would defeat the whole point.

Caveat to record: the window is **24 hours**. It covers retries and accidental double-fires; it does
not make the trigger permanently once-only. If a Refund Request could be decided, undecided and
re-decided days later, that is a second notification by design — and arguably the correct one.

### What `cancellation_key` is not

`cancellation_key` appears in the trigger body and is easy to mistake for a dedupe key. It is not
one. It is "a unique identifier for the workflow run" that you later pass to the cancel API to stop
a run mid-flight; the docs note that a `204` from cancel "only means Knock has successfully enqueued
the cancellation request, not that the cancellation has been performed." The cancellation docs say
nothing about a repeated `cancellation_key` deduplicating, and it does not.
Sources: <https://docs.knock.app/send-notifications/canceling-workflows>,
<https://docs.knock.app/api-reference/workflows/trigger>

For Cadence, `cancellation_key` only becomes interesting if a workflow ever gains a delay step —
e.g. "notify after 10 minutes unless the Student has already read the reply." There is no such step
today.

### The adjacent tool: the batch function

Separate from idempotency, Knock workflows can include a batch step: "A batch function collects
notifications that have to do with the same subject, so you can send fewer notifications to your
users", collapsing N triggers in a window into one message, optionally grouped by a batch key. The
window "open[s] from the **first** time the batch is triggered".
Source: <https://docs.knock.app/designing-workflows/batch-function>

Noted for completeness, not recommended: at two notifications with no fan-in, batching would mainly
add a delay before a Student sees that staff replied. `Idempotency-Key` is the correct answer to the
question this ticket asked.

## 5. Template data — getting substance out of Cadence and into the cell

ADR 0013's mitigation for copy-living-outside-git is: "pass the substance — course title, the
Platform Admin's decision note — as template data from Cadence, so only the surrounding wording
lives at Knock." This works, with two sharp edges worth knowing up front.

### The path in: `data` → Liquid

The trigger body's `data` object is addressable in the dashboard template under the `data`
namespace. The docs are explicit: variables are inserted by enclosing them "with double curly
braces: `{{ a_variable }}`", and "If you send through `{ "a_variable": "something" }` in your data
payload you can reference this as `{{ data.a_variable }}`". Two further namespaces are available
without Cadence sending anything: `recipient` (the identified user's properties — `{{ recipient.name }}`)
and `actor` (the user passed as `actor` on the trigger). Liquid control flow and filters are
available, e.g. `{{ actor.name | split: " " | first }}`.
Sources: <https://docs.knock.app/designing-workflows/template-editor/overview>,
<https://docs.knock.app/api-reference/workflows/trigger>

So a Cadence trigger would look like:

```jsonc
// POST /v1/workflows/question-answered/trigger
{
  "recipients": ["5"],
  "actor": "12",
  "data": {
    "course_title": "Rhythm Fundamentals",
    "lesson_title": "Subdivision",
    "link_path": "/courses/rhythm-fundamentals/lessons/subdivision"
  }
}
```

and the in-app template body becomes `{{ actor.name }} replied to your question on
**{{ data.lesson_title }}**`. Only the connective words live at Knock; every proper noun comes from
Cadence. That is the mitigation working as the ADR intends.

### The path out: content blocks on the feed item

An in-app template compiles to named blocks on each feed item. `@knocklabs/client` types them:

```ts
export interface ContentBlockBase { name: string; type: "markdown" | "text" | "button_set"; }
export interface ActionButton { name: string; label: string; action: string; }
```

and `NotificationCell` looks them up by name — `blocksByName.body` (markdown, injected via
`dangerouslySetInnerHTML` from `.rendered`), `blocksByName.action_url` (text), `blocksByName.actions`
(button set). The dashboard side matches: in-app templates come in "three variants … Standard,
Single-action, and Multi-action", and "the action URL is the URL that will be opened when a user
clicks on the notification cell."
Sources:
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/client/src/clients/feed/interfaces.ts>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/modules/feed/components/NotificationCell/NotificationCell.tsx>,
<https://docs.knock.app/integrations/in-app/knock>

### Edge 1: a resolved link path will do a full page load unless you intercept it

The resolved path is the ADR's own example of substance to pass, and it is also the one that bites.
`NotificationCell` navigates like this:

```tsx
function maybeNavigateToUrlWithDelay(url?: string) {
  if (url && url !== "") { setTimeout(() => window.location.assign(url), 200); }
}
```

`window.location.assign` is a document navigation — it tears down Cadence's React Router app and
reloads it. The escape is already in the click handler:

```tsx
feedClient.markAsInteracted(item, { type: "cell_click", action: actionUrl });
if (onItemClick) return onItemClick(item);
return maybeNavigateToUrlWithDelay(actionUrl);
```

Passing `onNotificationClick` to `NotificationFeed` (it is forwarded to the cell as `onItemClick`)
replaces the hard navigation while leaving `markAsInteracted` intact — so a `useNavigate()` call
there gives client-side routing and read tracking together. `onNotificationButtonClick` does the
same for the Multi-action variant's buttons. This means `data.link_path` can be a bare app-relative
path like `/courses/…` rather than an absolute URL, which is also better for the mitigation: no
hostname baked into a dashboard template.
Source: <https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/modules/feed/components/NotificationCell/NotificationCell.tsx>

### Edge 2: `data` must be flat if Cadence ever reads it client-side

Two separate flatness constraints, from different places:

- The feed's default `mode` is `"compact"`, and in compact mode "The `data` field will _not_ include
  nested arrays and objects" and "The `actors` field will only have up to one actor". So
  `item.data.something.nested` is simply absent unless `mode: "rich"` is set on the feed client.
- `FeedClientOptions.trigger_data`, used to *filter* a feed, is typed
  `[key: string]: string | number | boolean | null` with the comment: "`trigger_data` may only
  specify flat key-value pairs, not nested objects. Specifying a nested object will result in a 422
  `invalid_params` error."

Source: <https://raw.githubusercontent.com/knocklabs/javascript/main/packages/client/src/clients/feed/interfaces.ts>

Neither blocks the Liquid rendering path — the template is rendered server-side at Knock and can
read nested `data` — but both say: keep Cadence's trigger `data` a flat bag of strings. For a course
title, a lesson title, an actor name and a link path, that is no constraint at all.

### Edge 3: the actor avatar comes from the Knock user record, not from the trigger

`NotificationCell` renders `item.actors[0]` through `<Avatar name={actor.name} src={actor.avatar} />`
— so the replying staff member's name and avatar are read from their **identified Knock user**, not
from `data`. Getting an avatar into the cell means Cadence identifies instructors and admins into
Knock too (`PUT /v1/users/{id}` with `name` and `avatar`), not just the Students who receive
notifications. If that is unwanted, pass the name through `data` and render it in the body instead,
and the cell simply shows no avatar.
Source: <https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/modules/feed/components/NotificationCell/NotificationCell.tsx>

### Assessment of the ADR's mitigation

It holds, and it is better than the ADR claims — with the actor name on the Knock user record and
course/lesson titles plus a link path in `data`, the only thing living in the dashboard is a
sentence frame per workflow (two of them). Two residual risks the ADR does not mention:

1. **A typo'd variable fails silently.** Liquid renders an unknown `{{ data.corse_title }}` as empty
   string. Nothing in `npm run test` or `npm run typecheck` can see it; the first signal is a
   Student reading "replied to your question on **.**". The trigger payload is the only part of
   this that is testable in Cadence's own suite.
2. **The template and the trigger are versioned separately.** Renaming a `data` key in Cadence is a
   breaking change to a document that lives at Knock, is not in this repo's git history, and does
   not go through review. Keeping the key set small and boring is the mitigation for the mitigation.

## 6. Read/unread mechanics — what marks a Notification read, and is it configurable?

Knock tracks `seen_at`, `read_at`, `clicked_at`, `interacted_at`, `link_clicked_at` and
`archived_at` per feed item. "Model Notification in Cadence's language"
([#4](https://github.com/djaamann-ae/cohort-005-project/issues/4)) settled that Cadence surfaces
read/unread only, so the job here is to find which gestures move `read_at` and which only move
`seen_at`.
Source: <https://raw.githubusercontent.com/knocklabs/javascript/main/packages/client/src/clients/feed/interfaces.ts>

### Opening the popover marks **seen**, not read

```tsx
const defaultOnOpen = ({ store, feedClient }: OnOpenOptions) => {
  if (store.metadata.unseen_count > 0) { feedClient.markAllAsSeen(); }
};
```

and `onOpen` defaults to it. The docs say the same and name the override: "By default, items are
marked as 'seen' when the popover opens. To switch to 'read' status, implement an `onOpen` callback
that filters unread items and calls `feedClient.markAsRead()`." So **yes, configurable** — `onOpen`
is an ordinary prop receiving `{ store, feedClient }`, and passing
`onOpen={({ store, feedClient }) => feedClient.markAsRead(store.items.filter(i => !i.read_at))}`
makes "open the panel" mean read.
Sources:
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/modules/feed/components/NotificationFeedPopover/NotificationFeedPopover.tsx>,
<https://docs.knock.app/in-app-ui/react/feed>

### Clicking an item marks **read**

The cell's container click handler fires first, unconditionally:

```tsx
feedClient.markAsInteracted(item, { type: "cell_click", action: actionUrl });
```

and `markAsInteracted` sets both timestamps optimistically and decrements the unread badge:

```ts
this.optimisticallyPerformStatusUpdate(itemOrItems, "interacted",
  { read_at: now, interacted_at: now }, "unread_count");
return this.makeStatusUpdate(itemOrItems, "interacted", metadata);
```

The same handler runs on `Enter` (the cell is `tabIndex={0}` with a keydown handler), and button
clicks in the Multi-action variant call `markAsInteracted` with `type: "button_click"`. The unread
dot is driven directly off the field: `{!item.read_at && <div className="rnf-notification-cell__unread-dot" />}`.
Sources:
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/modules/feed/components/NotificationCell/NotificationCell.tsx>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/client/src/clients/feed/feed.ts>

Important: this is **not** switched off by `onNotificationClick`. The custom handler runs *after*
`markAsInteracted`, so Cadence can take over navigation (see §5) without losing read tracking — and
conversely, cannot opt out of "click marks read" except by replacing the cell entirely via
`renderItem`.

### A third gesture: "Mark all as read" in the feed header

`NotificationFeedHeader` always renders a `MarkAsRead` button, which calls
`feedClient.markAllAsRead()` and is `disabled` when `metadata.unread_count === 0`. Any
`onMarkAllAsReadClick` passed to `NotificationFeed` runs in addition, not instead. The header also
renders a status `Dropdown` over `FilterStatus.All | Unread | Read`.
Sources:
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/modules/feed/components/NotificationFeed/MarkAsRead.tsx>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeedHeader.tsx>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react-core/src/modules/core/constants.ts>

To remove it, pass `renderHeader`. Note `markAllAsRead` carries a documented race in source: "if a
new message comes in during this window before the update has been processed we'll effectively reset
the `unread_count` to be what it was."

### Also present, also unmodelled: archive

Every cell renders an `ArchiveButton` by default (`rnf-archive-notification-btn`), calling
`markAsArchived`, and the default feed options are `{ archived: "exclude", mode: "compact" }` — so
an archived Notification disappears from the feed. Cadence's model has no archive. Either accept it
as a Knock-side nicety that silently removes items, or pass `archiveButton={null}`-equivalent via a
custom cell. Worth a deliberate decision in
[#8](https://github.com/djaamann-ae/cohort-005-project/issues/8) rather than a default.
Source: <https://raw.githubusercontent.com/knocklabs/javascript/main/packages/client/src/clients/feed/feed.ts>

### The decision Cadence has to make

The default configuration has two state axes (`seen`, `read`) and a default badge
(`badgeCountType="unseen"`) driven by the axis Cadence does **not** model. Out of the box this reads
oddly: a Student opens the panel, the badge clears, but every item still shows an unread dot and
`unread_count` is unchanged. To present a single read/unread axis, pick one of:

- **Badge on unread, read on click** (smallest change): `badgeCountType="unread"`, leave `onOpen`
  alone. `seen` keeps being tracked at Knock and is simply never surfaced. The badge then clears
  item by item as the Student clicks — which is the usual meaning of an unread count.
- **Badge on unread, read on open**: `badgeCountType="unread"` plus the `onOpen` override above.
  Opening the panel clears everything at once, and "unread" effectively means "not yet looked at".

Either is a one-prop change; both are supported by documented props. This is a design input for
[#8](https://github.com/djaamann-ae/cohort-005-project/issues/8), not something the SDK forces.

## 7. DEFERRED — what the pre-hydration gap looks like in practice

**This question is deferred by the ticket and is NOT verified. Nothing below has been observed in a
browser.** It is an inference from the published source, recorded so
[#8](https://github.com/djaamann-ae/cohort-005-project/issues/8) has something to work from, and it
must be confirmed by whoever first runs the component (see
[#6](https://github.com/djaamann-ae/cohort-005-project/issues/6)).

### What the source implies

The feed store starts at zero, not at "unknown":

```ts
export const initialStoreState: FeedStoreState = {
  items: [],
  metadata: { total_count: 0, unread_count: 0, unseen_count: 0 },
  pageInfo: { before: null, after: null, page_size: 50 },
  loading: false,
  networkStatus: NetworkStatus.ready,
  …
};
```

and `UnseenBadge` renders **nothing at all** at zero — not a `0`, not a placeholder:

```tsx
return badgeCountValue !== 0 ? ( <div className="rnf-unseen-badge" …> ) : null;
```

`NotificationIconButton` does not depend on store state, so the `<button>` + `BellIcon` render
regardless. Neither component has a loading or skeleton branch; the only spinner in the feed path is
`renderLoading` inside `NotificationFeed`, i.e. inside the popover, which a Student has not opened
yet. And `networkStatus` starts at `ready`, not `loading`, so even a component that wanted to show a
loading state could not distinguish "nothing yet" from "nothing".

Sources:
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/client/src/clients/feed/store.ts>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/modules/feed/components/UnseenBadge/UnseenBadge.tsx>,
<https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react/src/modules/feed/components/NotificationIconButton/NotificationIconButton.tsx>

### The inferred answer, by mount strategy

- **With `enabled={hydrated}` and the island rendered on the server** (§1's recommendation): the SSR
  payload contains **a bare bell with no badge**. Not a zero, not a skeleton. After hydration the
  effect fires, the fetch returns, and the badge **pops in** with no transition. The bell's own box
  never changes size, so the shift should be confined to the badge itself — `UnseenBadge` is
  absolutely positioned over the button in `styles.css`, which would make it a pure appear rather
  than a reflow. *(Unverified.)*
- **With conditional mounting** (`{hydrated && <KnockProvider …>}`): the SSR payload contains
  **nothing**, and the whole bell appears on hydration. In a vertical sidebar that is a layout shift
  of the items below it, which is worse than a badge appearing. This is an argument for `enabled`
  over conditional mounting beyond the vendor's own preference.

### The window

The gap is one React commit plus one HTTP round trip to `api.knock.app` — the fetch only starts in
`NotificationFeed`'s effect after hydration, and nothing is prefetched during SSR. On a slow
connection a Student could plausibly see an un-badged bell for several hundred milliseconds on every
page load. ADR 0013 already accepts this ("The notification bell is absent from the SSR payload on
every page load"), and the survey recorded it as true of every vendor looked at.

### What to check when an account is available

1. Does the bare bell render in the SSR HTML (view source, JS disabled), or does React blank it?
2. Does the badge appearing shift anything in `app/components/sidebar.tsx`?
3. How long is the gap on a throttled connection — is a deliberate placeholder worth designing?
4. Does React log a hydration mismatch when `enabled` flips (the server rendered a signed-out tree,
   the client an authenticated one)? §1's reading of `feedProviderKey` says the remount should be
   clean, but that is an inference too.

## Unreachable sources

- `https://docs.knock.app/in-app-ui/react/notification-feed` — HTTP 404, 2026-11-15. The correct
  path is `/in-app-ui/react/feed`, which was reachable and is cited above.
- `https://docs.knock.app/in-app-ui/react/styling` — HTTP 404, 2026-11-15. No such page; styling is
  covered inside `/in-app-ui/react/feed`, which was used instead.
- `https://popper.js.org/docs/v2/constructors/` — HTTP 404, 2026-11-15. The `Placement` union was
  taken from the published type declaration of the exact declared dependency instead
  (`https://unpkg.com/@popperjs/core@2.11.8/lib/enums.d.ts`).
- `https://docs.knock.app/in-app-ui/react/sdk/reference` — reachable, but the page served no props
  tables to a plain fetch (it appears to render them client-side). Every prop quoted in this file
  was read from the published TypeScript source instead, which is the stronger source anyway.

## Gaps this research did not close

- **Pricing, quotas and commercial terms.** Out of scope here and in the survey; ADR 0013 notes they
  are "not discoverable from public pages" and that Novu is the fallback if they turn out
  unworkable.
- **Whether the in-app feed channel id is per-environment.** The setup sample reads it from an env
  var, which implies yes, but nothing read here states it.
- **The exact rendered HTML of a markdown body block.** `NotificationCell` injects
  `MarkdownContentBlock.rendered` verbatim; what tags Knock emits was not observable without a live
  account, and it determines how much CSS §2.3 actually needs.
