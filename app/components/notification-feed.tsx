import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import type { FeedItem } from "@knocklabs/client";
import {
  KnockFeedProvider,
  KnockProvider,
  NotificationCell,
  type NotificationFeedProps,
  type RenderItemProps,
} from "@knocklabs/react";
import "@knocklabs/react/dist/index.css";
import { UserAvatar } from "~/components/user-avatar";
import { formatRelativeTime } from "~/lib/utils";

// ─── The Feed ───
// A Student's Notifications, newest first. Knock stores and delivers them
// (ADR 0013); the pieces here are the parts that are Cadence's — where a
// Notification points, who it is from, what an empty Feed says, and the
// providers that have to wait for hydration. The bell's panel and the full
// Feed page both render from here, so they cannot disagree.

/** Where the full Feed lives. */
export const NOTIFICATIONS_PATH = "/notifications";

/** The public Knock configuration a browser needs to render a Feed. */
export type KnockConfig = {
  publicApiKey: string;
  feedChannelId: string;
};

/** The parts of a Knock feed item these helpers read. */
type NotificationLike = Pick<FeedItem, "data" | "blocks">;

/**
 * Where clicking this Notification should take the Student, as an app-relative
 * path the router can navigate to.
 *
 * Cadence sends a bare path in the trigger's `data.actionUrl`. Knock's own
 * `action_url` block is that path pasted onto the Knock environment's
 * `app_url`, so it is a whole URL — of which only the path is ours to
 * navigate to. Null means there is nowhere to go.
 */
export function notificationPath(item: NotificationLike): string | null {
  const actionUrl = item.data?.actionUrl;

  if (typeof actionUrl === "string" && actionUrl.startsWith("/")) {
    return actionUrl;
  }

  const block = item.blocks.find((candidate) => candidate.name === "action_url");
  const rendered = block && "rendered" in block ? block.rendered : "";

  if (rendered.startsWith("/")) {
    return rendered;
  }

  try {
    const url = new URL(rendered);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/**
 * Where a click on this Notification lands, and why that is not where the
 * Notification pointed.
 *
 * A Notification outlives the thing it is about, and an old one can carry no
 * usable link at all. Doing nothing in that case leaves the Student clicking a
 * row that never moves — the dead end itself. The Feed is the honest fallback:
 * it is the record the Notification belongs to, and the reason says why they
 * are looking at it instead of an answer.
 */
export type NotificationTarget = {
  path: string;
  /** Null when the Notification took them where it pointed. */
  reason: string | null;
};

export function notificationTarget(item: NotificationLike): NotificationTarget {
  const path = notificationPath(item);

  if (path !== null) return { path, reason: null };

  return {
    path: NOTIFICATIONS_PATH,
    reason:
      "That notification doesn’t point anywhere we can open any more. Here’s your full feed instead.",
  };
}

/** Who the Notification is from, if anyone. */
export function notificationActorName(item: NotificationLike): string | null {
  const actorName = item.data?.actorName;

  return typeof actorName === "string" && actorName.length > 0
    ? actorName
    : null;
}

/**
 * The face on a Notification. Staff are never identified into Knock, so the
 * actor's name travels in the Notification's data and is drawn with Cadence's
 * own avatar. A refund decision has no actor at all — deliberately, because a
 * platform decision is not one Platform Admin's — so it gets a plain mark
 * instead of a face.
 */
export function NotificationActor({ item }: { item: NotificationLike }) {
  const actorName = notificationActorName(item);

  if (actorName) {
    return <UserAvatar name={actorName} avatarUrl={null} className="shrink-0" />;
  }

  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Bell className="size-4" aria-hidden="true" />
    </div>
  );
}

/**
 * One Notification in the Feed.
 *
 * Knock's cell is kept for the body, the unread dot and the timestamp, but two
 * of its parts are replaced: the actor comes from the Notification's data
 * rather than an identified Knock user, and the archive control is removed
 * outright — a Notification is a record, and a Student cannot delete their own
 * history.
 */
export function NotificationItem({
  item,
  onItemClick,
  onButtonClick,
  formatTimestamp,
}: RenderItemProps) {
  return (
    <NotificationCell
      item={item}
      onItemClick={onItemClick}
      onButtonClick={onButtonClick}
      formatTimestamp={formatTimestamp}
      avatar={<NotificationActor item={item} />}
      archiveButton={null}
    />
  );
}

/** What a Student with nothing in their Feed is told. */
export function NotificationsEmptyState({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "flex flex-col items-center justify-center px-6 py-8 text-center"
          : "flex flex-col items-center justify-center px-6 py-16 text-center"
      }
    >
      <Bell className="size-6 text-muted-foreground/40" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium">You&rsquo;re all caught up</p>
      <p className="mt-1 text-xs text-muted-foreground">
        We&rsquo;ll let you know when staff reply to one of your questions, or
        when a refund is decided.
      </p>
    </div>
  );
}

/** True once the browser has taken over from the server-rendered page. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  return hydrated;
}

/**
 * Cadence's theme is a `.dark` class on the document; Knock's is a prop. They
 * are separate switches, so watch the class and drive Knock's from it —
 * including when the Student toggles the theme.
 */
export function useDarkMode(): boolean {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setIsDark(root.classList.contains("dark"));

    read();

    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  return isDark;
}

/**
 * Knock's client, wrapped around whatever renders a Feed.
 *
 * It stays idle until the page has hydrated: the provider builds its auth
 * options while rendering, server pass included, so there is nothing to
 * connect with until the browser has the page. Only the Student receiving the
 * Notifications is ever identified into Knock, and their name travels with the
 * trigger, so nothing but the id is needed here.
 */
export function NotificationProviders({
  config,
  userId,
  children,
}: {
  config: KnockConfig;
  userId: number;
  children: ReactNode;
}) {
  const hydrated = useHydrated();
  const isDark = useDarkMode();

  return (
    <KnockProvider
      apiKey={config.publicApiKey}
      user={{ id: String(userId) }}
      enabled={hydrated}
    >
      <KnockFeedProvider
        feedId={config.feedChannelId}
        colorMode={isDark ? "dark" : "light"}
      >
        {children}
      </KnockFeedProvider>
    </KnockProvider>
  );
}

/**
 * How Cadence renders and reacts to a Feed, for Knock's feed components.
 *
 * Clicking a Notification goes through the router rather than Knock's own full
 * page assign. Knock's cell marks the Notification read before it calls this,
 * so the navigation runs after the read-tracking rather than instead of it.
 *
 * Every click goes somewhere. One that cannot reach what it was about says so
 * and lands on the Feed, because a row that swallows the click is the dead end.
 */
export function useNotificationFeedProps({
  onNavigate,
}: {
  /** Called when a click is about to navigate — the panel closes on it. */
  onNavigate?: () => void;
} = {}): NotificationFeedProps {
  const navigate = useNavigate();

  const onNotificationClick = useCallback(
    (item: FeedItem) => {
      onNavigate?.();

      const { path, reason } = notificationTarget(item);

      if (reason) toast.info(reason);

      navigate(path);
    },
    [navigate, onNavigate]
  );

  return {
    renderItem: (props) => <NotificationItem key={props.item.id} {...props} />,
    onNotificationClick,
    EmptyComponent: <NotificationsEmptyState compact />,
    formatTimestamp: (timestamp) => formatRelativeTime(timestamp),
  };
}
