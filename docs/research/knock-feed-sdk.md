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
