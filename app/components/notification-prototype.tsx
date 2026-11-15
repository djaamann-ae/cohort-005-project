/**
 * PROTOTYPE — throwaway. Not production code. No tests, no error handling.
 *
 * Question: what should the in-app notification surface look like in Cadence,
 * and how should it behave?  (wayfinder ticket #8)
 *
 * Three variants of the notification surface, switchable via `?notif=A|B|C`,
 * mounted inside the real sidebar so they are judged against real chrome.
 * A second axis, `?feed=empty|few|orphan`, swaps the feed contents, because
 * the empty state is the common case for most Students and deserves to be
 * looked at as hard as the populated one.
 *
 *   A — Nav item + popover panel   (closest to Knock's NotificationFeedPopover)
 *   B — Ambient inline list         (no overlay at all; lives in the rail)
 *   C — Dot indicator + full page   (see routes/notifications-prototype.tsx)
 *
 * Constraints these variants are built to honour, settled earlier on the map:
 *   - Read/unread only. No archive affordance, no seen-vs-read. (#4)
 *   - Notifications outlive what they point at, so an orphaned one must
 *     degrade gracefully rather than 404. (#4)
 *   - The actor shows on a reply and is deliberately absent on a refund
 *     decision, so the item design cannot assume every entry has a face. (#4)
 *   - Only two notification types exist. (#3)
 */
import { useEffect, useRef, useState } from "react";
import { NavLink, useSearchParams } from "react-router";
import { Bell, ChevronLeft, ChevronRight, MessageSquare, Receipt } from "lucide-react";
import { cn } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";

export type NotifVariant = "A" | "B" | "C";
export type FeedState = "empty" | "few" | "orphan";

export const VARIANT_NAMES: Record<NotifVariant, string> = {
  A: "Nav item + popover",
  B: "Ambient inline list",
  C: "Dot + full page",
};

export type PrototypeNotification = {
  id: string;
  kind: "reply" | "refund";
  read: boolean;
  when: string;
  /** Absent on refund decisions — deliberately. */
  actorName?: string;
  text: string;
  /** Null when the thing it pointed at is gone. */
  href: string | null;
  orphanNote?: string;
};

const REPLY: PrototypeNotification = {
  id: "n1",
  kind: "reply",
  read: false,
  when: "12m ago",
  actorName: "Sarah Chen",
  text: "Sarah Chen replied to your question on Conditional Types",
  href: "/courses/advanced-typescript/lessons/4",
};

const REFUND: PrototypeNotification = {
  id: "n2",
  kind: "refund",
  read: false,
  when: "2d ago",
  text: "Your refund for Advanced TypeScript was approved",
  href: "/settings",
};

const READ_REPLY: PrototypeNotification = {
  id: "n3",
  kind: "reply",
  read: true,
  when: "6d ago",
  actorName: "Marcus Johnson",
  text: "Marcus Johnson replied to your question on Generics in Practice",
  href: "/courses/advanced-typescript/lessons/2",
};

/** The course is gone — the Enrollment ended when the refund was approved. */
const ORPHAN: PrototypeNotification = {
  id: "n4",
  kind: "reply",
  read: false,
  when: "3w ago",
  actorName: "Priya Nair",
  text: "Priya Nair replied to your question on Testing Patterns",
  href: null,
  orphanNote: "You no longer have access to this course",
};

export function feedFor(state: FeedState): PrototypeNotification[] {
  if (state === "empty") return [];
  if (state === "orphan") return [ORPHAN, REFUND, READ_REPLY];
  return [REPLY, REFUND, READ_REPLY];
}

export function useNotifPrototype() {
  const [params] = useSearchParams();
  const raw = params.get("notif");
  const variant: NotifVariant | null =
    raw === "A" || raw === "B" || raw === "C" ? raw : null;
  const feedRaw = params.get("feed");
  const feed: FeedState =
    feedRaw === "empty" || feedRaw === "orphan" ? feedRaw : "few";
  return { variant, feed, active: variant !== null };
}

// ─── shared bits ───

function KindIcon({ kind }: { kind: PrototypeNotification["kind"] }) {
  return kind === "reply" ? (
    <MessageSquare className="size-4" />
  ) : (
    <Receipt className="size-4" />
  );
}

/**
 * One notification. Handles the three shapes that actually occur: with an
 * actor, without one, and orphaned.
 */
function NotificationRow({
  n,
  onClick,
}: {
  n: PrototypeNotification;
  onClick?: () => void;
}) {
  const body = (
    <div className="flex gap-3">
      <div className="relative shrink-0 pt-0.5">
        {n.actorName ? (
          <UserAvatar name={n.actorName} avatarUrl={null} />
        ) : (
          <div className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <KindIcon kind={n.kind} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm leading-snug",
            n.read ? "text-muted-foreground" : "font-medium"
          )}
        >
          {n.text}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{n.when}</span>
          {n.orphanNote && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {n.orphanNote}
            </span>
          )}
        </div>
      </div>
      {!n.read && (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
      )}
    </div>
  );

  // Orphaned: still clickable, but lands somewhere sensible instead of 404.
  const to = n.href ?? "/courses";
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={cn(
        "block px-4 py-3 transition-colors hover:bg-accent",
        !n.read && "bg-accent/40"
      )}
    >
      {body}
    </NavLink>
  );
}

function EmptyState({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 text-center",
        compact ? "py-8" : "py-16"
      )}
    >
      <Bell className="size-6 text-muted-foreground/40" />
      <p className="mt-3 text-sm font-medium">You're all caught up</p>
      <p className="mt-1 text-xs text-muted-foreground">
        We'll let you know when an instructor replies to a question, or when a
        refund is decided.
      </p>
    </div>
  );
}

// ─── Variant A: nav item + popover panel ───

export function VariantA({ feed }: { feed: FeedState }) {
  const items = feedFor(feed);
  const unread = items.filter((n) => !n.read).length;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          open
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <Bell className="size-4" />
        Notifications
        {unread > 0 && (
          <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold leading-none text-primary-foreground">
            {unread}
          </span>
        )}
      </button>

      {open && (
        // strategy:"fixed" equivalent — escapes the w-56 rail and its overflow
        <div className="fixed left-[14.5rem] top-32 z-50 w-[400px] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {/* No archive control, no "mark all as read" — read/unread only (#4). */}
          </div>
          <div className="max-h-[420px] divide-y overflow-y-auto">
            {items.length === 0 ? (
              <EmptyState compact />
            ) : (
              items.map((n) => (
                <NotificationRow key={n.id} n={n} onClick={() => setOpen(false)} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Variant B: ambient inline list, no overlay ───

export function VariantB({ feed }: { feed: FeedState }) {
  const items = feedFor(feed).slice(0, 3);
  const unread = feedFor(feed).filter((n) => !n.read).length;

  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="mb-2 flex items-center gap-2 px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
          Notifications
        </span>
        {unread > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-xs font-semibold leading-tight text-primary-foreground">
            {unread}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="px-3 py-2 text-xs text-sidebar-foreground/50">
          Nothing new. We'll tell you when an instructor replies.
        </p>
      ) : (
        <div className="space-y-1">
          {items.map((n) => (
            <NavLink
              key={n.id}
              to={n.href ?? "/courses"}
              className="block rounded-md px-3 py-2 transition-colors hover:bg-sidebar-accent"
            >
              <div className="flex items-start gap-2">
                {!n.read && (
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                )}
                <div className="min-w-0">
                  <div
                    className={cn(
                      "line-clamp-2 text-xs leading-snug",
                      n.read
                        ? "text-sidebar-foreground/50"
                        : "font-medium text-sidebar-foreground/90"
                    )}
                  >
                    {n.text}
                  </div>
                  <div className="mt-0.5 text-[10px] text-sidebar-foreground/40">
                    {n.when}
                    {n.orphanNote ? ` · ${n.orphanNote}` : ""}
                  </div>
                </div>
              </div>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Variant C: dot indicator only; the feed is a page ───

export function VariantC({ feed }: { feed: FeedState }) {
  const unread = feedFor(feed).filter((n) => !n.read).length;
  return (
    <NavLink
      to={`/notifications-prototype?notif=C&feed=${feed}`}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <span className="relative">
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-sidebar" />
        )}
      </span>
      Notifications
    </NavLink>
  );
}

/** Full-page list, used by the throwaway route. */
export function NotificationsPage({ feed }: { feed: FeedState }) {
  const items = feedFor(feed);
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Replies to your questions, and decisions on your refunds.
      </p>
      <div className="mt-6 overflow-hidden rounded-lg border">
        {items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="divide-y">
            {items.map((n) => (
              <NotificationRow key={n.id} n={n} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Floating switcher ───

const ORDER: NotifVariant[] = ["A", "B", "C"];
const FEEDS: FeedState[] = ["few", "empty", "orphan"];
const FEED_NAMES: Record<FeedState, string> = {
  few: "3 notifications",
  empty: "Empty feed",
  orphan: "Orphaned item",
};

export function NotifPrototypeSwitcher() {
  const [params, setParams] = useSearchParams();
  const { variant, feed, active } = useNotifPrototype();

  function setVariant(next: NotifVariant) {
    const p = new URLSearchParams(params);
    p.set("notif", next);
    p.set("feed", feed);
    setParams(p, { replace: true });
  }

  function cycle(dir: 1 | -1) {
    const i = ORDER.indexOf((variant ?? "A") as NotifVariant);
    setVariant(ORDER[(i + dir + ORDER.length) % ORDER.length]);
  }

  function cycleFeed() {
    const i = FEEDS.indexOf(feed);
    const p = new URLSearchParams(params);
    p.set("notif", variant ?? "A");
    p.set("feed", FEEDS[(i + 1) % FEEDS.length]);
    setParams(p, { replace: true });
  }

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!active) return null;
  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-yellow-400 bg-zinc-900 px-2 py-1.5 text-white shadow-2xl">
      <button
        onClick={() => cycle(-1)}
        className="rounded-full p-1.5 hover:bg-white/15"
        aria-label="Previous variant"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="px-2 text-xs font-semibold tabular-nums">
        PROTOTYPE · {variant} ({VARIANT_NAMES[variant as NotifVariant]})
      </span>
      <button
        onClick={() => cycle(1)}
        className="rounded-full p-1.5 hover:bg-white/15"
        aria-label="Next variant"
      >
        <ChevronRight className="size-4" />
      </button>
      <span className="mx-1 h-4 w-px bg-white/25" />
      <button
        onClick={cycleFeed}
        className="rounded-full px-2.5 py-1 text-xs font-medium hover:bg-white/15"
      >
        {FEED_NAMES[feed]}
      </button>
    </div>
  );
}
