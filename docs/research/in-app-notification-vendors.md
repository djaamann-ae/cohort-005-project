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
