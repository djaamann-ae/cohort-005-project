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
